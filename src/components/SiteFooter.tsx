import { Link } from "@tanstack/react-router";
import { Instagram } from "lucide-react";

import { CATEGORIES } from "@/data/catalog";

export function SiteFooter() {
  return (
    <footer className="border-t border-saaj-line px-5 pb-10 pt-16 md:px-8">
      <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <span className="font-display text-xl tracking-[0.42em] text-saaj-champagne">SAAJ</span>
          <p className="mt-5 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
            Shirts and sterling silver for people who dress with intent. Small runs, deep black,
            made for the few.
          </p>
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="SAAJ on Instagram"
            className="mt-6 inline-flex items-center gap-3 text-[0.625rem] tracking-[0.22em] text-muted-foreground transition-colors hover:text-saaj-champagne"
          >
            <Instagram className="h-4 w-4" strokeWidth={1.25} />
            INSTAGRAM
          </a>
        </div>

        <nav>
          <h2 className="eyebrow">Shop</h2>
          <ul className="mt-5 flex flex-col gap-3">
            <li>
              <Link
                to="/shop"
                className="text-xs text-muted-foreground transition-colors hover:text-saaj-champagne"
              >
                All pieces
              </Link>
            </li>
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  className="text-xs text-muted-foreground transition-colors hover:text-saaj-champagne"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav>
          <h2 className="eyebrow">House</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {[
              { to: "/about", label: "Our philosophy" },
              { to: "/lookbook", label: "Lookbook" },
              { to: "/contact", label: "Contact" },
              { to: "/wishlist", label: "Saved pieces" },
            ].map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="text-xs text-muted-foreground transition-colors hover:text-saaj-champagne"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav>
          <h2 className="eyebrow">Client care</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {[
              { to: "/shipping", label: "Shipping" },
              { to: "/returns", label: "Returns & exchanges" },
              { to: "/privacy", label: "Privacy" },
              { to: "/terms", label: "Terms" },
            ].map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="text-xs text-muted-foreground transition-colors hover:text-saaj-champagne"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-14 flex flex-col items-center gap-4 border-t border-saaj-line pt-8 sm:flex-row sm:justify-between">
        <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
          © 2026 SAAJ — MADE FOR THE FEW
        </p>
        <p className="text-[0.625rem] tracking-[0.22em] text-muted-foreground">
          COMPLIMENTARY SHIPPING OVER ₹4,999
        </p>
      </div>
    </footer>
  );
}
