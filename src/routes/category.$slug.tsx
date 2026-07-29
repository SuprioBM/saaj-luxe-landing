import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { findCategory, inr, productsByCategory } from "@/data/catalog";

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
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <Link
                key={p.slug}
                to="/product/$slug"
                params={{ slug: p.slug }}
                className="group border border-saaj-line bg-saaj-panel transition-colors hover:border-saaj-champagne/40"
              >
                <div className="aspect-[4/5] overflow-hidden">
                  <img
                    src={p.img}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-xs leading-snug">{p.name}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">{inr(p.price)}</p>
                </div>
              </Link>
            ))}
          </div>

          <Link to="/" className="rule-link mt-14 inline-flex">
            Back to home
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
