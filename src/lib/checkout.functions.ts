import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { initSslCommerzSession } from "@/lib/payments/sslcommerz";
import { checkoutSchema } from "@/lib/schemas";
import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";
import { assertRateLimit } from "@/lib/mw/rateLimit";
import { generateGuestToken, hashGuestToken } from "@/lib/mw/guestToken";

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

    // Guest orders get a secure random access token — only its hash is
    // stored (place_order writes it to guest_access_token_hash); the raw
    // value goes into the payment gateway callback URLs so it survives the
    // round trip, and later into the confirmation email link. Signed-in
    // checkouts don't need one — they're authorized by their session.
    const guestToken = context.userId ? null : await generateGuestToken();
    const guestTokenHash = guestToken ? await hashGuestToken(guestToken) : null;

    const { data: result, error } = await supabaseAdmin.rpc("place_order", {
      p_user_id: context.userId,
      p_customer: data.customer,
      p_shipping_address: data.shippingAddress,
      p_billing_address: null,
      p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })),
      p_coupon_code: data.couponCode || null,
      p_guest_token_hash: guestTokenHash,
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

    try {
      const session = await initSslCommerzSession({
        orderId: order.order_id,
        reference: order.reference,
        amount: order.total,
        customer: data.customer,
        address: data.shippingAddress,
        guestToken: guestToken ?? undefined,
      });

      await supabaseAdmin
        .from("payments")
        .update({ gateway_session_id: session.sessionKey })
        .eq("order_id", order.order_id);

      return {
        reference: order.reference,
        total: order.total,
        gatewayUrl: session.gatewayUrl,
        guestToken, // null for signed-in checkouts
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
