import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/AdminShell";
import { ProductForm } from "@/components/ProductForm";
import { inr } from "@/data/catalog";
import type { ProductInput } from "@/lib/api";
import {
  useAdminProducts,
  useCreateProduct,
  useDeleteProduct,
  useToggleProductActive,
  useUpdateProduct,
  useUpdateStock,
} from "@/lib/queries";

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
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  const updateStock = useUpdateStock();
  const toggleActive = useToggleProductActive();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const rows = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase()),
  );

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Remove “${name}” from the atelier? This cannot be undone.`)) return;
    deleteProduct.mutate(id, {
      onSuccess: () => {
        setEditing(null);
        toast.success("Piece removed.");
      },
    });
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
          <ProductForm
            saving={createProduct.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(input: ProductInput) =>
              createProduct.mutate(input, {
                onSuccess: () => {
                  setCreating(false);
                  toast.success("Piece created.");
                },
                onError: () => toast.error("Could not create piece."),
              })
            }
          />
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
                    <img src={p.image} alt={p.name} className="h-16 w-14 object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{p.name}</p>
                      <p className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                        {p.sku} · {p.category.toUpperCase()}
                        {p.active ? "" : " · HIDDEN"}
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
                    saving={updateProduct.isPending}
                    onCancel={() => setEditing(null)}
                    onDelete={() => handleDelete(p.id, p.name)}
                    onSubmit={(patch) =>
                      updateProduct.mutate(
                        { id: p.id, patch },
                        {
                          onSuccess: () => {
                            setEditing(null);
                            toast.success("Piece updated.");
                          },
                          onError: () => toast.error("Could not update piece."),
                        },
                      )
                    }
                  />
                ) : expanded ? (
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
