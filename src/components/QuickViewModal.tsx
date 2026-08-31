import { Link } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { QtyStepper } from "@/components/QtyStepper";
import { SizePicker } from "@/components/SizePicker";
import { StarRating } from "@/components/StarRating";
import { StockBadge } from "@/components/StockBadge";
import { WishlistButton } from "@/components/WishlistButton";
import { avgRating, formatBDT, stockForSize, type Product } from "@/data/catalog";
import { useAddToCart } from "@/lib/cart";
import { useMemberPrice, useMembership, usePotentialMemberPrice } from "@/lib/membership";
import { canPurchase } from "@/lib/membership-pricing";

export function QuickViewModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const membership = useMembership();
  const memberPrice = useMemberPrice(product);
  const potentialPrice = usePotentialMemberPrice(product);
  const purchasable = canPurchase(product, membership.isMember);

  const available = stockForSize(product, size);
  // Empty until the live DB fetch resolves (placeholder data intentionally
  // carries no real variant ids) — gates the buy button so it can't be
  // clicked into a false "not ready" error during that brief window.
  const variantId = size ? product.sizes.find((s) => s.size === size)?.id || undefined : undefined;
  const canAdd = purchasable && Boolean(size) && Boolean(variantId) && available > 0;
  const addToCart = useAddToCart();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-full w-full max-w-4xl animate-scale-in flex-col overflow-y-auto border border-saaj-line bg-background sm:max-h-[88vh] sm:flex-row">
        <button
          type="button"
          aria-label="Close quick view"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-foreground/80 transition-colors hover:text-saaj-champagne"
        >
          <X className="h-5 w-5" strokeWidth={1.25} />
        </button>

        <div className="bg-saaj-panel sm:w-[44%]">
          <img
            src={product.img}
            alt={product.name}
            loading="lazy"
            className="h-64 w-full object-cover sm:h-full"
          />
        </div>

        <div className="flex flex-1 flex-col px-6 py-8 sm:px-9">
          <p className="eyebrow">{product.category}</p>
          <h2 className="mt-4 font-display text-3xl font-light">{product.name}</h2>

          <div className="mt-3 flex items-center gap-3">
            <StarRating value={avgRating(product)} />
            <span className="text-[0.625rem] tracking-[0.2em] text-muted-foreground">
              {product.reviews.length} REVIEWS
            </span>
          </div>

          {memberPrice.isMemberPrice ? (
            <p className="mt-4 text-sm">
              <span className="text-muted-foreground line-through">{formatBDT(memberPrice.listPrice)}</span>{" "}
              <span className="text-saaj-champagne">{formatBDT(memberPrice.memberPrice)}</span>
              <span className="ml-2 text-[0.5625rem] tracking-[0.18em] text-saaj-champagne/70">CLUB PRICE</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-saaj-champagne">
              {formatBDT(product.price)}
              {potentialPrice.eligible && potentialPrice.saves > 0 ? (
                <span className="ml-3 text-[0.625rem] text-muted-foreground">
                  {formatBDT(potentialPrice.memberPrice)} for SAAJ Club
                </span>
              ) : null}
            </p>
          )}
          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{product.detail}</p>

          {!purchasable ? (
            <div className="mt-6 border border-saaj-champagne/30 p-4">
              <p className="text-[0.5625rem] tracking-[0.24em] text-saaj-champagne">
                {product.membersOnly && !membership.isMember ? "✦ SAAJ CLUB MEMBERS ONLY" : "✦ COMING SOON"}
              </p>
              <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                {product.membersOnly && !membership.isMember
                  ? "Join SAAJ Club to unlock this exclusive piece."
                  : "Not released yet. SAAJ Club members get early access."}
              </p>
              <Link
                to="/club"
                onClick={onClose}
                className="mt-3 inline-flex items-center gap-2 text-[0.5625rem] tracking-[0.24em] text-saaj-champagne hover:underline"
              >
                JOIN SAAJ CLUB
                <ArrowRight className="h-3 w-3" strokeWidth={1.25} />
              </Link>
            </div>
          ) : null}

          <div className="mt-7">
            <p className="eyebrow mb-3">Select Size</p>
            <SizePicker sizes={product.sizes} value={size} onChange={setSize} compact />
          </div>

          {size && (
            <div className="mt-5 flex items-center gap-4">
              <StockBadge qty={available} />
              <QtyStepper value={qty} max={Math.max(1, available)} onChange={setQty} />
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={!canAdd || addToCart.isPending}
              onClick={() => {
                if (!size || !variantId) return;
                addToCart.mutate(
                  { variantId, qty },
                  {
                    onSuccess: () => {
                      toast.success(`${product.name} — ${size} added to bag`);
                      onClose();
                    },
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : "Could not add this to your bag."),
                  },
                );
              }}
              className="flex flex-1 items-center justify-between border border-saaj-line px-6 py-4 text-[0.6875rem] uppercase tracking-[0.24em] transition-colors hover:border-saaj-champagne hover:text-saaj-champagne disabled:cursor-not-allowed disabled:border-white/10 disabled:text-muted-foreground/50 disabled:hover:text-muted-foreground/50"
            >
              {!purchasable
                ? product.membersOnly
                  ? "Members only"
                  : "Not yet released"
                : !size
                  ? "Select a size"
                  : !variantId
                    ? "Loading…"
                    : "Add to bag"}
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </button>
            <WishlistButton slug={product.slug} label="Save" />
          </div>

          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            onClick={onClose}
            className="rule-link mt-8 self-start"
          >
            Full details
            <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
          </Link>
        </div>
      </div>
    </div>
  );
}
