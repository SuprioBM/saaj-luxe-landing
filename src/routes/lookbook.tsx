import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PRODUCTS, PHILOSOPHY_IMG, HERO_SLIDES } from "@/data/catalog";

const TITLE = "Lookbook — SAAJ Season 04";
const DESCRIPTION =
  "The SAAJ Shadow Edit: cinematic frames of shirts, chains, rings and bracelets shot in low light.";

export const Route = createFileRoute("/lookbook")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: LookbookPage,
});

const FRAMES = [
  { img: HERO_SLIDES[0].img, alt: HERO_SLIDES[0].alt, caption: "Frame 01 — Open collar, low light", tall: true },
  { img: PRODUCTS[3].gallery[0], alt: "Rope chain resting against black cotton", caption: "Frame 02 — Weight at the throat" },
  { img: HERO_SLIDES[1].img, alt: HERO_SLIDES[1].alt, caption: "Frame 03 — Silver in shadow" },
  { img: PRODUCTS[2].gallery[0], alt: "Charcoal drop-shoulder linen shirt", caption: "Frame 04 — The Shadow shirt", tall: true },
  { img: HERO_SLIDES[2].img, alt: HERO_SLIDES[2].alt, caption: "Frame 05 — Season 04" },
  { img: PHILOSOPHY_IMG, alt: "SAAJ atelier still life", caption: "Frame 06 — Atelier" },
  { img: PRODUCTS[5].gallery[0], alt: "Blackened signet ring on hand", caption: "Frame 07 — Unmarked face" },
  { img: HERO_SLIDES[3].img, alt: HERO_SLIDES[3].alt, caption: "Frame 08 — Adjusting the collar", tall: true },
];

function LookbookPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <p className="eyebrow">The Shadow Edit</p>
        <h1 className="mt-8 max-w-2xl font-display text-4xl font-light leading-[1.05] md:text-6xl">
          Season 04
          <span className="block italic text-saaj-champagne">in eight frames.</span>
        </h1>

        <div className="mt-16 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>figure]:mb-5">
          {FRAMES.map((f, i) => (
            <figure key={i} className="group break-inside-avoid">
              <div className="overflow-hidden">
                <img
                  src={f.img}
                  alt={f.alt}
                  loading="lazy"
                  className={`w-full object-cover transition-transform duration-[1200ms] group-hover:scale-[1.04] ${
                    f.tall ? "aspect-[3/4]" : "aspect-square"
                  }`}
                />
              </div>
              <figcaption className="mt-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
                {f.caption.toUpperCase()}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-16 border-t border-saaj-line pt-10">
          <Link to="/shop" className="rule-link">
            Shop the edit
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
