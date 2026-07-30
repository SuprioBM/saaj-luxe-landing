import type { ReactNode } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export type PolicySection = { heading: string; body: string[] };

export function PolicyPage({
  eyebrow,
  title,
  accent,
  intro,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  intro: string;
  sections: PolicySection[];
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="px-5 py-16 md:px-8 md:py-24">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-8 max-w-2xl font-display text-4xl font-light leading-[1.05] md:text-5xl">
          {title}
          {accent && <span className="block italic text-saaj-champagne">{accent}</span>}
        </h1>
        <p className="mt-8 max-w-lg text-xs leading-relaxed text-muted-foreground">{intro}</p>

        <div className="mt-16 grid max-w-3xl grid-cols-1 gap-px bg-saaj-line">
          {sections.map((s, i) => (
            <section key={s.heading} className="bg-background py-8">
              <div className="flex items-baseline gap-5">
                <span className="text-[0.625rem] tracking-[0.24em] text-saaj-champagne">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="font-display text-xl font-light">{s.heading}</h2>
              </div>
              <div className="mt-4 flex flex-col gap-3 pl-0 sm:pl-11">
                {s.body.map((p, j) => (
                  <p key={j} className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {children}

        <p className="mt-14 text-[0.625rem] tracking-[0.22em] text-muted-foreground">
          LAST UPDATED — JULY 2026
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
