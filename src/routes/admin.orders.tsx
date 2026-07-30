import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { inr } from "@/data/catalog";
import type { OrderStatus } from "@/lib/api";
import { useAdminOrders, useUpdateOrderStatus } from "@/lib/queries";

const TITLE = "Orders — SAAJ Atelier Desk";
const DESCRIPTION = "Review and progress every SAAJ order from confirmation to delivery.";

export const Route = createFileRoute("/admin/orders")({
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

const STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

function AdminOrders() {
  const { data: orders = [], isLoading } = useAdminOrders();
  const update = useUpdateOrderStatus();
  const [filter, setFilter] = useState<OrderStatus | "ALL">("ALL");

  const rows = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

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
            {s}
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
                  <p className="text-sm">{o.reference}</p>
                  <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    {o.customerName} · {o.customerEmail}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{inr(o.total)}</p>
                  <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    {new Date(o.placedAt).toLocaleDateString("en-IN")} ·{" "}
                    {o.paymentMethod.toUpperCase()}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                {o.items.map((i) => `${i.name} (${i.size}) ×${i.qty}`).join(" · ")}
              </p>

              <div className="saaj-rail mt-6 flex gap-2 overflow-x-auto">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      update.mutate({ id: o.id, status: s });
                      toast.success(`${o.reference} marked ${s.toLowerCase()}.`);
                    }}
                    className={`shrink-0 border px-4 py-2 text-[0.5rem] tracking-[0.22em] transition-colors ${
                      o.status === s
                        ? "border-saaj-champagne text-saaj-champagne"
                        : "border-saaj-line text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
