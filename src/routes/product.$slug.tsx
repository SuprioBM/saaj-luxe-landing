import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ProductCard } from "@/components/ProductCard";
import { QtyStepper } from "@/components/QtyStepper";
import { RecentlyViewedRail } from "@/components/RecentlyViewedRail";
import { SizePicker } from "@/components/SizePicker";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StarRating } from "@/components/StarRating";
import { StockBadge } from "@/components/StockBadge";
import { WishlistButton } from "@/components/WishlistButton";
import { PRODUCTS, avgRating, findProduct, inr, stockForSize, type Review } from "@/data/catalog";
import { cart } from "@/lib/cart";
import { recentlyViewed } from "@/lib/recently-viewed";

export const Route = createFileRoute("/product/$slug")({
  loader: ({ params }) => {
    const product = findProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Unavailable — SAAJ" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.product.name} — SAAJ`;
    const description = loaderData.product.detail;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const gallery: string[] = product.gallery?.length ? product.gallery : [product.img];
  const [shot, setShot] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setShot(0);
    setSize(null);
    setQty(1);
    recentlyViewed.push(product.slug);
  }, [product.slug]);

  const available = stockForSize(product, size);
  const related = PRODUCTS.filter(
    (p) => p.slug !== product.slug && p.category === product.category,
  )
    .concat(PRODUCTS.filter((p) => p.slug !== product.slug && p.category !== product.category))
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="grid grid-cols-1 gap-px bg-saaj-line lg:grid-cols-2">
          <div className="bg-saaj-panel">
            <div
              className="group relative overflow-hidden"
              onMouseEnter={() => setZoom(true)}
              onMouseLeave={() => setZoom(false)}
              onTouchStart={(e) => {
                touchX.current = e.touches[0].clientX;
              }}
              onTouchEnd={(e) => {
                if (touchX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchX.current;
                touchX.current = null;
                if (Math.abs(dx) < 45) return;
                if (dx < 0) next();
                else prev();
              }}
            >
              <img
                src={gallery[shot]}
                alt={`${product.name} — view ${shot + 1}`}
                className={`h-full max-h-[80vh] w-full object-cover transition-transform duration-700 ${
                  zoom ? "scale-125" : "scale-100"
                }`}
                draggable={false}
              />
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous image"
                    onClick={prev}
                    disabled={shot === 0}
                    className="absolute left-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-saaj-line bg-background/40 backdrop-blur-sm transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:pointer-events-none disabled:opacity-25 md:flex"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next image"
                    onClick={next}
                    disabled={shot === gallery.length - 1}
                    className="absolute right-4 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-saaj-line bg-background/40 backdrop-blur-sm transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:pointer-events-none disabled:opacity-25 md:flex"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.25} />
                  </button>
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 md:hidden">
                    {gallery.map((g: string, i: number) => (
                      <span
                        key={g}
                        className={`h-px w-6 transition-colors ${
                          i === shot ? "bg-saaj-champagne" : "bg-saaj-line"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {gallery.length > 1 && (
              <div className="saaj-rail flex gap-2 overflow-x-auto p-3">
                {gallery.map((g: string, i: number) => (
                  <button
                    key={g}
                    type="button"
                    aria-label={`View image ${i + 1}`}
                    onClick={() => setShot(i)}
                    className={`h-20 w-16 shrink-0 overflow-hidden border transition-colors ${
                      i === shot ? "border-saaj-champagne" : "border-saaj-line"
                    }`}
                  >
                    <img src={g} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center bg-background px-6 py-14 md:px-12">
            <Link
              to="/category/$slug"
              params={{ slug: product.category }}
              className="eyebrow hover:text-saaj-champagne"
            >
              {product.category}
            </Link>
            <h1 className="mt-5 font-display text-4xl font-light md:text-5xl">{product.name}</h1>

            <div className="mt-4 flex items-center gap-3">
              <StarRating value={avgRating(product)} />
              <span className="text-[0.625rem] tracking-[0.2em] text-muted-foreground">
                {product.reviews.length} REVIEWS
              </span>
            </div>

            <p className="mt-4 text-sm text-saaj-champagne">{inr(product.price)}</p>
            <span className="mt-8 block h-px w-14 bg-saaj-line" />
            <p className="mt-8 max-w-md text-xs leading-relaxed text-muted-foreground">
              {product.detail}
            </p>

            <div className="mt-9">
              <p className="eyebrow mb-3">Select Size</p>
              <SizePicker sizes={product.sizes} value={size} onChange={setSize} />
            </div>

            {size && (
              <div className="mt-6 flex items-center gap-5">
                <StockBadge qty={available} />
                <QtyStepper value={qty} max={Math.max(1, available)} onChange={setQty} />
              </div>
            )}

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={!size || available <= 0}
                onClick={() => {
                  if (!size) return;
                  cart.add(product.slug, size, qty);
                  toast.success(`${product.name} — ${size} added to bag`);
                }}
                className="flex items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:cursor-not-allowed disabled:text-muted-foreground/50 sm:w-72"
              >
                {size ? "Add to bag" : "Select a size"}
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </button>
              <WishlistButton slug={product.slug} label="Save" />
            </div>

            <ul className="mt-10 flex flex-col gap-3">
              {product.materials.map((m: string) => (
                <li
                  key={m}
                  className="border-b border-saaj-line pb-3 text-[0.6875rem] uppercase tracking-[0.2em] text-foreground/80"
                >
                  {m}
                </li>
              ))}
            </ul>

            <Link to="/cart" className="rule-link mt-9 self-start">
              View bag
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        </section>

        {product.reviews.length > 0 && (
          <section className="border-t border-saaj-line px-5 py-16 md:px-8 md:py-20">
            <div className="flex items-center gap-5">
              <h2 className="eyebrow">Reviews</h2>
              <span className="h-px flex-1 bg-saaj-line" />
            </div>
            <div className="mt-8 grid grid-cols-1 gap-px bg-saaj-line md:grid-cols-3">
              {product.reviews.map((r: Review) => (
                <article key={r.id} className="bg-background p-6">
                  <StarRating value={r.rating} />
                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{r.body}</p>
                  <p className="mt-5 text-[0.625rem] uppercase tracking-[0.22em] text-foreground/70">
                    {r.name} — {r.date}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="px-5 py-16 md:px-8 md:py-24">
          <div className="flex items-center gap-5">
            <h2 className="eyebrow">You may also wear</h2>
            <span className="h-px flex-1 bg-saaj-line" />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>

        <RecentlyViewedRail exclude={product.slug} />
      </main>
      <SiteFooter />
    </div>
  );
}
