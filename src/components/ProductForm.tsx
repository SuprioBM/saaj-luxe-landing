import { Plus, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CATEGORIES } from "@/data/catalog";
import { adminUploadImage } from "@/lib/admin/uploads.functions";
import type { AdminProduct } from "@/lib/admin/products.functions";
import type { AdminProductInput } from "@/lib/schemas";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:<type>;base64,<data>" — keep only the payload.
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

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

type FormState = {
  name: string;
  slug: string;
  categorySlug: string;
  price: number;
  discountPrice: number | null;
  sku: string;
  description: string;
  materials: string[];
  tags: string[];
  isNew: boolean;
  status: "draft" | "active" | "archived";
  images: { url: string; alt: string | null; isPrimary: boolean }[];
  variants: { size: string; stock: number }[];
  membersOnly: boolean;
  memberDiscountEligible: boolean;
  memberDiscountPercent: number | null;
  availableFrom: string | null;
  memberAvailableFrom: string | null;
};

/** <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time; the
 * DB stores ISO/UTC. Convert both ways so the field round-trips. */
const isoToLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localInputToIso = (local: string): string | null =>
  local ? new Date(local).toISOString() : null;

const blank = (): FormState => ({
  name: "",
  slug: "",
  categorySlug: CATEGORIES[0]?.slug ?? "shirts",
  price: 0,
  discountPrice: null,
  sku: "",
  description: "",
  materials: [],
  tags: [],
  isNew: true,
  status: "active",
  images: [],
  variants: DEFAULT_SIZES,
  membersOnly: false,
  memberDiscountEligible: true,
  memberDiscountPercent: null,
  availableFrom: null,
  memberAvailableFrom: null,
});

