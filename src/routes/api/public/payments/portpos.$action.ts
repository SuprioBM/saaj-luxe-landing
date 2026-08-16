import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { validatePortPosTransaction } from "@/lib/payments/portpos";

// PortPos only ever hits two URLs (unlike SSLCommerz's separate success/
// fail/cancel legs): the browser `redirect_url` after the customer leaves
// the payment page ("return"), and the server-to-server `ipn_url` ("ipn").
// Both were given the same `?ref=&t=` query string at invoice-creation time
// (src/lib/payments/portpos.ts) — that survives round trip regardless of
// whatever params PortPos itself appends, so it's the one thing this
// handler actually trusts to find the order. The *paid* decision never
// comes from anything in the incoming request — only from calling PortPos's
// own verification endpoint back with the amount we expect.
type Action = "return" | "ipn";
const ACTIONS: Action[] = ["return", "ipn"];

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

  const url = new URL(request.url);
  const reference = url.searchParams.get("ref");
  const token = url.searchParams.get("t");
  // PortPos's own status hint on the browser return leg — UX only, never
  // the basis for marking anything paid or cancelled on its own.
  const statusHint = url.searchParams.get("status");

  if (!reference) {
    return respond(action, null, "missing_reference", token);
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, reference, total, payment_method, payments(id, gateway_session_id, status)")
    .eq("reference", reference)
    .maybeSingle();

  if (!order || order.payment_method !== "portpos") {
    return respond(action, null, "order_not_found", token);
  }

  if (order.status === "paid") {
    // Already finalized by an earlier return/IPN hit — idempotent no-op.
    return respond(action, order.reference, "paid", token);
  }

  const payment = (order.payments ?? [])[0] as { id: string; gateway_session_id: string | null } | undefined;
  const invoiceId = payment?.gateway_session_id;
  if (!invoiceId) {
    console.error("[portpos] no invoice id stored for order", { reference: order.reference });
    return respond(action, order.reference, "missing_invoice", token);
  }

  const verification = await validatePortPosTransaction(invoiceId, Number(order.total));

  if (verification.valid) {
    const { error } = await supabaseAdmin.rpc("finalize_order_paid", {
      p_order_id: order.id,
      p_provider: "portpos",
      p_transaction_id: invoiceId,
      p_raw_event: verification.raw as never,
    });
    if (error) {
      console.error("[portpos] finalize_order_paid failed", error);
      return respond(action, order.reference, "finalize_failed", token);
    }

    // Payment is now authoritative-confirmed — send the confirmation email
    // (best-effort internally; never throws over a payment that already
    // succeeded and must not be reprocessed/rolled back).
    const { sendOrderConfirmationForOrder } = await import("@/lib/email/orderConfirmation");
    await sendOrderConfirmationForOrder(supabaseAdmin, order.id, token);

    return respond(action, order.reference, "paid", token);
  }

  // Not (yet) verifiably paid. Only the browser "return" leg, with an
  // explicit non-success status from PortPos, actively releases the
  // reservation — a bare IPN ping that doesn't verify is left alone so a
  // payment that's still genuinely in flight (or whose IPN arrived before
  // the funds actually settled) isn't cancelled out from under the customer.
  console.error("[portpos] verification did not confirm payment", {
    reference: order.reference,
    expectedAmount: order.total,
    statusHint,
  });

  if (action === "return" && statusHint && statusHint !== "ACCEPTED" && ["pending", "processing"].includes(order.status)) {
    const cancelled = statusHint.toUpperCase().includes("CANCEL");
    await supabaseAdmin.rpc("cancel_order", {
      p_order_id: order.id,
      p_reason: cancelled ? "cancelled_at_gateway" : "payment_failed",
    });
    return respond(action, order.reference, cancelled ? "cancelled" : "failed", token);
  }

  return respond(action, order.reference, "verification_failed", token);
}

export const Route = createFileRoute("/api/public/payments/portpos/$action")({
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
          console.error("[portpos webhook]", err);
          return action === "ipn"
            ? new Response(JSON.stringify({ ok: false }), { status: 500 })
            : new Response(null, { status: 303, headers: { Location: "/checkout?payment=error" } });
        }
      },
      GET: async ({ request, params }) => {
        // PortPos's browser redirect_url is a GET in practice — handle it
        // the same way as POST rather than bouncing the customer to "/".
        const action = params.action as Action;
        if (!ACTIONS.includes(action)) {
          return new Response("Not found", { status: 404 });
        }
        try {
          return await handle(action, request);
        } catch (err) {
          console.error("[portpos webhook]", err);
          return action === "ipn"
            ? new Response(JSON.stringify({ ok: false }), { status: 500 })
            : new Response(null, { status: 303, headers: { Location: "/checkout?payment=error" } });
        }
      },
    },
  },
});
