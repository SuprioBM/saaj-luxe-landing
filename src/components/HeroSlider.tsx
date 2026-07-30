import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { HERO_SLIDES } from "@/data/catalog";

const DURATION = 5000;

export function HeroSlider() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);
  const paused = useRef(false);

  const go = useCallback((i: number) => {
    setActive(i);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused.current) return;
      setActive((a) => (a + 1) % HERO_SLIDES.length);
      setTick((t) => t + 1);
    }, DURATION);
    return () => window.clearInterval(id);
  }, [tick]);

  return (
    <section
      className="relative overflow-hidden"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="relative min-h-[640px] md:min-h-[760px]">
        {HERO_SLIDES.map((s, i) => (
          <img
            key={s.n}
            src={s.img}
            alt={s.alt}
            loading={i === 0 ? "eager" : "lazy"}
            width={1200}
            height={1408}
            aria-hidden={i !== active}
            className={`absolute inset-0 h-full w-full object-cover object-[65%_top] transition-all duration-[1200ms] ease-out md:left-auto md:right-0 md:w-[62%] ${
              i === active ? "scale-100 opacity-100" : "scale-105 opacity-0"
            }`}
          />
        ))}
        <div className="hero-fade absolute inset-0" />

        <div className="relative grid grid-cols-[2.5rem_1fr] gap-4 px-5 py-20 md:grid-cols-[5rem_1fr] md:px-8 md:py-28">
          {/* Indicators */}
          <ol className="relative flex flex-col gap-6 pt-2">
            <span
              aria-hidden
              className="absolute left-0 h-4 w-px bg-saaj-champagne/30 transition-transform duration-700 ease-out"
              style={{ transform: `translateY(${active * 2.5}rem)` }}
            />
            {HERO_SLIDES.map((s, i) => (
              <li key={s.n} className="h-4">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${s.n}`}
                  aria-current={i === active}
                  className={`flex items-center gap-3 text-[0.625rem] tracking-[0.2em] transition-colors duration-500 ${
                    i === active
                      ? "text-foreground"
                      : "text-muted-foreground/60 hover:text-foreground/80"
                  }`}
                >
                  {s.n}
                  {i === active && (
                    <span className="relative block h-px w-6 overflow-hidden bg-saaj-line">
                      <span
                        key={tick}
                        className="absolute inset-y-0 left-0 block w-full origin-left bg-saaj-champagne"
                        style={{ animation: `saaj-progress ${DURATION}ms linear forwards` }}
                      />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>

          {/* Copy */}
          <div className="max-w-xl">
            {HERO_SLIDES.map((s, i) => (
              <div
                key={s.n}
                aria-hidden={i !== active}
                className={
                  i === active
                    ? "block"
                    : "pointer-events-none absolute opacity-0"
                }
              >
                {i === active && (
                  <div key={tick} className="saaj-slide-in">
                    <p className="eyebrow">{s.eyebrow}</p>
                    <h1 className="mt-7 text-[2.75rem] font-light leading-[1.05] tracking-[-0.02em] md:text-[4.25rem]">
                      {s.title[0]}
                      <br />
                      {s.title[1]}
                      <br />
                      <span className="font-display italic text-saaj-champagne">{s.accent}</span>
                    </h1>
                    <p className="mt-6 max-w-sm text-xs leading-relaxed tracking-[0.06em] text-muted-foreground">
                      {s.subtitle}
                    </p>
                    <span className="mt-9 block h-px w-14 bg-saaj-line" />
                    {"params" in s && s.params ? (
                      <Link
                        to="/category/$slug"
                        params={{ slug: s.params.slug }}
                        className="rule-link mt-9"
                      >
                        {s.cta}
                        <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                      </Link>
                    ) : (
                      <Link to="/shop" className="rule-link mt-9">
                        {s.cta}
                        <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
