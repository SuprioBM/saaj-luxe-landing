import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminShell } from "@/components/AdminShell";
import { inr } from "@/data/catalog";
import { useAdminCustomers } from "@/lib/queries";

const TITLE = "Customers — SAAJ Atelier Desk";
const DESCRIPTION = "The SAAJ client list with order counts and lifetime spend.";

export const Route = createFileRoute("/_authenticated/admin/customers")({
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
  component: AdminCustomers,
});

function AdminCustomers() {
  const { data: customers = [], isLoading } = useAdminCustomers();
  const [query, setQuery] = useState("");

  const rows = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.email.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AdminShell title="Customers" subtitle="The people wearing SAAJ.">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email"
        className="w-full max-w-sm border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
      />

      {isLoading ? (
        <div className="mt-10 space-y-px">
          {[0, 1, 2].map((i) => (
            <div key={i} className="saaj-skeleton h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-12 text-xs text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-saaj-line">
                {["Client", "Email", "Orders", "Lifetime"].map((h) => (
                  <th
                    key={h}
                    className="pb-4 text-[0.625rem] tracking-[0.22em] font-normal text-muted-foreground"
                  >
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-saaj-line">
                  <td className="py-5 text-sm">{c.name}</td>
                  <td className="py-5 text-xs text-muted-foreground">{c.email}</td>
                  <td className="py-5 text-xs">{c.orders}</td>
                  <td className="py-5 text-sm text-saaj-champagne">{inr(c.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
