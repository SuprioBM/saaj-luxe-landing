import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { useState } from "react";

import { QuickViewModal } from "@/components/QuickViewModal";
import { WishlistButton } from "@/components/WishlistButton";
import { inr, totalStock, type Product } from "@/data/catalog";

export function ProductCard({
  product,
  quickView = true,
  priority = false,
}: {
  product: Product;
  quickView?: boolean;
  priority?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const stock = totalStock(product);
  const soldOut = stock <= 0;

  return (
    <>
      <article className="group relative flex flex-col border border-saaj-line bg-saaj-panel transition-colors hover:border-saaj-champagne/40">
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          className="relative block aspect-[4/5] overflow-hidden"
        >
          <img
            src={product.img}
            alt={product.name}
            loading={priority ? "eager" : "lazy"}
            width={640}
            height={760}
            className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 ${
              soldOut ? "opacity-40" : ""
            }`}
          />
          <div className="absolute left-3 top-3 flex flex-col gap-2">
            {product.isNew && !soldOut && (
              <span className="border border-saaj-line bg-background/70 px-2 py-1 text-[0.5625rem] tracking-[0.22em] backdrop-blur">
                NEW
              </span>
            )}
            {soldOut && (
              <span className="border border-saaj-line bg-background/80 px-2 py-1 text-[0.5625rem] tracking-[0.22em] text-muted-foreground backdrop-blur">
                SOLD OUT
              </span>
            )}
            {!soldOut && stock <= 4 && (
              <span className="border border-saaj-champagne/40 bg-background/70 px-2 py-1 text-[0.5625rem] tracking-[0.22em] text-saaj-champagne backdrop-blur">
                LOW STOCK
              </span>
            )}
          </div>
        </Link>

        <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-2 opacity-0 transition-opacity duration-300 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 max-md:pointer-events-auto max-md:opacity-100">
          <WishlistButton slug={product.slug} className="bg-background/70 backdrop-blur" />
          {quickView && (
            <button
              type="button"
              aria-label={`Quick view ${product.name}`}
              onClick={() => setOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-saaj-line bg-background/70 text-foreground/70 backdrop-blur transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={1.25} />
            </button>
          )}
        </div>

        <div className="flex flex-1 items-end justify-between gap-3 p-4">
          <div>
            <Link
              to="/product/$slug"
              params={{ slug: product.slug }}
              className="text-xs leading-snug transition-colors hover:text-saaj-champagne"
            >
              {product.name}
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">{inr(product.price)}</p>
          </div>
        </div>
      </article>

      {quickView && open && <QuickViewModal product={product} onClose={() => setOpen(false)} />}
    </>
  );
}
