import { Heart } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/catalog-live";
import { useToggleWishlist, useWishlist } from "@/lib/wishlist";

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
  const toggle = useToggleWishlist();
  const user = useAuth();
  const { data: products = [] } = useProducts();

  // Guests toggle by slug alone (localStorage), so they're never blocked.
  // Signed-in users need the real product id (DB wishlist) — only disable
  // for the brief window before the live catalog fetch resolves.
  const ready = !user || Boolean(products.find((p) => p.slug === slug)?.id);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? "Remove from wishlist" : "Save to wishlist"}
      disabled={toggle.isPending || !ready}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(slug, {
          onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update your saved pieces."),
        });
      }}
      className={
        label
          ? `flex items-center justify-center gap-3 border px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors disabled:opacity-50 ${
              active
                ? "border-saaj-champagne text-saaj-champagne"
                : "border-saaj-line hover:border-saaj-champagne hover:text-saaj-champagne"
            } ${className}`
          : `flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
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
