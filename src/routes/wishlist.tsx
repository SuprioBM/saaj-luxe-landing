import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findProduct } from "@/data/catalog";
import { useWishlist } from "@/lib/wishlist";

const TITLE = "Saved Pieces — SAAJ";
const DESCRIPTION = "The SAAJ pieces you've saved for later.";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const slugs = useWishlist();
  const items = slugs.map(findProduct).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Saved</h1>
          <span className="h-px flex-1 bg-saaj-line" />
          <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
            {items.length} PIECE{items.length === 1 ? "" : "S"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="mt-16 flex flex-col items-start">
            <p className="font-display text-3xl font-light">Nothing saved yet.</p>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Tap the heart on any piece to keep it here while you decide.
            </p>
            <Link to="/shop" className="rule-link mt-9">
              Explore the collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
