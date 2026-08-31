import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { validateBkashTransaction } from "@/lib/payments/bkash";

// bKash redirects the browser back to our callbackURL (given bare, with no
// query string, at payment-creation time — see src/lib/payments/bkash.ts)
// with exactly two params appended: paymentID and status
// (success | failure | cancel). There's no separate server-to-server IPN
// leg the way PortPos had — this single browser-facing hit is the only
// callback bKash makes. The *paid* decision never comes from `status`
// alone: it only gates whether we bother calling bKash's own query/execute
// endpoints, which are the actual source of truth (validateBkashTransaction).
//
// The order is found by `paymentID` (payments.gateway_session_id), not by
// anything we tried to embed in the URL ourselves — a query string we
// appended to callbackURL isn't guaranteed to survive bKash's own
// `?paymentID=&status=` append. Any guest tracking token needed for the
// redirect/confirmation email travels the same way: stashed on the
// payments row at checkout time (payments.guest_token), read back here.
function redirectTo(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

async function handle(request: Request): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const url = new URL(request.url);
  const paymentID = url.searchParams.get("paymentID");
  // bKash's own status hint on the redirect — UX/routing only, never the
  // basis for marking anything paid on its own.
  const statusHint = url.searchParams.get("status");

  if (!paymentID) {
    return redirectTo("/checkout?payment=missing_reference");
  }

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, order_id, guest_token")
    .eq("gateway_session_id", paymentID)
    .maybeSingle();

  if (!payment) {
    return redirectTo("/checkout?payment=order_not_found");
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, reference, total, payment_method")
    .eq("id", payment.order_id)
    .maybeSingle();

  if (!order || order.payment_method !== "bkash") {
    return redirectTo("/checkout?payment=order_not_found");
  }

  const guestToken = payment.guest_token as string | null;
  // One-shot — clear it now so it doesn't sit in the database any longer
  // than it has to; everything below that needs it already has it in hand.
  if (guestToken) {
    await supabaseAdmin.from("payments").update({ guest_token: null }).eq("id", payment.id);
  }

  const orderUrl = (status: string) => {
    const qs = new URLSearchParams({ payment: status });
    if (guestToken) qs.set("token", guestToken);
    return `/order/${order.reference}?${qs.toString()}`;
  };

  if (order.status === "paid") {
    // Already finalized by an earlier hit on this same callback — idempotent no-op.
    return redirectTo(orderUrl("paid"));
  }

  if (statusHint && statusHint !== "success") {
    // Customer explicitly failed/cancelled at bKash — release the
    // reservation, same as an unverified "return" leg would for PortPos.
    if (["pending", "processing"].includes(order.status)) {
      await supabaseAdmin.rpc("cancel_order", {
        p_order_id: order.id,
        p_reason: statusHint === "cancel" ? "cancelled_at_gateway" : "payment_failed",
      });
    }
    return redirectTo(orderUrl(statusHint === "cancel" ? "cancelled" : "failed"));
  }

  const verification = await validateBkashTransaction(
    paymentID,
    Number(order.total),
    order.reference,
  );

  if (verification.valid) {
    const { error } = await supabaseAdmin.rpc("finalize_order_paid", {
      p_order_id: order.id,
      p_provider: "bkash",
      p_transaction_id: verification.trxId ?? paymentID,
      p_raw_event: verification.raw as never,
    });
    if (error) {
      console.error("[bkash] finalize_order_paid failed", error);
      return redirectTo(orderUrl("finalize_failed"));
    }

    // Payment is now authoritative-confirmed — send the confirmation email
    // (best-effort internally; never throws over a payment that already
    // succeeded and must not be reprocessed/rolled back).
    const { sendOrderConfirmationForOrder } = await import("@/lib/email/orderConfirmation");
    await sendOrderConfirmationForOrder(supabaseAdmin, order.id, guestToken);

    return redirectTo(orderUrl("paid"));
  }

  // Not (yet) verifiably paid, and bKash didn't report an explicit
  // failure/cancel — leave the order/reservation alone rather than
  // cancelling out from under a payment that might still be in flight.
  console.error("[bkash] verification did not confirm payment", {
    reference: order.reference,
    paymentID,
    expectedAmount: order.total,
    statusHint,
  });

  return redirectTo(orderUrl("verification_failed"));
}

export const Route = createFileRoute("/api/public/payments/bkash/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await handle(request);
        } catch (err) {
          console.error("[bkash callback]", err);
          return redirectTo("/checkout?payment=error");
        }
      },
      POST: async ({ request }) => {
        try {
          return await handle(request);
        } catch (err) {
          console.error("[bkash callback]", err);
          return redirectTo("/checkout?payment=error");
        }
      },
    },
  },
});
