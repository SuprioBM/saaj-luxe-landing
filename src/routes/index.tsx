import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

import { HeroSlider } from "@/components/HeroSlider";
import { ProductCard } from "@/components/ProductCard";
import { RecentlyViewedRail } from "@/components/RecentlyViewedRail";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PHILOSOPHY_IMG } from "@/data/catalog";
import { useCategories, useProducts } from "@/lib/catalog-live";

const TITLE = "SAAJ — Shirts, Chains & Rings for the Few";
const DESCRIPTION =
  "SAAJ is a dark, editorial menswear house. Crinkle shirts, silver neckchains, signet rings and bracelets made for presence, not for everyone.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Index,
});

const SERVICES = [
  { Icon: Sparkles, title: "Premium Quality", copy: ["Finest materials.", "Built to last."] },
  { Icon: ShieldCheck, title: "Secure Payment", copy: ["100% safe &", "secured checkout."] },
  { Icon: Globe, title: "Worldwide Shipping", copy: ["Delivering style", "across borders."] },
  { Icon: RotateCcw, title: "Easy Returns", copy: ["14-day easy", "returns & exchange."] },
];

function Index() {
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const newArrivals = [...products]
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <HeroSlider />

        {/* Categories — horizontal scroll */}
        <section className="border-y border-saaj-line py-10">
          <div className="flex items-center justify-between gap-6 px-5 pb-6 md:px-8">
            <div className="flex items-center gap-5">
              <h2 className="eyebrow">Categories</h2>
              <span className="h-px w-16 bg-saaj-line" />
            </div>
            <span className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
              SCROLL →
            </span>
          </div>

          <div className="saaj-rail flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:px-8">
            {categories.map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                className="group relative h-[380px] w-[78vw] shrink-0 snap-start overflow-hidden border border-saaj-line bg-black sm:w-[46vw] lg:w-[28vw]"
              >
                <img
                  src={c.img}
                  alt={`${c.title} category`}
                  loading="lazy"
                  width={700}
                  height={800}
                  className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-105"
                />
                <div className="panel-fade absolute inset-0" />
                <div className="relative flex h-full flex-col p-7">
                  <span className="text-[0.625rem] tracking-[0.24em] text-muted-foreground">
                    {c.n}
                  </span>
                  <h3 className="mt-3 font-display text-3xl font-light">{c.title}</h3>
                  <p className="mt-auto text-xs leading-relaxed text-muted-foreground">
                    {c.copy[0]}
                    <br />
                    {c.copy[1]}
                  </p>
                  <span className="rule-link mt-6 self-start">
                    {c.cta}
                    <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* New arrivals */}
        <section id="new-arrivals" className="px-5 py-24 md:px-8 md:py-32">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <h2 className="eyebrow">New Arrivals</h2>
              <span className="h-px w-16 bg-saaj-line" />
            </div>
            <Link
              to="/shop"
              className="flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:text-saaj-champagne"
            >
              View all
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-saaj-line">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
              </span>
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {newArrivals.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>

        <RecentlyViewedRail />

        {/* Philosophy */}
        <section className="relative grid grid-cols-1 gap-px border-y border-saaj-line bg-saaj-line lg:grid-cols-2">
          <div className="bg-saaj-panel">
            <img
              src={PHILOSOPHY_IMG}
              alt="SAAJ lifestyle portrait in low light"
              loading="lazy"
              className="h-full max-h-[640px] w-full object-cover"
            />
          </div>
          <div className="relative flex flex-col justify-center bg-background px-6 py-16 md:px-12 md:py-24">
            <p className="eyebrow">Our Philosophy</p>
            <h2 className="mt-6 font-display text-4xl font-light leading-tight md:text-5xl">
              We don't follow
              <br />
              trends.
              <br />
              <span className="italic text-saaj-champagne">We define identity.</span>
            </h2>
            <p className="mt-8 max-w-md text-xs leading-relaxed text-muted-foreground">
              Every SAAJ piece begins in shadow — a silhouette, a weight, a line. We make few
              things, slowly, for people who already know what they want to look like.
            </p>
            <Link to="/shop" className="rule-link mt-9 self-start">
              Explore the collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>

            <div className="mt-12 flex h-24 w-24 items-center justify-center rounded-full border border-saaj-champagne/40 lg:absolute lg:right-10 lg:top-1/2 lg:mt-0 lg:-translate-y-1/2">
              <span className="font-display text-2xl text-saaj-champagne">S</span>
            </div>
          </div>
        </section>

        {/* SAAJ Club — subtle membership band */}
        <section className="border-t border-saaj-line px-5 py-16 md:px-8 md:py-20">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <p className="text-[0.625rem] tracking-[0.4em] text-saaj-champagne">✦ SAAJ CLUB — FOR THE FEW.</p>
              <p className="mt-4 max-w-md font-display text-2xl font-light leading-snug">
                Exclusive pieces. Early access. Better prices.
              </p>
              <p className="mt-3 text-xs tracking-[0.16em] text-muted-foreground">৳50 / MONTH</p>
            </div>
            <Link
              to="/club"
              className="inline-flex shrink-0 items-center gap-3 border border-saaj-champagne px-10 py-4 text-[0.625rem] tracking-[0.28em] text-saaj-champagne transition-colors hover:bg-saaj-champagne hover:text-background"
            >
              JOIN THE CLUB
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
        </section>

        {/* Service bar */}
        <section className="grid grid-cols-1 gap-px border-t border-saaj-line bg-saaj-line sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map(({ Icon, title, copy }) => (
            <div key={title} className="flex items-start gap-4 bg-background px-7 py-9">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-saaj-line">
                <Icon className="h-4 w-4 text-saaj-champagne" strokeWidth={1.25} />
              </span>
              <div>
                <h3 className="text-[0.6875rem] uppercase tracking-[0.2em]">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {copy[0]}
                  <br />
                  {copy[1]}
                </p>
              </div>
            </div>
          ))}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
