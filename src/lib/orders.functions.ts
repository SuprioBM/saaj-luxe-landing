import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { optionalSupabaseAuth } from "@/lib/mw/optionalAuth";
import { verifyGuestToken, generateGuestToken, hashGuestToken } from "@/lib/mw/guestToken";
import { assertRateLimit } from "@/lib/mw/rateLimit";
import { guestCancelOrderSchema, orderTokenLookupSchema, resendTrackingLinkSchema } from "@/lib/schemas";

/** Cancellable while awaiting/just past payment, not once fulfillment has
 * physically started moving. Single source of truth for the frontend hint —
 * the `cancel_order` SQL function enforces the same set independently. */
const CANCELLABLE_STATUSES = ["pending", "processing", "paid"] as const;

export type OrderSummary = {
  id: string;
  reference: string;
  status: string;
  placedAt: string;
  total: number;
  itemCount: number;
};

export type OrderItem = {
  id: string;
  name: string;
  slug: string;
  size: string;
  image: string | null;
  qty: number;
  unitPrice: number;
};

export type OrderDetail = {
  id: string;
  reference: string;
  status: string;
  placedAt: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  shippingAddress: Json;
  paymentStatus: string | null;
  courier: string | null;
  shipmentTrackingNumber: string | null;
  canCancel: boolean;
  isGuest: boolean;
  items: OrderItem[];
};

type OrderItemRow = {
  id: string;
  product_name: string;
  product_slug: string;
  size: string;
  image_url: string | null;
  qty: number;
  unit_price: number;
};

const ORDER_DETAIL_SELECT =
  "id,reference,status,placed_at,total,subtotal,discount,shipping,tax,customer_name,customer_email,customer_phone,shipping_address,user_id,courier,shipment_tracking_number,guest_access_token_hash,order_items(id,product_name,product_slug,size,image_url,qty,unit_price),payments(status)";

function toDetail(order: {
  id: string;
  reference: string;
  status: string;
  placed_at: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: Json;
  user_id: string | null;
  courier: string | null;
  shipment_tracking_number: string | null;
  order_items: OrderItemRow[];
  payments: { status: string }[];
}): OrderDetail {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    placedAt: order.placed_at,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    shipping: Number(order.shipping),
    tax: Number(order.tax),
    total: Number(order.total),
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    customerPhone: order.customer_phone,
    shippingAddress: order.shipping_address,
    paymentStatus: order.payments?.[0]?.status ?? null,
    courier: order.courier,
    shipmentTrackingNumber: order.shipment_tracking_number,
    canCancel: (CANCELLABLE_STATUSES as readonly string[]).includes(order.status),
    isGuest: !order.user_id,
    items: (order.order_items ?? []).map((i) => ({
      id: i.id,
      name: i.product_name,
      slug: i.product_slug,
      size: i.size,
      image: i.image_url,
      qty: i.qty,
      unitPrice: Number(i.unit_price),
    })),
  };
}

export const listMyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrderSummary[]> => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id,reference,status,placed_at,total,order_items(id)")
      .eq("user_id", context.userId)
      .order("placed_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as { id: string; reference: string; status: string; placed_at: string; total: number; order_items: { id: string }[] }[]).map(
      (o) => ({
        id: o.id,
        reference: o.reference,
        status: o.status,
        placedAt: o.placed_at,
        total: Number(o.total),
        itemCount: (o.order_items ?? []).length,
      }),
    );
  });

export const listMyOrdersDetailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrderDetail[]> => {
    const { data, error } = await context.supabase
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("user_id", context.userId)
      .order("placed_at", { ascending: false });
    if (error) throw error;
    return (data as unknown as Parameters<typeof toDetail>[0][]).map(toDetail);
  });

/**
 * Guest orders (user_id null) have no RLS access path at all — by design,
 * `orders` grants nothing to `anon`. Access is independently authorized
 * here in three possible ways, checked in order:
 *   1. Signed in and owns the order.
 *   2. Signed in and staff.
 *   3. A guest access token that hashes to the order's stored hash.
 * A wrong/missing token, or a token for a *different* order, is rejected —
 * the hash is compared against *this specific order's* column, so a valid
 * token never grants access to another order (no IDOR).
 */
export const getOrderByReference = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .validator(orderTokenLookupSchema)
  .handler(async ({ data, context }): Promise<OrderDetail> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertRateLimit(
      supabaseAdmin,
      "order_lookup",
      context.userId ?? `guest:${data.reference}`,
      20,
      5,
    );

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw error;
    // Same generic message whether the order doesn't exist or access is
    // denied — never confirm/deny existence of an order to an unauthorized
    // caller (spec: no information leak on invalid token).
    const denied = () => new Error("We couldn't find that order. Check your tracking link and try again.");
    if (!order) throw denied();

    let allowed = false;
    if (context.userId && order.user_id === context.userId) {
      allowed = true;
    } else if (context.userId) {
      const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
      allowed = Boolean(staff);
    }
    if (!allowed && !order.user_id && data.token) {
      allowed = await verifyGuestToken(data.token, order.guest_access_token_hash);
    }
    if (!allowed) throw denied();

    return toDetail(order as never);
  });

