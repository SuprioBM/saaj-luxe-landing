import { Heart } from "lucide-react";

import { useWishlist, wishlist } from "@/lib/wishlist";

export function WishlistButton({
  slug,
  label,
  className = "",
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const list = useWishlist();
  const active = list.includes(slug);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove from wishlist" : "Save to wishlist"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        wishlist.toggle(slug);
      }}
      className={
        label
          ? `flex items-center justify-center gap-3 border px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors ${
              active
                ? "border-saaj-champagne text-saaj-champagne"
                : "border-saaj-line hover:border-saaj-champagne hover:text-saaj-champagne"
            } ${className}`
          : `flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
              active
                ? "border-saaj-champagne text-saaj-champagne"
                : "border-saaj-line text-foreground/70 hover:border-saaj-champagne hover:text-saaj-champagne"
            } ${className}`
      }
    >
      <Heart className={label ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.25} fill={active ? "currentColor" : "none"} />
      {label && <span>{active ? "Saved" : label}</span>}
    </button>
  );
}
