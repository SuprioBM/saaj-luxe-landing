import { Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CATEGORIES } from "@/data/catalog";
import type { ApiProduct, ProductInput } from "@/lib/api";
import { useUploadImage } from "@/lib/queries";

const DEFAULT_SIZES = [
  { size: "S", stock: 0 },
  { size: "M", stock: 0 },
  { size: "L", stock: 0 },
  { size: "XL", stock: 0 },
];

const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const blank = (): ProductInput => ({
  name: "",
  slug: "",
  category: CATEGORIES[0]?.slug ?? "shirts",
  price: 0,
  sku: "",
  image: "",
  gallery: [],
  detail: "",
  materials: [],
  tags: [],
  isNew: true,
  active: true,
  variants: DEFAULT_SIZES,
});

const fromProduct = (p: ApiProduct): ProductInput => ({
  name: p.name,
  slug: p.slug,
  category: p.category,
  price: p.price,
  sku: p.sku,
  image: p.image,
  gallery: p.gallery ?? [],
  detail: p.detail ?? "",
  materials: p.materials ?? [],
  tags: p.tags ?? [],
  isNew: Boolean(p.isNew),
  active: p.active,
  variants: p.variants.length ? p.variants : DEFAULT_SIZES,
});

const labelCls = "text-[0.625rem] tracking-[0.22em] text-muted-foreground";
const fieldCls =
  "mt-2 w-full border-b border-saaj-line bg-transparent py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-saaj-champagne";

