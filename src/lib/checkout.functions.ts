import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { initPortPosInvoice } from "@/lib/payments/portpos";
import { checkoutSchema } from "@/lib/schemas";
import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";
import { assertRateLimit } from "@/lib/mw/rateLimit";
import { generateGuestToken, hashGuestToken } from "@/lib/mw/guestToken";
import { sendOrderConfirmationForOrder } from "@/lib/email/orderConfirmation";

const guestItemSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(20),
});

const initiateCheckoutSchema = checkoutSchema.extend({
  // Only used for guests — an authenticated caller's DB cart is always the
  // source of truth, this field is ignored when context.userId is set.
  guestItems: z.array(guestItemSchema).max(50).optional(),
});

function friendlyPlaceOrderError(message: string): string {
  if (message.includes("INSUFFICIENT_STOCK"))
    return "One of the pieces in your bag just sold out. Please review your bag.";
  if (message.includes("PRODUCT_UNAVAILABLE") || message.includes("PRODUCT_NOT_FOUND"))
    return "One of the pieces in your bag is no longer available.";
  if (message.includes("INVALID_COUPON")) return "That coupon code isn't valid.";
  if (message.includes("COUPON_EXPIRED")) return "That coupon has expired.";
  if (message.includes("COUPON_MIN_SUBTOTAL")) return "Your bag doesn't meet this coupon's minimum spend.";
  if (message.includes("COUPON_LIMIT_REACHED")) return "That coupon has reached its usage limit.";
  if (message.includes("COUPON_ALREADY_USED")) return "You've already used that coupon.";
  if (message.includes("EMPTY_CART")) return "Your bag is empty.";
  if (message.includes("INVALID_PAYMENT_METHOD")) return "Please choose a payment method.";
  return "We couldn't place your order. Please try again.";
}

export const initiateCheckout = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .validator(initiateCheckoutSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const identifier = context.userId ?? data.customer.email.toLowerCase();
    await assertRateLimit(supabaseAdmin, "checkout", identifier, 8, 10);

    let items: { variantId: string; qty: number }[];
    if (context.userId) {
      const { data: cart } = await supabaseAdmin
        .from("carts")
        .select("id, cart_items(variant_id, qty)")
        .eq("user_id", context.userId)
        .maybeSingle();
      items = (cart?.cart_items ?? []).map((i: { variant_id: string; qty: number }) => ({
        variantId: i.variant_id,
        qty: i.qty,
      }));
    } else {
      items = data.guestItems ?? [];
    }

    if (items.length === 0) {
      throw new Error("Your bag is empty.");
    }

    // Every order — guest or signed-in — gets a secure random tracking
    // token; only its hash is stored (place_order writes it to
    // guest_access_token_hash). The raw value goes into the payment gateway
    // callback URLs so it survives the round trip, and later into the
    // confirmation email link. This must not be skipped for signed-in
    // checkouts: the email is routinely opened in a context with no
    // Supabase session at all (another device, another browser, Gmail's
    // in-app browser), so session-based auth alone can't authorize that
    // link — the token is what makes tracking work independently of login.
    const guestToken = await generateGuestToken();
    const guestTokenHash = await hashGuestToken(guestToken);

    const { data: result, error } = await supabaseAdmin.rpc("place_order", {
      p_user_id: context.userId,
      p_customer: data.customer,
      p_shipping_address: data.shippingAddress,
      p_billing_address: null,
      p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
      p_coupon_code: data.couponCode || null,
      p_guest_token_hash: guestTokenHash,
      p_payment_method: data.paymentMethod,
    });

    if (error || !result) {
      throw new Error(friendlyPlaceOrderError(error?.message ?? ""));
    }

    const order = result as { order_id: string; reference: string; total: number };

    if (context.userId) {
      const { data: cart } = await supabaseAdmin
        .from("carts")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (cart) await supabaseAdmin.from("cart_items").delete().eq("cart_id", cart.id);
    }

    // Cash on Delivery: the order created above (place_order already
    // committed real stock for COD lines, see the migration) is the whole
    // transaction — no gateway, no redirect, payment stays unpaid until an
    // admin marks it collected on delivery. Nothing left to wait on, so the
    // confirmation email goes out now (mirrors what the PortPos webhook
    // does after a verified payment).
    if (data.paymentMethod === "cod") {
      await sendOrderConfirmationForOrder(supabaseAdmin, order.order_id, guestToken);
      return {
        reference: order.reference,
        total: order.total,
        gatewayUrl: null,
        guestToken, // always set — see comment above
      };
    }

    try {
      const session = await initPortPosInvoice({
        orderId: order.order_id,
        reference: order.reference,
        amount: order.total,
        customer: data.customer,
        address: data.shippingAddress,
        guestToken: guestToken ?? undefined,
      });

      await supabaseAdmin
        .from("payments")
        .update({ gateway_session_id: session.invoiceId })
        .eq("order_id", order.order_id);

      return {
        reference: order.reference,
        total: order.total,
        gatewayUrl: session.gatewayUrl,
        guestToken, // always set — see comment above
      };
    } catch (gatewayError) {
      // Order + reservation already exist; release them rather than leaving a
      // stuck "pending" order the customer can never pay for.
      await supabaseAdmin.rpc("cancel_order", {
        p_order_id: order.order_id,
        p_reason: "gateway_init_failed",
      });
      throw gatewayError instanceof Error
        ? gatewayError
        : new Error("Could not reach the payment gateway. Please try again.");
    }
  });
