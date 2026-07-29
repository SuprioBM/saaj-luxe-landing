import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findProduct, inr } from "@/data/catalog";
import { cart, useCart } from "@/lib/cart";

const TITLE = "Your Bag — SAAJ";
const DESCRIPTION =
  "Review the SAAJ pieces in your bag — shirts, chains, rings and bracelets — before checkout.";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const lines = useCart();
  const items = lines
    .map((l) => ({ line: l, product: findProduct(l.slug) }))
    .filter((x): x is { line: typeof x.line; product: NonNullable<typeof x.product> } =>
      Boolean(x.product),
    );
  const subtotal = items.reduce((s, x) => s + x.product.price * x.line.qty, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Your Bag</h1>
          <span className="h-px flex-1 bg-saaj-line" />
          <span className="text-[0.625rem] tracking-[0.24em] text-muted-foreground">
            {items.length} ITEM{items.length === 1 ? "" : "S"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="mt-20 flex flex-col items-start">
            <p className="font-display text-4xl font-light">Your bag is empty.</p>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Nothing chosen yet. The collection is small on purpose — start with a shirt or a
              chain.
            </p>
            <Link to="/" className="rule-link mt-10">
              Explore Collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col">
              {items.map(({ line, product }) => (
                <div
                  key={product.slug}
                  className="flex gap-5 border-b border-saaj-line py-6 first:pt-0"
                >
                  <Link to="/product/$slug" params={{ slug: product.slug }}>
                    <img
                      src={product.img}
                      alt={product.name}
                      className="h-28 w-24 border border-saaj-line object-cover"
                    />
                  </Link>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          to="/product/$slug"
                          params={{ slug: product.slug }}
                          className="text-xs hover:text-saaj-champagne"
                        >
                          {product.name}
                        </Link>
                        <p className="mt-2 text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
                          {product.category}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${product.name}`}
                        onClick={() => cart.remove(product.slug)}
                        className="text-muted-foreground transition-colors hover:text-saaj-champagne"
                      >
                        <X className="h-4 w-4" strokeWidth={1.25} />
                      </button>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-4">
                      <div className="flex items-center border border-saaj-line">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => cart.setQty(product.slug, line.qty - 1)}
                          className="h-8 w-8 text-sm transition-colors hover:text-saaj-champagne"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-xs">{line.qty}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => cart.setQty(product.slug, line.qty + 1)}
                          className="h-8 w-8 text-sm transition-colors hover:text-saaj-champagne"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-saaj-champagne">
                        {inr(product.price * line.qty)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <aside className="h-fit border border-saaj-line bg-saaj-panel p-7">
              <p className="eyebrow">Summary</p>
              <div className="mt-7 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{inr(subtotal)}</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-muted-foreground">Calculated at checkout</span>
              </div>
              <span className="mt-7 block h-px w-full bg-saaj-line" />
              <div className="mt-7 flex items-center justify-between">
                <span className="text-[0.6875rem] uppercase tracking-[0.24em]">Total</span>
                <span className="font-display text-2xl text-saaj-champagne">{inr(subtotal)}</span>
              </div>
              <button
                type="button"
                className="mt-9 flex w-full items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
              >
                Checkout
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </button>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
