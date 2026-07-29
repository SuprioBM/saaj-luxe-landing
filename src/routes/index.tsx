import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Globe, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { CATEGORIES, PRODUCTS, inr } from "@/data/catalog";
import { cart } from "@/lib/cart";

import hero from "@/assets/hero.jpg";
import philosophy from "@/assets/philosophy.jpg";
import p1 from "@/assets/p1.jpg";
import p3 from "@/assets/p3.jpg";
import p5 from "@/assets/p5.jpg";

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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="relative min-h-[640px] md:min-h-[760px]">
            <img
              src={hero}
              alt="Model in a black crinkle shirt with a silver chain, shot in low light"
              width={1200}
              height={1408}
              className="absolute inset-0 h-full w-full object-cover object-[65%_top] md:left-auto md:right-0 md:w-[62%]"
            />
            <div className="hero-fade absolute inset-0" />

            <div className="relative grid grid-cols-[2.5rem_1fr] gap-4 px-5 py-20 md:grid-cols-[5rem_1fr] md:px-8 md:py-28">
              <ol className="flex flex-col gap-6 pt-2">
                {["01", "02", "03", "04"].map((n, i) => (
                  <li
                    key={n}
                    className={
                      i === 0
                        ? "flex items-center gap-3 text-[0.625rem] tracking-[0.2em]"
                        : "text-[0.625rem] tracking-[0.2em] text-muted-foreground/60"
                    }
                  >
                    {n}
                    {i === 0 && <span className="h-px w-6 bg-saaj-champagne" />}
                  </li>
                ))}
              </ol>

              <div className="max-w-xl">
                <p className="eyebrow">Shirts. Accessories. Presence.</p>
                <h1 className="mt-7 text-[2.75rem] font-light leading-[1.05] tracking-[-0.02em] md:text-[4.25rem]">
                  Not for
                  <br />
                  everyone.
                  <br />
                  <span className="font-display italic text-saaj-champagne">Made for you.</span>
                </h1>
                <span className="mt-10 block h-px w-14 bg-saaj-line" />
                <a href="#new-arrivals" className="rule-link mt-10">
                  Explore Collection
                  <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </a>
              </div>
            </div>

            <div className="relative hidden px-8 pb-14 lg:block">
              <div className="ml-auto w-fit">
                <p className="eyebrow">New Drop</p>
                <p className="mt-2 text-sm">Shadow Edit '24</p>
                <div className="mt-4 flex gap-3">
                  {[p1, p3, p5].map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt="Shadow Edit piece"
                      loading="lazy"
                      width={640}
                      height={760}
                      className="h-16 w-16 border border-saaj-line object-cover opacity-80 transition-opacity hover:opacity-100"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

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
            {CATEGORIES.map((c) => (
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
              to="/category/$slug"
              params={{ slug: "shirts" }}
              className="flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:text-saaj-champagne"
            >
              View all
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-saaj-line">
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.25} />
              </span>
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {PRODUCTS.map((p) => (
              <article
                key={p.slug}
                className="group border border-saaj-line bg-saaj-panel transition-colors hover:border-saaj-champagne/40"
              >
                <Link
                  to="/product/$slug"
                  params={{ slug: p.slug }}
                  className="relative block aspect-[4/5] overflow-hidden"
                >
                  <img
                    src={p.img}
                    alt={p.name}
                    loading="lazy"
                    width={640}
                    height={760}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {p.isNew && (
                    <span className="absolute left-3 top-3 border border-saaj-line bg-background/70 px-2 py-1 text-[0.5625rem] tracking-[0.22em]">
                      NEW
                    </span>
                  )}
                </Link>
                <div className="flex items-end justify-between gap-3 p-4">
                  <div>
                    <Link
                      to="/product/$slug"
                      params={{ slug: p.slug }}
                      className="text-xs leading-snug hover:text-saaj-champagne"
                    >
                      {p.name}
                    </Link>
                    <p className="mt-2 text-xs text-muted-foreground">{inr(p.price)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Add ${p.name} to bag`}
                    onClick={() => cart.add(p.slug)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-saaj-line transition-colors hover:border-saaj-champagne hover:text-saaj-champagne"
                  >
                    <span className="text-sm leading-none">+</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Philosophy split */}
        <section className="grid grid-cols-1 gap-px bg-saaj-line lg:grid-cols-[1fr_0.8fr_1fr]">
          <div className="flex flex-col justify-center bg-background px-7 py-16 md:px-10">
            <p className="eyebrow">SAAJ Edit</p>
            <h2 className="mt-6 font-display text-4xl font-light leading-[1.15] md:text-5xl">
              Essentials
              <br />
              that elevate
              <br />
              every moment.
            </h2>
            <a href="#new-arrivals" className="rule-link mt-10 self-start">
              Explore Edit
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </a>
          </div>

          <img
            src={philosophy}
            alt="Portrait of a man in a black shirt and silver chain in dramatic shadow"
            loading="lazy"
            width={700}
            height={900}
            className="h-full min-h-[340px] w-full object-cover"
          />

          <div className="relative flex flex-col justify-center bg-background px-7 py-16 md:px-10">
            <p className="eyebrow">Our Philosophy</p>
            <p className="mt-6 font-display text-3xl font-light leading-[1.25] md:text-[2.1rem]">
              We don't follow trends.
              <br />
              We define identity.
            </p>
            <a href="#" className="rule-link mt-9 self-start">
              Read Our Story
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </a>

            <div className="mt-12 flex h-24 w-24 items-center justify-center rounded-full border border-saaj-champagne/40 lg:absolute lg:right-10 lg:top-1/2 lg:mt-0 lg:-translate-y-1/2">
              <span className="font-display text-2xl text-saaj-champagne">S</span>
            </div>
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
