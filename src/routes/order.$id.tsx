import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatBDT } from "@/data/catalog";
import { useAuth } from "@/lib/auth";
import { cancelOrder, getOrderByReference, resendGuestTrackingLink, type OrderDetail } from "@/lib/orders.functions";

const TITLE = "Order — SAAJ";
const DESCRIPTION = "Your SAAJ order status and delivery detail.";

export const Route = createFileRoute("/order/$id")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderPage,
});

function paymentBanner(payment: string | null) {
  if (!payment) return null;
  switch (payment) {
    case "paid":
      return { icon: CheckCircle2, tone: "text-saaj-champagne", text: "Payment received — thank you." };
    case "failed":
      return { icon: XCircle, tone: "text-destructive", text: "That payment attempt failed. You can try again from your bag." };
    case "cancelled":
      return { icon: XCircle, tone: "text-muted-foreground", text: "Payment was cancelled — your reservation has been released." };
    case "verification_failed":
    case "amount_mismatch":
      return { icon: XCircle, tone: "text-destructive", text: "We couldn't verify that payment. Please contact client care." };
    default:
      return { icon: Clock, tone: "text-muted-foreground", text: "Awaiting payment confirmation…" };
  }
}

// Display-only lifecycle order — independent of the DB enum's declaration
// order, and only using statuses the backend actually has.
const TIMELINE = [
  { key: "pending", label: "Order Placed" },
  { key: "paid", label: "Payment Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

function timelineIndex(status: string): number {
  const i = TIMELINE.findIndex((s) => s.key === status);
  // "processing"/"paid" etc. all imply every earlier step is also done;
  // pending itself is index 0 (an order that exists has, at minimum, been
  // placed).
  return i === -1 ? 0 : i;
}

function OrderPage() {
  const { id } = Route.useParams();
  const user = useAuth();
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    const fromSession = window.sessionStorage.getItem(`saaj.guest_token.${id}`);
    setToken(fromUrl || fromSession || null);
  }, [id]);

  const payment =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("payment") : null;

  const orderQuery = useQuery({
    queryKey: ["order", id, user?.id, token],
    queryFn: () => getOrderByReference({ data: { reference: id, token: token || undefined } }),
    retry: false,
    enabled: token !== undefined || Boolean(user),
  });

  const banner = paymentBanner(payment);
  const order = orderQuery.data;

  const refetch = () => void qc.invalidateQueries({ queryKey: ["order", id, user?.id, token] });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Order {id}</h1>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>

        {banner ? (
          <div className={`mt-8 flex items-center gap-3 text-xs ${banner.tone}`}>
            <banner.icon className="h-4 w-4" strokeWidth={1.25} />
            {banner.text}
          </div>
        ) : null}

        {orderQuery.isLoading || token === undefined ? (
          <div className="mt-16 saaj-skeleton h-64" />
        ) : !order ? (
          <NotFoundState orderId={id} />
        ) : (
          <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0">
              <p className="font-display text-3xl font-light leading-[1.1] md:text-4xl">
                Thank you, {order.customerName.split(" ")[0]}.
              </p>
              <p className="mt-4 max-w-md text-xs leading-relaxed text-muted-foreground">
                A confirmation has been sent to {order.customerEmail}. Every SAAJ order is
                hand-checked and packed before dispatch.
              </p>

              <StatusTimeline status={order.status} />

              {order.courier || order.shipmentTrackingNumber ? (
                <div className="mt-10 border border-saaj-line p-5 sm:p-6">
                  <p className="eyebrow">Shipment</p>
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">COURIER</p>
                      <p className="mt-1 text-sm">{order.courier ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">TRACKING NUMBER</p>
                      <p className="mt-1 text-sm">{order.shipmentTrackingNumber ?? "—"}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-8">
                {order.canCancel ? (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className="border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                  >
                    CANCEL ORDER
                  </button>
                ) : order.status === "cancelled" ? (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.25} />
                    Cancelled.
                    {order.paymentStatus === "succeeded"
                      ? " Your payment was captured — our team will process your refund manually."
                      : ""}
                  </div>
                ) : (
                  <p className="max-w-sm text-[0.6875rem] leading-relaxed text-muted-foreground">
                    Cancellation unavailable — this order has already been shipped or processed and can
                    no longer be cancelled.
                  </p>
                )}
              </div>

              <ul className="mt-10 flex flex-col gap-px bg-saaj-line">
                {order.items.map((item) => (
                  <li key={item.id} className="flex gap-5 bg-background py-5">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        loading="lazy"
                        className="h-24 w-20 shrink-0 object-cover"
                      />
                    ) : null}
                    <div className="flex flex-1 flex-col justify-center">
                      <span className="text-xs">{item.name}</span>
                      <span className="mt-2 text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
                        Size {item.size} — Qty {item.qty}
                      </span>
                    </div>
                    <span className="self-center text-xs text-saaj-champagne">
                      {formatBDT(item.unitPrice * item.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="h-fit border border-saaj-line p-6">
              <h2 className="eyebrow">Delivery</h2>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {String((order.shippingAddress as Record<string, unknown> | null)?.line1 ?? "")}
                <br />
                {String((order.shippingAddress as Record<string, unknown> | null)?.city ?? "")}
                {", "}
                {String((order.shippingAddress as Record<string, unknown> | null)?.state ?? "")}{" "}
                {String((order.shippingAddress as Record<string, unknown> | null)?.pincode ?? "")}
              </p>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <dl className="mt-6 flex flex-col gap-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatBDT(order.subtotal)}</dd>
                </div>
                {order.discount > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="text-saaj-champagne">−{formatBDT(order.discount)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{order.shipping === 0 ? "Complimentary" : formatBDT(order.shipping)}</dd>
                </div>
              </dl>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <div className="mt-6 flex items-baseline justify-between">
                <span className="eyebrow">Total</span>
                <span className="text-sm text-saaj-champagne">{formatBDT(order.total)}</span>
              </div>
              <Link to="/shop" className="rule-link mt-8">
                Continue shopping
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </aside>
          </div>
        )}
      </main>

      {order && cancelOpen ? (
        <CancelModal
          order={order}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false);
            refetch();
          }}
          token={token ?? undefined}
        />
      ) : null}

      <SiteFooter />
    </div>
  );
}

function StatusTimeline({ status }: { status: string }) {
  if (status === "cancelled" || status === "refunded") return null;
  const active = timelineIndex(status);
  return (
    <div className="mt-10 flex gap-1">
      {TIMELINE.map((s, i) => (
        <div key={s.key} className="flex-1">
          <div className={`h-px ${i <= active ? "bg-saaj-champagne" : "bg-saaj-line"}`} />
          <p
            className={`mt-3 text-[0.5rem] leading-tight tracking-[0.16em] sm:text-[0.5625rem] sm:tracking-[0.22em] ${
              i <= active ? "text-saaj-champagne" : "text-muted-foreground"
            }`}
          >
            {s.label.toUpperCase()}
          </p>
        </div>
      ))}
    </div>
  );
}

const REASONS: { value: "changed_mind" | "ordered_by_mistake" | "found_better_price" | "other"; label: string }[] = [
  { value: "changed_mind", label: "Changed my mind" },
  { value: "ordered_by_mistake", label: "Ordered by mistake" },
  { value: "found_better_price", label: "Found a better price" },
  { value: "other", label: "Other" },
];

function CancelModal({
  order,
  token,
  onClose,
  onCancelled,
}: {
  order: OrderDetail;
  token?: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"] | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await cancelOrder({ data: { reference: order.reference, token, reason: reason ?? undefined } });
      toast.success("Order cancelled.");
      onCancelled();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel this order.");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-5" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md border border-saaj-line bg-background p-6 sm:p-8">
        <p className="eyebrow">Cancel order {order.reference}?</p>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Are you sure you want to cancel this order? This action cannot be undone.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-3 text-xs">
              <input
                type="radio"
                name="cancel-reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-3.5 w-3.5 accent-white"
              />
              {r.label}
            </label>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
          >
            KEEP ORDER
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="flex-1 border border-destructive px-6 py-3 text-[0.625rem] tracking-[0.24em] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
          >
            {busy ? "CANCELLING" : "CONFIRM CANCELLATION"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotFoundState({ orderId }: { orderId: string }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      await resendGuestTrackingLink({ data: { reference: orderId, email: email.trim() } });
      // Always show the same success state, whether or not it matched —
      // never confirm/deny which order numbers or emails exist.
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-16 max-w-md">
      <p className="font-display text-3xl font-light">We couldn't find that order.</p>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        If you checked out as a guest, open the tracking link from your confirmation email, or{" "}
        <Link to="/auth" className="underline hover:text-saaj-champagne">
          sign in
        </Link>{" "}
        if this order was placed on your account.
      </p>

      <div className="mt-10 border-t border-saaj-line pt-8">
        <p className="eyebrow">Lost your link?</p>
        {sent ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            If that order number and email match, we've sent a fresh tracking link — check your inbox.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">EMAIL USED AT CHECKOUT</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
              />
            </label>
            <button
              type="submit"
              disabled={sending}
              className="shrink-0 border border-saaj-line px-6 py-3 text-[0.625rem] tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
            >
              {sending ? "SENDING" : "RESEND LINK"}
            </button>
          </form>
        )}
      </div>

      <Link to="/shop" className="rule-link mt-10">
        Back to the collection
        <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
      </Link>
    </div>
  );
}

