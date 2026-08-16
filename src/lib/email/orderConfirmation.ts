import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Shared by both places an order becomes "the customer's problem is now
 * solved" — COD (immediately after place_order, since there's no gateway
 * step to wait for) and PortPos (only after finalize_order_paid, i.e. a
 * verified payment). Server-only; dynamic-imports nodemailer transitively
 * via `@/lib/email/send`, so it's safe to import from a `*.functions.ts`
 * file as long as the import itself stays inside a handler closure.
 *
 * Best-effort: a failed send is logged and swallowed here too — the caller
 * never has to wrap this in its own try/catch.
 */
export async function sendOrderConfirmationForOrder(
  supabaseAdmin: SupabaseClient<Database>,
  orderId: string,
  guestToken?: string | null,
): Promise<void> {
  try {
    const { data: full } = await supabaseAdmin
      .from("orders")
      .select(
        "reference,customer_name,customer_email,subtotal,discount,shipping,total,shipping_address,order_items(product_name,size,qty,unit_price)",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!full?.customer_email) return;

    const { sendOrderConfirmationEmail } = await import("@/lib/email/send");
    const siteUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
      /\/$/,
      "",
    );
    const qs = new URLSearchParams();
    if (guestToken) qs.set("token", guestToken);
    const trackingUrl = `${siteUrl}/order/${full.reference}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const addr = full.shipping_address as { line1?: string; city?: string; state?: string; pincode?: string } | null;

    await sendOrderConfirmationEmail({
      to: full.customer_email,
      customerName: full.customer_name,
      reference: full.reference,
      items: (full.order_items ?? []).map((i) => ({
        name: i.product_name,
        size: i.size,
        qty: i.qty,
        unitPrice: Number(i.unit_price),
      })),
      subtotal: Number(full.subtotal),
      discount: Number(full.discount),
      shipping: Number(full.shipping),
      total: Number(full.total),
      shippingAddress: {
        line1: addr?.line1 ?? "",
        city: addr?.city ?? "",
        state: addr?.state ?? "",
        pincode: addr?.pincode ?? "",
      },
      trackingUrl,
    });
  } catch (err) {
    console.error("[orderConfirmation] send failed (order still placed/paid)", err);
  }
}
