import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { QtyStepper } from "@/components/QtyStepper";
import { SizePicker } from "@/components/SizePicker";
import { StarRating } from "@/components/StarRating";
import { StockBadge } from "@/components/StockBadge";
import { WishlistButton } from "@/components/WishlistButton";
import { avgRating, inr, stockForSize, type Product } from "@/data/catalog";
import { cart } from "@/lib/cart";

export function QuickViewModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const available = stockForSize(product, size);
  const canAdd = Boolean(size) && available > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-full w-full max-w-4xl animate-scale-in flex-col overflow-y-auto border border-saaj-line bg-background sm:max-h-[88vh] sm:flex-row">
        <button
          type="button"
          aria-label="Close quick view"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-foreground/80 transition-colors hover:text-saaj-champagne"
        >
          <X className="h-5 w-5" strokeWidth={1.25} />
        </button>

        <div className="bg-saaj-panel sm:w-[44%]">
          <img
            src={product.img}
            alt={product.name}
            loading="lazy"
            className="h-64 w-full object-cover sm:h-full"
          />
        </div>

        <div className="flex flex-1 flex-col px-6 py-8 sm:px-9">
          <p className="eyebrow">{product.category}</p>
          <h2 className="mt-4 font-display text-3xl font-light">{product.name}</h2>

          <div className="mt-3 flex items-center gap-3">
            <StarRating value={avgRating(product)} />
            <span className="text-[0.625rem] tracking-[0.2em] text-muted-foreground">
              {product.reviews.length} REVIEWS
            </span>
          </div>

          <p className="mt-4 text-sm text-saaj-champagne">{inr(product.price)}</p>
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{product.detail}</p>

          <div className="mt-7">
            <p className="eyebrow mb-3">Select Size</p>
            <SizePicker sizes={product.sizes} value={size} onChange={setSize} compact />
          </div>

          {size && (
            <div className="mt-5 flex items-center gap-4">
              <StockBadge qty={available} />
              <QtyStepper value={qty} max={Math.max(1, available)} onChange={setQty} />
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => {
                if (!size) return;
                cart.add(product.slug, size, qty);
                toast.success(`${product.name} — ${size} added to bag`);
                onClose();
              }}
              className="flex flex-1 items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:cursor-not-allowed disabled:border-white/10 disabled:text-muted-foreground/50 disabled:hover:text-muted-foreground/50"
            >
              {size ? "Add to bag" : "Select a size"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </button>
            <WishlistButton slug={product.slug} label="Save" />
          </div>

          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            onClick={onClose}
            className="rule-link mt-8 self-start"
          >
            Full details
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </div>
      </div>
    </div>
  );
}
