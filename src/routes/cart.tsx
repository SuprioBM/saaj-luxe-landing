import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatBDT } from "@/data/catalog";
import { useCart, useRemoveFromCart, useSetCartQty } from "@/lib/cart";

const TITLE = "Your Bag — SAAJ";
const DESCRIPTION = "Review the SAAJ pieces in your bag before checkout.";

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
  const { lines, isLoading } = useCart();
  const setQty = useSetCartQty();
  const removeItem = useRemoveFromCart();
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="flex items-center gap-5">
          <h1 className="eyebrow">Your Bag</h1>
          <span className="h-px flex-1 bg-saaj-line" />
          <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
            {lines.length} ITEM{lines.length === 1 ? "" : "S"}
          </span>
        </div>

        {isLoading ? (
          <div className="mt-10 space-y-px">
            {[0, 1].map((i) => (
              <div key={i} className="saaj-skeleton h-32" />
            ))}
          </div>
        ) : lines.length === 0 ? (
          <div className="mt-16 flex flex-col items-start">
            <p className="font-display text-3xl font-light">Your bag is empty.</p>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Nothing chosen yet. The collection is small on purpose — every piece is made to be
              worn often.
            </p>
            <Link to="/shop" className="rule-link mt-9">
              Explore the collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
            <ul className="flex flex-col gap-px bg-saaj-line">
              {lines.map((line) => (
                <li key={line.variantId} className="flex gap-5 bg-background p-4 sm:p-5">
                  <Link
                    to="/product/$slug"
                    params={{ slug: line.slug }}
                    className="h-28 w-24 shrink-0 overflow-hidden bg-saaj-panel"
                  >
                    {line.image ? (
                      <img
                        src={line.image}
                        alt={line.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </Link>

                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          to="/product/$slug"
                          params={{ slug: line.slug }}
                          className="text-xs transition-colors hover:text-saaj-champagne"
                        >
                          {line.name}
                        </Link>
                        <p className="mt-2 text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground">
                          Size {line.size}
                          {line.available <= 0 ? " — OUT OF STOCK" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${line.name}`}
                        onClick={() => removeItem.mutate({ variantId: line.variantId })}
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
                          onClick={() => setQty.mutate({ variantId: line.variantId, qty: line.qty - 1 })}
                          className="h-8 w-8 text-sm transition-colors hover:text-saaj-champagne"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-xs">{line.qty}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={line.qty >= line.available}
                          onClick={() => setQty.mutate({ variantId: line.variantId, qty: line.qty + 1 })}
                          className="h-8 w-8 text-sm transition-colors hover:text-saaj-champagne disabled:text-muted-foreground/40"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-saaj-champagne">{formatBDT(line.unitPrice * line.qty)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="h-fit border border-saaj-line p-6">
              <h2 className="eyebrow">Summary</h2>
              <dl className="mt-6 flex flex-col gap-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatBDT(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd className="text-muted-foreground">Calculated at checkout</dd>
                </div>
              </dl>
              <span className="mt-6 block h-px w-full bg-saaj-line" />
              <div className="mt-6 flex items-baseline justify-between">
                <span className="eyebrow">Total</span>
                <span className="text-sm text-saaj-champagne">{formatBDT(subtotal)}</span>
              </div>
              <Link
                to="/checkout"
                className="mt-8 flex w-full items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
              >
                Checkout
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>

              <Link to="/shop" className="rule-link mt-8">
                Continue shopping
                <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
              </Link>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