async function loadOrderForCancel(supabaseAdmin: SupabaseClient<Database>, reference: string) {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id,status,user_id,customer_name,customer_email,total,guest_access_token_hash,reference")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * One cancellation entry point for both signed-in and guest customers.
 * Re-validates everything server-side regardless of what the UI showed —
 * ownership/token, current status, and cancellability — then delegates the
 * actual state change to the atomic `cancel_order` RPC (same function admin
 * cancellation and payment-failure paths use, so inventory correctness has
 * exactly one code path).
 */
export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .validator(guestCancelOrderSchema)
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const identifier = context.userId ?? `guest:${data.reference}`;
    await assertRateLimit(supabaseAdmin, "cancel_order", identifier, 6, 15);

    const order = await loadOrderForCancel(supabaseAdmin, data.reference);
    const denied = () => new Error("We couldn't find that order.");
    if (!order) throw denied();

    let allowed = false;
    if (context.userId && order.user_id === context.userId) allowed = true;
    if (!allowed && !order.user_id && data.token) {
      allowed = await verifyGuestToken(data.token, order.guest_access_token_hash);
    }
    if (!allowed) throw denied();

    if (!(CANCELLABLE_STATUSES as readonly string[]).includes(order.status)) {
      throw new Error(
        "This order can no longer be cancelled — it may have already been shipped or processed.",
      );
    }

    const wasPaid = order.status === "paid" || order.status === "processing";
    const reasonLabels: Record<string, string> = {
      changed_mind: "Changed my mind",
      ordered_by_mistake: "Ordered by mistake",
      found_better_price: "Found a better price",
    };
    const reasonLabel = (data.reason && reasonLabels[data.reason]) || "Cancelled by customer";

    const { error: rpcErr } = await supabaseAdmin.rpc("cancel_order", {
      p_order_id: order.id,
      p_reason: reasonLabel,
    });
    if (rpcErr) {
      // The order's status could have moved on (e.g. just shipped) between
      // our check above and this call — cancel_order re-checks atomically
      // under a row lock and raises ORDER_NOT_CANCELLABLE if so.
      if (rpcErr.message.includes("ORDER_NOT_CANCELLABLE")) {
        throw new Error(
          "This order can no longer be cancelled — it may have already been shipped or processed.",
        );
      }
      throw new Error("Could not cancel this order. Please try again.");
    }

    try {
      const { sendOrderCancelledEmail } = await import("@/lib/email/send");
      const siteUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
        /\/$/,
        "",
      );
      const qs = !order.user_id && data.token ? `?token=${encodeURIComponent(data.token)}` : "";
      await sendOrderCancelledEmail({
        to: order.customer_email,
        customerName: order.customer_name,
        reference: order.reference,
        total: Number(order.total),
        paymentCaptured: wasPaid,
        trackingUrl: `${siteUrl}/order/${order.reference}${qs}`,
      });
    } catch (emailErr) {
      console.error("[cancelOrder] cancellation email failed (order still cancelled)", emailErr);
    }

    return { status: "cancelled" };
  });

/**
 * Lost-link recovery: order number + email verifies ownership of a guest
 * order, then a *new* token is issued (invalidating the old one — the raw
 * value was never recoverable anyway, only its hash was stored) and mailed.
 * Never reveals order details directly from this endpoint.
 */
export const resendGuestTrackingLink = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .validator(resendTrackingLinkSchema)
  .handler(async ({ data }): Promise<{ sent: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertRateLimit(supabaseAdmin, "resend_tracking_link", data.email.toLowerCase(), 5, 30);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,reference,customer_email,user_id")
      .eq("reference", data.reference)
      .maybeSingle();

    // Always return the same shape whether or not it matched, so this
    // endpoint can't be used to probe which order numbers/emails exist.
    if (!order || order.user_id || order.customer_email.toLowerCase() !== data.email.trim().toLowerCase()) {
      return { sent: false };
    }

    const rawToken = await generateGuestToken();
    const hash = await hashGuestToken(rawToken);
    await supabaseAdmin.from("orders").update({ guest_access_token_hash: hash }).eq("id", order.id);

    const siteUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(/\/$/, "");
    const { sendTrackingLinkEmail } = await import("@/lib/email/send");
    const emailed = await sendTrackingLinkEmail({
      to: order.customer_email,
      reference: order.reference,
      trackingUrl: `${siteUrl}/order/${order.reference}?token=${encodeURIComponent(rawToken)}`,
    });

    return { sent: emailed };
  });
