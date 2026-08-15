import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { useAuth } from "@/lib/auth";
import { useProducts } from "@/lib/catalog-live";
import {
  addToCart as addToCartFn,
  clearCart as clearCartFn,
  getCart,
  mergeGuestCart as mergeGuestCartFn,
  removeCartItem as removeCartItemFn,
  setCartItemQty as setCartItemQtyFn,
  type CartLine,
} from "@/lib/cart.functions";

/**
 * Real cart, split by identity:
 *  - Signed in  → `carts`/`cart_items` via cart.functions.ts (server-priced,
 *    server-validated stock).
 *  - Guest      → { variantId, qty } pairs in localStorage, resolved against
 *    the live catalog for display. Merged into the DB cart on sign-in.
 */

export type { CartLine };

const GUEST_KEY = "saaj.guest_cart.v1";
type GuestLine = { variantId: string; qty: number };

let guestLines: GuestLine[] = [];
const listeners = new Set<() => void>();
let hydrated = false;

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(guestLines));
  } catch {
    /* storage unavailable */
  }
}

function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      guestLines = parsed.filter(
        (l): l is GuestLine => l && typeof l.variantId === "string" && typeof l.qty === "number",
      );
    }
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

function getGuestLines() {
  return guestLines;
}

const emptyGuest: GuestLine[] = [];
function useGuestLines() {
  return useSyncExternalStore(subscribe, getGuestLines, () => emptyGuest);
}

function setGuestLines(next: GuestLine[]) {
  guestLines = next;
  emit();
}

export function useCart(): { lines: CartLine[]; isLoading: boolean } {
  const user = useAuth();
  const guest = useGuestLines();
  const { data: products = [] } = useProducts();

  const dbQuery = useQuery({
    queryKey: ["cart", "db", user?.id],
    queryFn: () => getCart(),
    enabled: Boolean(user),
  });

  if (user) {
    return { lines: dbQuery.data ?? [], isLoading: dbQuery.isLoading };
  }

  const variantIndex = new Map<string, CartLine>();
  for (const p of products) {
    for (const s of p.sizes) {
      if (!s.id) continue;
      variantIndex.set(s.id, {
        variantId: s.id,
        productId: p.id ?? "",
        slug: p.slug,
        name: p.name,
        size: s.size,
        image: p.img || null,
        qty: 0,
        unitPrice: p.price,
        available: s.stock,
      });
    }
  }

  const lines = guest
    .map((g) => {
      const found = variantIndex.get(g.variantId);
      if (!found) return null;
      return { ...found, qty: Math.min(g.qty, Math.max(1, found.available)) };
    })
    .filter((l): l is CartLine => Boolean(l));

  return { lines, isLoading: false };
}

export function useCartCount(): number {
  const { lines } = useCart();
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

function useInvalidateCart() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["cart"] });
}

export function useAddToCart() {
  const user = useAuth();
  const invalidate = useInvalidateCart();
  return useMutation({
    mutationFn: async ({ variantId, qty = 1 }: { variantId: string; qty?: number }) => {
      if (!variantId) throw new Error("This piece isn't ready yet — please refresh and try again.");
      if (user) return addToCartFn({ data: { variantId, qty } });
      const existing = getGuestLines();
      const next = existing.some((l) => l.variantId === variantId)
        ? existing.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + qty } : l))
        : [...existing, { variantId, qty }];
      setGuestLines(next);
      return null;
    },
    onSuccess: () => invalidate(),
  });
}

export function useSetCartQty() {
  const user = useAuth();
  const invalidate = useInvalidateCart();
  return useMutation({
    mutationFn: async ({ variantId, qty }: { variantId: string; qty: number }) => {
      if (user) return setCartItemQtyFn({ data: { variantId, qty } });
      const next =
        qty <= 0
          ? getGuestLines().filter((l) => l.variantId !== variantId)
          : getGuestLines().map((l) => (l.variantId === variantId ? { ...l, qty } : l));
      setGuestLines(next);
      return null;
    },
    onSuccess: () => invalidate(),
  });
}

export function useRemoveFromCart() {
  const user = useAuth();
  const invalidate = useInvalidateCart();
  return useMutation({
    mutationFn: async ({ variantId }: { variantId: string }) => {
      if (user) return removeCartItemFn({ data: { variantId } });
      setGuestLines(getGuestLines().filter((l) => l.variantId !== variantId));
      return null;
    },
    onSuccess: () => invalidate(),
  });
}

export function useClearCart() {
  const user = useAuth();
  const invalidate = useInvalidateCart();
  return useMutation({
    mutationFn: async () => {
      if (user) return clearCartFn();
      setGuestLines([]);
      return null;
    },
    onSuccess: () => invalidate(),
  });
}

/** Guest → account cart merge, called once right after SIGNED_IN. */
export async function mergeGuestCartIntoAccount(): Promise<void> {
  const lines = getGuestLines();
  if (!lines.length) return;
  try {
    await mergeGuestCartFn({ data: { lines } });
  } finally {
    setGuestLines([]);
  }
}

/** Read-only snapshot for the checkout server call (guest path only). */
export function getGuestCartForCheckout(): { variantId: string; qty: number }[] {
  return getGuestLines();
}
