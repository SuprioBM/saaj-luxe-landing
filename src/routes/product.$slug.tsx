import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PRODUCTS, findProduct, inr } from "@/data/catalog";
import { cart } from "@/lib/cart";

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
  const related = PRODUCTS.filter((p) => p.slug !== product.slug).slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="grid grid-cols-1 gap-px bg-saaj-line lg:grid-cols-2">
          <div className="bg-saaj-panel">
            <img
              src={product.img}
              alt={product.name}
              className="h-full max-h-[80vh] w-full object-cover"
            />
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
            <p className="mt-4 text-sm text-saaj-champagne">{inr(product.price)}</p>
            <span className="mt-8 block h-px w-14 bg-saaj-line" />
            <p className="mt-8 max-w-md text-xs leading-relaxed text-muted-foreground">
              {product.detail}
            </p>

            <ul className="mt-8 flex flex-col gap-3">
              {product.materials.map((m) => (
                <li
                  key={m}
                  className="border-b border-saaj-line pb-3 text-[0.6875rem] uppercase tracking-[0.2em] text-foreground/80"
                >
                  {m}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => cart.add(product.slug)}
              className="mt-10 flex w-full items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne sm:w-72"
            >
              Add to bag
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </button>
            <Link to="/cart" className="rule-link mt-8 self-start">
              View bag
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        </section>

        <section className="px-5 py-20 md:px-8 md:py-28">
          <div className="flex items-center gap-5">
            <h2 className="eyebrow">You may also wear</h2>
            <span className="h-px flex-1 bg-saaj-line" />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {related.map((p) => (
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
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