export function ProductForm({
  product,
  saving,
  onSubmit,
  onCancel,
  onDelete,
}: {
  product?: ApiProduct;
  saving: boolean;
  onSubmit: (input: ProductInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<ProductInput>(product ? fromProduct(product) : blank());
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const upload = useUploadImage();

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleFiles = async (files: FileList | null, target: "image" | "gallery") => {
    if (!files?.length) return;
    try {
      const urls = await Promise.all([...files].map((f) => upload.mutateAsync(f)));
      if (target === "image") set("image", urls[0]);
      else set("gallery", [...form.gallery, ...urls]);
    } catch {
      toast.error("Could not upload image.");
    }
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error("Name is required.");
    if (!form.image) return toast.error("A primary image is required.");
    if (form.price <= 0) return toast.error("Price must be above zero.");
    onSubmit({
      ...form,
      name: form.name.trim(),
      slug: form.slug || slugify(form.name),
      sku: form.sku.trim() || `SAAJ-${slugify(form.name).slice(0, 8).toUpperCase()}`,
    });
  };

  return (
    <div className="border-t border-saaj-line px-5 py-10">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-8">
          <label className="block">
            <span className={labelCls}>NAME</span>
            <input
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              placeholder="Noir Crinkle Shirt"
              className={fieldCls}
            />
          </label>

          <div className="grid gap-8 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>SLUG</span>
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", slugify(e.target.value));
                }}
                placeholder="noir-crinkle-shirt"
                className={fieldCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>SKU</span>
              <input
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="SAAJ-SH-001"
                className={fieldCls}
              />
            </label>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>CATEGORY</span>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={`${fieldCls} [&>option]:bg-background`}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>PRICE (INR)</span>
              <input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => set("price", Math.max(0, Number(e.target.value) || 0))}
                className={fieldCls}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>DESCRIPTION</span>
            <textarea
              rows={4}
              value={form.detail}
              onChange={(e) => set("detail", e.target.value)}
              placeholder="A relaxed crinkle-cotton shirt, cut to fall away from the body."
              className={`${fieldCls} resize-none`}
            />
          </label>

          <label className="block">
            <span className={labelCls}>MATERIALS — ONE PER LINE</span>
            <textarea
              rows={3}
              value={form.materials.join("\n")}
              onChange={(e) =>
                set(
                  "materials",
                  e.target.value.split("\n").map((l) => l.trimStart()),
                )
              }
              placeholder={"100% crinkle cotton\nRelaxed fit"}
              className={`${fieldCls} resize-none`}
            />
          </label>

          <label className="block">
            <span className={labelCls}>TAGS — COMMA SEPARATED</span>
            <input
              value={form.tags.join(", ")}
              onChange={(e) =>
                set(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
              placeholder="black, cotton, oversized"
              className={fieldCls}
            />
          </label>
        </div>

        <div className="space-y-8">
          <div>
            <span className={labelCls}>PRIMARY IMAGE</span>
            <div className="mt-3 flex items-start gap-5">
              <div className="flex h-32 w-24 items-center justify-center border border-saaj-line bg-saaj-panel">
                {form.image ? (
                  <img src={form.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                    EMPTY
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-4">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-saaj-line px-5 py-3 text-[0.625rem] tracking-[0.28em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne">
                  <Upload className="h-3.5 w-3.5" strokeWidth={1.25} />
                  {upload.isPending ? "UPLOADING" : "UPLOAD"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleFiles(e.target.files, "image")}
                  />
                </label>
                <input
                  value={form.image}
                  onChange={(e) => set("image", e.target.value)}
                  placeholder="…or paste an image URL"
                  className={fieldCls}
                />
              </div>
            </div>
          </div>

          <div>
            <span className={labelCls}>GALLERY</span>
            <div className="mt-3 flex flex-wrap gap-3">
              {form.gallery.map((g, i) => (
                <div key={`${g}-${i}`} className="relative h-24 w-20">
                  <img src={g} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() =>
                      set(
                        "gallery",
                        form.gallery.filter((_, j) => j !== i),
                      )
                    }
                    className="absolute right-0 top-0 bg-background/80 p-1 text-muted-foreground transition-colors hover:text-saaj-champagne"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.25} />
                  </button>
                </div>
              ))}
              <label className="flex h-24 w-20 cursor-pointer items-center justify-center border border-dashed border-saaj-line text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne">
                <Plus className="h-4 w-4" strokeWidth={1.25} />
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files, "gallery")}
                />
              </label>
            </div>
          </div>

          <div>
            <span className={labelCls}>SIZES &amp; STOCK</span>
            <div className="mt-3 space-y-3">
              {form.variants.map((v, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input
                    value={v.size}
                    onChange={(e) =>
                      set(
                        "variants",
                        form.variants.map((d, j) =>
                          j === i ? { ...d, size: e.target.value } : d,
                        ),
                      )
                    }
                    placeholder="SIZE"
                    className="w-24 border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
                  />
                  <input
                    type="number"
                    min={0}
                    value={v.stock}
                    onChange={(e) =>
                      set(
                        "variants",
                        form.variants.map((d, j) =>
                          j === i ? { ...d, stock: Math.max(0, Number(e.target.value) || 0) } : d,
                        ),
                      )
                    }
                    className="w-24 border-b border-saaj-line bg-transparent py-2 text-sm outline-none focus:border-saaj-champagne"
                  />
                  <button
                    type="button"
                    aria-label="Remove size"
                    onClick={() =>
                      set(
                        "variants",
                        form.variants.filter((_, j) => j !== i),
                      )
                    }
                    className="text-muted-foreground transition-colors hover:text-saaj-champagne"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.25} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("variants", [...form.variants, { size: "", stock: 0 }])}
                className="text-[0.625rem] tracking-[0.22em] text-muted-foreground transition-colors hover:text-saaj-champagne"
              >
                + ADD SIZE
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
                className="h-3.5 w-3.5 accent-white"
              />
              PUBLISHED
            </label>
            <label className="flex items-center gap-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
              <input
                type="checkbox"
                checked={form.isNew}
                onChange={(e) => set("isNew", e.target.checked)}
                className="h-3.5 w-3.5 accent-white"
              />
              MARK AS NEW
            </label>
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-4">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="border border-foreground px-8 py-3 text-[0.625rem] tracking-[0.28em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:opacity-40"
        >
          {saving ? "SAVING" : product ? "SAVE CHANGES" : "CREATE PIECE"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-saaj-line px-8 py-3 text-[0.625rem] tracking-[0.28em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
        >
          CANCEL
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto inline-flex items-center gap-2 border border-saaj-line px-8 py-3 text-[0.625rem] tracking-[0.28em] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.25} />
            DELETE
          </button>
        ) : null}
      </div>
    </div>
  );
}
