import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PHILOSOPHY_IMG } from "@/data/catalog";
import hero2 from "@/assets/hero-2.jpg";

const TITLE = "About SAAJ — Made for the Few";
const DESCRIPTION =
  "SAAJ makes shirts and sterling silver for people who dress with intent. Small runs, heavy metal, deep black.";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: AboutPage,
});

const PILLARS: [string, string][] = [
  ["Small runs", "Nothing is made in volume. When a piece sells out, it stays out until it earns a rerun."],
  ["Honest material", "Solid 925 silver, real linen, garment-dyed cotton. No plating, no filler, no shortcuts."],
  ["Finished by hand", "Every clasp, hem and face is checked by a person before it leaves Dhaka."],
];

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="px-5 py-16 md:px-8 md:py-24">
          <p className="eyebrow">Our Philosophy</p>
          <h1 className="mt-8 max-w-3xl font-display text-4xl font-light leading-[1.05] md:text-6xl">
            Not built for everyone.
            <span className="block italic text-saaj-champagne">Built to be remembered.</span>
          </h1>
          <p className="mt-8 max-w-lg text-xs leading-relaxed text-muted-foreground">
            SAAJ began with one shirt and one chain, made for a circle of people who were tired of
            loud logos. The brief has not changed: pieces heavy enough to feel, quiet enough to wear
            every day, dark enough to disappear into a room and still hold it.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2">
          <img
            src={PHILOSOPHY_IMG}
            alt="SAAJ atelier detail — silver chain resting on black fabric"
            loading="lazy"
            className="h-[60vh] w-full object-cover md:h-[80vh]"
          />
          <div className="flex flex-col justify-center gap-10 px-5 py-16 md:px-12">
            {PILLARS.map(([title, copy], i) => (
              <div key={title}>
                <span className="text-[0.625rem] tracking-[0.24em] text-saaj-champagne">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="mt-4 font-display text-2xl font-light">{title}</h2>
                <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2">
          <div className="flex flex-col justify-center gap-6 px-5 py-16 md:px-12">
            <p className="eyebrow">The maker</p>
            <p className="max-w-md font-display text-2xl font-light leading-snug">
              Cut and sewn in Bangladesh. Silver hand-finished in Dhaka by a workshop we have worked
              with since the first run.
            </p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              We keep the chain short — designer to workshop to you. It means slower drops and fewer
              pieces, and it also means we can tell you exactly who touched what you wear.
            </p>
            <Link to="/shop" className="rule-link mt-2 self-start">
              Explore the collection
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </Link>
          </div>
          <img
            src={hero2}
            alt="Hands wearing heavy sterling silver rings in dramatic light"
            loading="lazy"
            className="order-first h-[60vh] w-full object-cover md:order-none md:h-[70vh]"
          />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
