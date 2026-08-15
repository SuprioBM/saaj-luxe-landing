import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { ProductForm } from "@/components/ProductForm";
import { formatBDT } from "@/data/catalog";
import {
  adminCreateProduct,
  adminDeleteProduct,
  adminListProducts,
  adminSetProductStatus,
  adminUpdateProduct,
  adminUpdateStock,
} from "@/lib/admin/products.functions";
import type { AdminProductInput } from "@/lib/schemas";

const TITLE = "Inventory — SAAJ Atelier Desk";
const DESCRIPTION = "Manage SAAJ product inventory, stock levels and availability.";

export const Route = createFileRoute("/_authenticated/admin/products")({
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
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => adminListProducts(),
  });
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["admin", "products"] });

  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const rows = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()),
  );

  const handleCreate = async (input: AdminProductInput) => {
    setBusy(true);
    try {
      await adminCreateProduct({ data: input });
      setCreating(false);
      toast.success("Piece created.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create piece.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (id: string, patch: AdminProductInput) => {
    setBusy(true);
    try {
      await adminUpdateProduct({ data: { id, ...patch } });
      setEditing(null);
      toast.success("Piece updated.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update piece.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Remove "${name}" from the atelier? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await adminDeleteProduct({ data: { id } });
      setEditing(null);
      toast.success("Piece removed.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this piece.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async (id: string, active: boolean) => {
    try {
      await adminSetProductStatus({ data: { id, status: active ? "draft" : "active" } });
      toast.success(active ? "Piece hidden." : "Piece published.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this piece.");
    }
  };

  const handleSaveStock = async (id: string, variants: { size: string; stock: number }[]) => {
    try {
      await adminUpdateStock({ data: { productId: id, variants } });
      toast.success("Stock updated.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update stock.");
    }
  };

  return (
    <AdminShell title="Inventory" subtitle="Every piece, every size.">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or SKU"
          className="w-full max-w-sm border-b border-saaj-line bg-transparent py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne"
        />
        <button
          type="button"
          onClick={() => {
            setCreating((v) => !v);
            setEditing(null);
            setOpen(null);
          }}
          className="inline-flex items-center gap-2 border border-foreground px-8 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.25} />
          NEW PIECE
        </button>
      </div>

      {creating ? (
        <div className="mt-10 border border-saaj-line">
          <p className="px-5 pt-6 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
            NEW PIECE
          </p>
          <ProductForm saving={busy} onCancel={() => setCreating(false)} onSubmit={handleCreate} />
        </div>
      ) : null}

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
            const isEditing = editing === p.id;
            return (
              <div key={p.id} className="bg-background">
                <div className="flex w-full items-center gap-5 p-5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(expanded ? null : p.id);
                      setEditing(null);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-5 text-left"
                  >
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-16 w-14 object-cover" />
                    ) : (
                      <div className="h-16 w-14 bg-saaj-panel" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                        {p.sku} · {p.category.toUpperCase()}
                        {p.status !== "active" ? ` · ${p.status.toUpperCase()}` : ""}
                      </p>
                    </div>
                    <p className="hidden text-sm sm:block">{formatBDT(p.price)}</p>
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
                  <button
                    type="button"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => {
                      setEditing(isEditing ? null : p.id);
                      setOpen(null);
                      setCreating(false);
                    }}
                    className="text-muted-foreground transition-colors hover:text-saaj-champagne"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                </div>

                {isEditing ? (
                  <ProductForm
                    product={p}
                    saving={busy}
                    onCancel={() => setEditing(null)}
                    onDelete={() => void handleDelete(p.id, p.name)}
                    onSubmit={(patch) => void handleUpdate(p.id, patch)}
                  />
                ) : expanded ? (
                  <StockEditor
                    variants={p.variants}
                    active={p.status === "active"}
                    onToggleActive={() => void handleToggleStatus(p.id, p.status === "active")}
                    onSave={(variants) => void handleSaveStock(p.id, variants)}
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
  onSave,
  onToggleActive,
}: {
  variants: { size: string; stock: number }[];
  active: boolean;
  onSave: (v: { size: string; stock: number }[]) => void;
  onToggleActive: () => void;
}) {
  const [draft, setDraft] = useState(variants);
  const [saving, setSaving] = useState(false);

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
          onClick={() => {
            setSaving(true);
            void Promise.resolve(onSave(draft)).finally(() => setSaving(false));
          }}
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
