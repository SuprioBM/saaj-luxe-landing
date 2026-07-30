import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { ProductCard } from "@/components/ProductCard";
import { RecentlyViewedRail } from "@/components/RecentlyViewedRail";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findCategory, productsByCategory } from "@/data/catalog";

export const Route = createFileRoute("/category/$slug")({
  loader: ({ params }) => {
    const category = findCategory(params.slug);
    if (!category) throw notFound();
    return { category };
  },

  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Unavailable — SAAJ" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.category.title} — SAAJ`;
    const description = loaderData.category.blurb;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: CategoryPage,
});

function notFoundCategory(): never {
  // eslint-disable-next-line @typescript-eslint/no-throw-literal
  throw new Error("Category not found");
}

function CategoryPage() {
  const { category } = Route.useLoaderData();
  const items = productsByCategory(category.slug);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="relative h-[46vh] min-h-[320px] overflow-hidden">
          <img
            src={category.img}
            alt={`${category.title} collection`}
            className="absolute inset-0 h-full w-full object-cover opacity-70"
          />
          <div className="panel-fade absolute inset-0" />
          <div className="relative flex h-full flex-col justify-end px-5 pb-10 md:px-8 md:pb-14">
            <p className="eyebrow">{category.n} — Collection</p>
            <h1 className="mt-4 font-display text-5xl font-light md:text-6xl">{category.title}</h1>
            <p className="mt-4 max-w-md text-xs leading-relaxed text-muted-foreground">
              {category.blurb}
            </p>
          </div>
        </section>

        <section className="px-5 py-16 md:px-8 md:py-24">
          <div className="flex items-center gap-5">
            <h2 className="eyebrow">{items.length} Pieces</h2>
            <span className="h-px flex-1 bg-saaj-line" />
            <Link
              to="/shop"
              search={{ category: category.slug, sort: "newest", availability: "all", max: 0 }}
              className="text-[0.625rem] uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-saaj-champagne"
            >
              Filter &amp; sort
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>

          <Link to="/" className="rule-link mt-14 inline-flex">
            Back to home
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </section>

        <RecentlyViewedRail />
      </main>
      <SiteFooter />
    </div>
  );
}
