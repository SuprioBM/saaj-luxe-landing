import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { validateSslCommerzTransaction } from "@/lib/payments/sslcommerz";

type Action = "success" | "fail" | "cancel" | "ipn";
const ACTIONS: Action[] = ["success", "fail", "cancel", "ipn"];

function respond(action: Action, reference: string | null, status: string, token: string | null): Response {
  if (action === "ipn") {
    return new Response(JSON.stringify({ ok: true, status }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (!reference) {
    return new Response(null, { status: 303, headers: { Location: `/checkout?payment=${status}` } });
  }
  const qs = new URLSearchParams({ payment: status });
  if (token) qs.set("token", token);
  return new Response(null, { status: 303, headers: { Location: `/order/${reference}?${qs.toString()}` } });
}

async function handle(action: Action, request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // The raw guest token was embedded (as `t`) in the callback URLs at
  // session-init time (src/lib/payments/sslcommerz.ts) — SSLCommerz
  // preserves query strings on the URLs it posts back to, so it survives
  // the round trip. Absent for signed-in checkouts.
  const token = new URL(request.url).searchParams.get("t");

  let reference = "";
  let valId: string | null = null;
  try {
    const form = await request.formData();
    reference = String(form.get("tran_id") ?? "");
    valId = form.get("val_id") ? String(form.get("val_id")) : null;
  } catch {
    // Some browsers hit these URLs with no body (e.g. direct GET-as-POST edge
    // cases) — fall through to the "missing reference" response below.
  }

  if (!reference) {
    return respond(action, null, "missing_reference", token);
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, reference, total")
    .eq("reference", reference)
    .maybeSingle();

  if (!order) {
    return respond(action, null, "order_not_found", token);
  }

  if (action === "cancel") {
    if (["pending", "processing", "paid"].includes(order.status)) {
      await supabaseAdmin.rpc("cancel_order", { p_order_id: order.id, p_reason: "cancelled_at_gateway" });
    }
    return respond(action, order.reference, "cancelled", token);
  }

  if (action === "fail") {
    if (["pending", "processing", "paid"].includes(order.status)) {
      await supabaseAdmin.rpc("cancel_order", { p_order_id: order.id, p_reason: "payment_failed" });
    }
    return respond(action, order.reference, "failed", token);
  }

  // success + ipn: never trust the redirect/ping itself — SSLCommerz doesn't
  // sign these, so the Order Validation API call is the real verification
  // step (equivalent to a webhook signature check).
  if (!valId) {
    return respond(action, order.reference, "missing_val_id", token);
  }

  if (order.status === "paid") {
    // Already finalized by an earlier IPN/success hit — idempotent no-op.
    return respond(action, order.reference, "paid", token);
  }

  const verification = await validateSslCommerzTransaction(valId);
  if (!verification.valid || verification.tranId !== order.reference) {
    return respond(action, order.reference, "verification_failed", token);
  }
  if (verification.amount !== null && Math.abs(verification.amount - Number(order.total)) > 1) {
    console.error("[sslcommerz] amount mismatch", {
      reference: order.reference,
      expected: order.total,
      got: verification.amount,
    });
    return respond(action, order.reference, "amount_mismatch", token);
  }

  const { error } = await supabaseAdmin.rpc("finalize_order_paid", {
    p_order_id: order.id,
    p_provider: "sslcommerz",
    p_transaction_id: valId,
    p_raw_event: verification.raw as never,
  });
  if (error) {
    console.error("[sslcommerz] finalize_order_paid failed", error);
    return respond(action, order.reference, "finalize_failed", token);
  }

  // Payment is now authoritative-confirmed — send the confirmation email.
  // Best-effort: a failed send must never fail the webhook (the payment
  // already succeeded and must not be reprocessed/rolled back over this).
  try {
    const { data: full } = await supabaseAdmin
      .from("orders")
      .select(
        "reference,customer_name,customer_email,subtotal,discount,shipping,total,shipping_address,order_items(product_name,size,qty,unit_price)",
      )
      .eq("id", order.id)
      .maybeSingle();
    if (full?.customer_email) {
      const { sendOrderConfirmationEmail } = await import("@/lib/email/send");
      const siteUrl = (process.env.VITE_SITE_URL || process.env.SITE_URL || "http://localhost:8080").replace(
        /\/$/,
        "",
      );
      const qs = new URLSearchParams();
      if (token) qs.set("token", token);
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
    }
  } catch (emailErr) {
    console.error("[sslcommerz] confirmation email failed (order still paid)", emailErr);
  }

  return respond(action, order.reference, "paid", token);
}

export const Route = createFileRoute("/api/public/payments/sslcommerz/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const action = params.action as Action;
        if (!ACTIONS.includes(action)) {
          return new Response("Not found", { status: 404 });
        }
        try {
          return await handle(action, request);
        } catch (err) {
          console.error("[sslcommerz webhook]", err);
          return action === "ipn"
            ? new Response(JSON.stringify({ ok: false }), { status: 500 })
            : new Response(null, { status: 303, headers: { Location: "/checkout?payment=error" } });
        }
      },
      GET: async () => new Response(null, { status: 303, headers: { Location: "/" } }),
    },
  },
});
