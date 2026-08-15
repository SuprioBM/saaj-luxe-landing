import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { formatBDT } from "@/data/catalog";
import { adminListOrders, adminSetShipment, adminUpdateOrderStatus, type AdminOrder } from "@/lib/admin/orders.functions";

const TITLE = "Orders — SAAJ Atelier Desk";
const DESCRIPTION = "Review and progress every SAAJ order from confirmation to delivery.";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminOrders,
});

const STATUSES = [
  "pending",
  "processing",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
type OrderStatus = (typeof STATUSES)[number];

function AdminOrders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => adminListOrders(),
  });
  const qc = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");
  const [pending, setPending] = useState<string | null>(null);
  const [shipmentEditing, setShipmentEditing] = useState<string | null>(null);

  const rows = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    void qc.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const updateStatus = async (orderId: string, status: OrderStatus, reference: string) => {
    setPending(orderId);
    try {
      await adminUpdateOrderStatus({ data: { orderId, status } });
      toast.success(`${reference} marked ${status}.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this order.");
    } finally {
      setPending(null);
    }
  };

  return (
    <AdminShell title="Orders" subtitle="Every dispatch, tracked.">
      <div className="saaj-rail flex gap-6 overflow-x-auto border-b border-saaj-line pb-4">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`shrink-0 text-[0.625rem] tracking-[0.22em] transition-colors ${
              filter === s ? "text-saaj-champagne" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-10 space-y-px">
          {[0, 1, 2].map((i) => (
            <div key={i} className="saaj-skeleton h-24" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-12 text-xs text-muted-foreground">No orders in this state.</p>
      ) : (
        <div className="mt-10 space-y-px bg-saaj-line">
          {rows.map((o) => (
            <article key={o.id} className="bg-background p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <p className="text-sm">
                    {o.reference}
                    <span
                      className={`ml-3 text-[0.5625rem] tracking-[0.2em] ${
                        o.isGuest ? "text-muted-foreground" : "text-saaj-champagne"
                      }`}
                    >
                      {o.isGuest ? "GUEST" : "REGISTERED"}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    {o.customerName} · {o.customerEmail}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{formatBDT(o.total)}</p>
                  <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    {new Date(o.placedAt).toLocaleDateString("en-GB")} ·{" "}
                    {(o.paymentStatus ?? "unpaid").toUpperCase()}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                {o.items.map((i) => `${i.name} (${i.size}) ×${i.qty}`).join(" · ")}
              </p>

              {o.courier || o.shipmentTrackingNumber ? (
                <p className="mt-3 text-[0.625rem] tracking-[0.2em] text-muted-foreground">
                  {o.courier ?? "—"} · {o.shipmentTrackingNumber ?? "—"}
                </p>
              ) : null}

              <div className="saaj-rail mt-6 flex gap-2 overflow-x-auto">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={pending === o.id}
                    onClick={() => void updateStatus(o.id, s, o.reference)}
                    className={`shrink-0 border px-4 py-2 text-[0.5rem] tracking-[0.22em] transition-colors disabled:opacity-40 ${
                      o.status === s
                        ? "border-saaj-champagne text-saaj-champagne"
                        : "border-saaj-line text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShipmentEditing(shipmentEditing === o.id ? null : o.id)}
                className="mt-4 text-[0.625rem] tracking-[0.2em] text-muted-foreground transition-colors hover:text-saaj-champagne"
              >
                {shipmentEditing === o.id ? "CLOSE" : "SET COURIER / TRACKING"}
              </button>

              {shipmentEditing === o.id ? (
                <ShipmentForm
                  order={o}
                  onSaved={() => {
                    setShipmentEditing(null);
                    invalidate();
                  }}
                />
              ) : null}
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}

function ShipmentForm({ order, onSaved }: { order: AdminOrder; onSaved: () => void }) {
  const [courier, setCourier] = useState(order.courier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order.shipmentTrackingNumber ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await adminSetShipment({ data: { orderId: order.id, courier, trackingNumber } });
      toast.success("Shipment details saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save shipment details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-saaj-line pt-4">
      <label className="flex-1">
        <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">COURIER</span>
        <input
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          placeholder="Pathao"
          className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
        />
      </label>
      <label className="flex-1">
        <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">TRACKING NUMBER</span>
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="PT123456789"
          className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
        />
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="shrink-0 border border-foreground px-6 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
      >
        {saving ? "SAVING" : "SAVE"}
      </button>
    </div>
  );
}
