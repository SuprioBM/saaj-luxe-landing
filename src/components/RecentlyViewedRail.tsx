import { Link } from "@tanstack/react-router";

import { findProduct, inr } from "@/data/catalog";
import { useRecentlyViewed } from "@/lib/recently-viewed";

export function RecentlyViewedRail({
  exclude,
  title = "Recently Viewed",
}: {
  exclude?: string;
  title?: string;
}) {
  const slugs = useRecentlyViewed();
  const items = slugs
    .filter((s) => s !== exclude)
    .map(findProduct)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  if (items.length === 0) return null;

  return (
    <section className="border-t border-saaj-line px-5 py-16 md:px-8 md:py-20">
      <div className="flex items-center gap-5">
        <h2 className="eyebrow">{title}</h2>
        <span className="h-px flex-1 bg-saaj-line" />
      </div>

      <div className="saaj-rail mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {items.map((p) => (
          <Link
            key={p.slug}
            to="/product/$slug"
            params={{ slug: p.slug }}
            className="group w-[42vw] shrink-0 snap-start border border-saaj-line bg-saaj-panel transition-colors hover:border-saaj-champagne/40 sm:w-[24vw] lg:w-[15vw]"
          >
            <div className="aspect-[4/5] overflow-hidden">
              <img
                src={p.img}
                alt={p.name}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            </div>
            <div className="p-3">
              <h3 className="text-[0.6875rem] leading-snug">{p.name}</h3>
              <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">{inr(p.price)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
