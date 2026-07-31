import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { inr, totalStock } from "@/data/catalog";
import { useCategories, useProducts } from "@/lib/catalog-live";

const TITLE = "Shop All — SAAJ";
const DESCRIPTION =
  "The full SAAJ collection: shirts, neckchains, rings and bracelets. Filter by category, availability and price.";

type Search = { category?: string; sort?: string; availability?: string; max?: number };

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    category: typeof search.category === "string" ? search.category : "all",
    sort: typeof search.sort === "string" ? search.sort : "newest",
    availability: typeof search.availability === "string" ? search.availability : "all",
    max: Number(search.max) || 0,
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ShopPage,
});

const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "price-asc", label: "Price ↑" },
  { id: "price-desc", label: "Price ↓" },
  { id: "name", label: "A–Z" },
];

function ShopPage() {
  const { category = "all", sort = "newest", availability = "all", max = 0 } = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });
  const { data: allProducts = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const priceMax = allProducts.length ? Math.max(...allProducts.map((p) => p.price)) : 0;
  const cap = max > 0 ? max : priceMax;

  const set = (patch: Partial<Search>) =>
    navigate({ search: (prev: Search) => ({ ...prev, ...patch }) });

  let items = allProducts.filter((p) => (category === "all" ? true : p.category === category))
    .filter((p) => p.price <= cap)
    .filter((p) => {
      if (availability === "in") return totalStock(p) > 0;
      if (availability === "out") return totalStock(p) <= 0;
      return true;
    });

  items = [...items].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "name") return a.name.localeCompare(b.name);
    return b.addedAt.localeCompare(a.addedAt);
  });

  const chip = (activeState: boolean) =>
    `border px-4 py-2 text-[0.625rem] uppercase tracking-[0.2em] transition-colors ${
      activeState
        ? "border-saaj-champagne text-saaj-champagne"
        : "border-saaj-line text-muted-foreground hover:border-saaj-champagne/50 hover:text-foreground"
    }`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <p className="eyebrow">The Collection</p>
        <h1 className="mt-5 font-display text-5xl font-light md:text-6xl">Shop All</h1>
        <p className="mt-5 max-w-md text-xs leading-relaxed text-muted-foreground">
          {DESCRIPTION}
        </p>

        <div className="mt-12 flex flex-col gap-6 border-y border-saaj-line py-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-2">Category</span>
            <button type="button" className={chip(category === "all")} onClick={() => set({ category: "all" })}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={chip(category === c.slug)}
                onClick={() => set({ category: c.slug })}
              >
                {c.title}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-2">Availability</span>
            {[
              { id: "all", label: "All" },
              { id: "in", label: "In stock" },
              { id: "out", label: "Sold out" },
            ].map((a) => (
              <button
                key={a.id}
                type="button"
                className={chip(availability === a.id)}
                onClick={() => set({ availability: a.id })}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-2">Sort</span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={chip(sort === s.id)}
                onClick={() => set({ sort: s.id })}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <span className="eyebrow">Max price</span>
            <input
              type="range"
              min={1000}
              max={priceMax}
              step={100}
              value={cap}
              onChange={(e) => set({ max: Number(e.target.value) })}
              className="h-px w-56 appearance-none bg-saaj-line accent-[var(--saaj-champagne)]"
            />
            <span className="text-[0.625rem] tracking-[0.2em] text-saaj-champagne">{inr(cap)}</span>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-5">
          <span className="eyebrow">{items.length} Pieces</span>
          <span className="h-px flex-1 bg-saaj-line" />
        </div>

        {items.length === 0 ? (
          <p className="mt-14 font-display text-3xl font-light">Nothing matches those filters.</p>
        ) : (
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        )}

        <Link to="/" className="rule-link mt-14 inline-flex">
          Back to home
          <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
