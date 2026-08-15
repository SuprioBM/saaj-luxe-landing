import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";

import { AdminShell } from "@/components/AdminShell";
import { formatBDT } from "@/data/catalog";
import { adminDashboardStats } from "@/lib/admin/dashboard.functions";

const TITLE = "Atelier Desk — SAAJ";
const DESCRIPTION = "SAAJ internal dashboard: revenue, orders and inventory health.";

export const Route = createFileRoute("/_authenticated/admin/")({
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
  component: AdminOverview,
});

function AdminOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminDashboardStats(),
  });
  const peak = Math.max(1, ...(data?.revenueSeries.map((r) => r.value) ?? [1]));

  return (
    <AdminShell title="Overview" subtitle="The house, at a glance.">
      {isLoading || !data ? (
        <div className="grid gap-px bg-saaj-line sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="saaj-skeleton h-36" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-saaj-line sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Revenue" value={formatBDT(data.revenue)} />
            <Metric label="Orders" value={String(data.orders)} />
            <Metric label="Customers" value={String(data.customers)} />
            <Metric label="Low Stock" value={String(data.lowStock)} />
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <section>
              <div className="flex items-center gap-5">
                <h2 className="eyebrow">Revenue (7 days)</h2>
                <span className="h-px flex-1 bg-saaj-line" />
              </div>
              {data.revenueSeries.every((r) => r.value === 0) ? (
                <p className="mt-8 text-xs text-muted-foreground">No revenue recorded yet.</p>
              ) : (
                <div className="mt-10 flex h-48 items-end gap-3">
                  {data.revenueSeries.map((r) => (
                    <div key={r.label} className="flex flex-1 flex-col items-center gap-3">
                      <div
                        className="w-full bg-saaj-champagne/70"
                        style={{ height: `${Math.max(4, (r.value / peak) * 100)}%` }}
                      />
                      <span className="text-[0.5rem] tracking-[0.22em] text-muted-foreground">
                        {r.label.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center gap-5">
                <h2 className="eyebrow">Best Sellers</h2>
                <span className="h-px flex-1 bg-saaj-line" />
              </div>
              {data.topProducts.length === 0 ? (
                <p className="mt-8 text-xs text-muted-foreground">No paid orders yet.</p>
              ) : (
                <ul className="mt-8 divide-y divide-saaj-line border-y border-saaj-line">
                  {data.topProducts.map((p) => (
                    <li key={p.slug} className="flex items-center justify-between gap-6 py-4">
                      <span className="truncate text-sm">{p.name}</span>
                      <span className="shrink-0 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                        {p.sold} SOLD · {formatBDT(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/products" className="rule-link mt-8">
                Manage inventory
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </section>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-8">
      <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
        {label.toUpperCase()}
      </p>
      <p className="mt-6 font-display text-3xl font-light">{value}</p>
    </div>
  );
}