const fromProduct = (p: AdminProduct): FormState => ({
  name: p.name,
  slug: p.slug,
  categorySlug: p.category,
  price: p.price,
  discountPrice: p.discountPrice,
  sku: p.sku,
  description: p.detail,
  materials: p.materials,
  tags: p.tags,
  isNew: p.isNew,
  status: p.status,
  images: p.gallery.map((url, i) => ({ url, alt: null, isPrimary: i === 0 })),
  variants: p.variants.length ? p.variants.map((v) => ({ size: v.size, stock: v.stock })) : DEFAULT_SIZES,
  membersOnly: p.membersOnly,
  memberDiscountEligible: p.memberDiscountEligible,
  memberDiscountPercent: p.memberDiscountPercent,
  availableFrom: p.availableFrom,
  memberAvailableFrom: p.memberAvailableFrom,
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
  product?: AdminProduct;
  saving: boolean;
  onSubmit: (input: AdminProductInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<FormState>(product ? fromProduct(product) : blank());
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: { url: string; alt: null; isPrimary: boolean }[] = [];
      for (const file of Array.from(files)) {
        if (!isAllowedImageType(file.type)) {
          toast.error(`${file.name} isn't a supported image type.`);
          continue;
        }
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} is over the 8MB limit.`);
          continue;
        }
        const base64 = await fileToBase64(file);
        const { url } = await adminUploadImage({
          data: { fileName: file.name, contentType: file.type, base64 },
        });
        uploaded.push({ url, alt: null, isPrimary: false });
      }
      if (uploaded.length) {
        set("images", [
          ...form.images,
          ...uploaded.map((img, i) => ({ ...img, isPrimary: form.images.length === 0 && i === 0 })),
        ]);
        toast.success(`Uploaded ${uploaded.length} image${uploaded.length === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const addImage = () => {
    if (!imageUrl.trim()) return;
    set("images", [...form.images, { url: imageUrl.trim(), alt: null, isPrimary: form.images.length === 0 }]);
    setImageUrl("");
  };

  const submit = () => {
    if (!form.name.trim()) return toast.error("Name is required.");
    if (!form.images.length) return toast.error("At least one image is required.");
    if (form.price <= 0) return toast.error("Price must be above zero.");
    onSubmit({
      ...form,
      name: form.name.trim(),
      slug: form.slug || slugify(form.name),
      sku: form.sku.trim() || `SAAJ-${slugify(form.name).slice(0, 8).toUpperCase()}`,
      memberDiscountPercent: form.memberDiscountEligible ? form.memberDiscountPercent : null,
      availableFrom: form.availableFrom,
      memberAvailableFrom: form.memberAvailableFrom,
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
                value={form.categorySlug}
                onChange={(e) => set("categorySlug", e.target.value)}
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
              <span className={labelCls}>PRICE (৳)</span>
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
            <span className={labelCls}>DISCOUNT PRICE (৳, OPTIONAL)</span>
            <input
              type="number"
              min={0}
              value={form.discountPrice ?? ""}
              onChange={(e) => set("discountPrice", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
              placeholder="Leave blank for no discount"
              className={fieldCls}
            />
          </label>

          <label className="block">
            <span className={labelCls}>DESCRIPTION</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
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
            <span className={labelCls}>IMAGES</span>
            <div className="mt-3 flex items-center gap-3">
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 border border-saaj-line px-5 py-3 text-[0.625rem] tracking-[0.28em] text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne">
                <Upload className="h-3.5 w-3.5" strokeWidth={1.25} />
                {uploading ? "UPLOADING" : "UPLOAD"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    void uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-[0.625rem] text-muted-foreground">or paste a URL</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addImage())}
                placeholder="https://…"
                className={fieldCls + " mt-0"}
              />
              <button
                type="button"
                onClick={addImage}
                className="shrink-0 border border-saaj-line p-2 text-muted-foreground transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
                aria-label="Add image URL"
              >
                <Plus className="h-4 w-4" strokeWidth={1.25} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {form.images.map((img, i) => (
                <div key={`${img.url}-${i}`} className="relative h-24 w-20">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  {img.isPrimary ? (
                    <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-center text-[0.5rem] tracking-[0.2em] text-saaj-champagne">
                      PRIMARY
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() =>
                      set(
                        "images",
                        form.images.filter((_, j) => j !== i).map((im, j) => ({ ...im, isPrimary: j === 0 })),
                      )
                    }
                    className="absolute right-0 top-0 bg-background/80 p-1 text-muted-foreground transition-colors hover:text-saaj-champagne"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.25} />
                  </button>
                </div>
              ))}
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
                checked={form.status === "active"}
                onChange={(e) => set("status", e.target.checked ? "active" : "draft")}
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

          <div className="border-t border-saaj-line pt-8">
            <p className="text-[0.625rem] tracking-[0.28em] text-saaj-champagne">✦ SAAJ CLUB</p>
            <div className="mt-5 space-y-5">
              <label className="flex items-center gap-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.membersOnly}
                  onChange={(e) => set("membersOnly", e.target.checked)}
                  className="h-3.5 w-3.5 accent-white"
                />
                MEMBERS ONLY (CLUB EXCLUSIVE)
              </label>
              <label className="flex items-center gap-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.memberDiscountEligible}
                  onChange={(e) => set("memberDiscountEligible", e.target.checked)}
                  className="h-3.5 w-3.5 accent-white"
                />
                MEMBER DISCOUNT ENABLED
              </label>
              {form.memberDiscountEligible ? (
                <label className="block">
                  <span className={labelCls}>CUSTOM MEMBER DISCOUNT (%, BLANK = CLUB DEFAULT)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.memberDiscountPercent ?? ""}
                    onChange={(e) =>
                      set(
                        "memberDiscountPercent",
                        e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      )
                    }
                    placeholder="e.g. 15"
                    className={fieldCls}
                  />
                </label>
              ) : null}
              <div className="grid gap-6 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>PUBLIC RELEASE (BLANK = NOW)</span>
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(form.availableFrom)}
                    onChange={(e) => set("availableFrom", localInputToIso(e.target.value))}
                    className={`${fieldCls} [color-scheme:dark]`}
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>MEMBER EARLY ACCESS (BLANK = SAME AS PUBLIC)</span>
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(form.memberAvailableFrom)}
                    onChange={(e) => set("memberAvailableFrom", localInputToIso(e.target.value))}
                    className={`${fieldCls} [color-scheme:dark]`}
                  />
                </label>
              </div>
            </div>
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
