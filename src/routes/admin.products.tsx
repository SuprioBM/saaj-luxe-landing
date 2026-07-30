import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { inr } from "@/data/catalog";
import { useAdminProducts, useToggleProductActive, useUpdateStock } from "@/lib/queries";

const TITLE = "Inventory — SAAJ Atelier Desk";
const DESCRIPTION = "Manage SAAJ product inventory, stock levels and availability.";

export const Route = createFileRoute("/admin/products")({
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
  component: AdminProducts,
});

function AdminProducts() {
  const { data: products = [], isLoading } = useAdminProducts();
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const updateStock = useUpdateStock();
  const toggleActive = useToggleProductActive();

  const rows = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AdminShell title="Inventory" subtitle="Every piece, every size.">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or SKU"
        className="w-full max-w-sm border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
      />

      {isLoading ? (
        <div className="mt-10 space-y-px">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="saaj-skeleton h-20" />
          ))}
        </div>
      ) : (
        <div className="mt-10 space-y-px bg-saaj-line">
          {rows.map((p) => {
            const total = p.variants.reduce((s, v) => s + v.stock, 0);
            const expanded = open === p.id;
            return (
              <div key={p.id} className="bg-background">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : p.id)}
                  className="flex w-full items-center gap-5 p-5 text-left transition-colors hover:bg-saaj-panel"
                >
                  <img src={p.image} alt={p.name} className="h-16 w-14 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{p.name}</p>
                    <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                      {p.sku} · {p.category.toUpperCase()}
                    </p>
                  </div>
                  <p className="hidden text-sm sm:block">{inr(p.price)}</p>
                  <p
                    className={`w-24 text-right text-[0.625rem] tracking-[0.22em] ${
                      total === 0
                        ? "text-muted-foreground"
                        : total <= 6
                          ? "text-saaj-champagne"
                          : "text-foreground"
                    }`}
                  >
                    {total} IN STOCK
                  </p>
                </button>

                {expanded ? (
                  <StockEditor
                    variants={p.variants}
                    active={p.active}
                    saving={updateStock.isPending}
                    onToggleActive={() => {
                      toggleActive.mutate({ id: p.id, active: !p.active });
                      toast.success(p.active ? "Piece hidden." : "Piece published.");
                    }}
                    onSave={(variants) => {
                      updateStock.mutate({ id: p.id, variants });
                      toast.success("Stock updated.");
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}

function StockEditor({
  variants,
  active,
  saving,
  onSave,
  onToggleActive,
}: {
  variants: { size: string; stock: number }[];
  active: boolean;
  saving: boolean;
  onSave: (v: { size: string; stock: number }[]) => void;
  onToggleActive: () => void;
}) {
  const [draft, setDraft] = useState(variants);

  return (
    <div className="border-t border-saaj-line px-5 py-8">
      <div className="flex flex-wrap gap-6">
        {draft.map((v, i) => (
          <label key={v.size} className="w-24">
            <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
              {v.size.toUpperCase()}
            </span>
            <input
              type="number"
              min={0}
              value={v.stock}
              onChange={(e) =>
                setDraft(
                  draft.map((d, j) =>
                    j === i ? { ...d, stock: Math.max(0, Number(e.target.value) || 0) } : d,
                  ),
                )
              }
              className="mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
            />
          </label>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-4">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(draft)}
          className="border border-foreground px-8 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
        >
          {saving ? "SAVING" : "SAVE STOCK"}
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          className="border border-saaj-line px-8 py-3 text-[0.625rem] tracking-[0.28em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
        >
          {active ? "HIDE FROM STORE" : "PUBLISH"}
        </button>
      </div>
    </div>
  );
}
