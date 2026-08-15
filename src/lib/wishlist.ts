import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/catalog-live";
import {
  getWishlist,
  mergeGuestWishlist,
  toggleWishlist as toggleWishlistFn,
} from "@/lib/wishlist.functions";

/**
 * Real wishlist, split by identity:
 *  - Signed in → `wishlists` table via wishlist.functions.ts.
 *  - Guest     → slugs in localStorage, merged into the account on sign-in.
 */

const GUEST_KEY = "saaj.guest_wishlist.v1";

let guestSlugs: string[] = [];
const listeners = new Set<() => void>();
let hydrated = false;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(guestSlugs));
  } catch {
    /* ignore */
  }
}

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) guestSlugs = parsed.filter((s): s is string => typeof s === "string");
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  if (!hydrated) {
    hydrated = true;
    hydrate();
  }
  listeners.add(l);
  return () => listeners.delete(l);
}

function getGuestSlugs() {
  return guestSlugs;
}

const emptyGuest: string[] = [];
function useGuestSlugs() {
  return useSyncExternalStore(subscribe, getGuestSlugs, () => emptyGuest);
}

function setGuestSlugs(next: string[]) {
  guestSlugs = next;
  emit();
}

export function useWishlist(): string[] {
  const user = useAuth();
  const guest = useGuestSlugs();
  const dbQuery = useQuery({
    queryKey: ["wishlist", "db", user?.id],
    queryFn: () => getWishlist(),
    enabled: Boolean(user),
  });

  if (user) return (dbQuery.data ?? []).map((w) => w.slug);
  return guest;
}

export function useToggleWishlist() {
  const user = useAuth();
  const { data: products = [] } = useProducts();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (slug: string) => {
      if (user) {
        const productId = products.find((p) => p.slug === slug)?.id;
        if (!productId) throw new Error("This piece isn't ready yet — please refresh and try again.");
        return toggleWishlistFn({ data: { productId } });
      }
      const existing = getGuestSlugs();
      const next = existing.includes(slug) ? existing.filter((s) => s !== slug) : [slug, ...existing];
      setGuestSlugs(next);
      return null;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wishlist"] }),
  });
}

/** Guest → account wishlist merge, called once right after SIGNED_IN. */
export async function mergeGuestWishlistIntoAccount(products: { id?: string; slug: string }[]): Promise<void> {
  const slugs = getGuestSlugs();
  if (!slugs.length) return;
  const productIds = slugs
    .map((slug) => products.find((p) => p.slug === slug)?.id)
    .filter((id): id is string => Boolean(id));
  try {
    if (productIds.length) await mergeGuestWishlist({ data: { productIds } });
  } finally {
    setGuestSlugs([]);
  }
}
