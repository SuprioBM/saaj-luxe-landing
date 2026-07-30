import { useSyncExternalStore } from "react";

import { findProduct, stockForSize } from "@/data/catalog";

export type CartLine = { slug: string; size: string; qty: number };

const KEY = "saaj.cart.v2";

let lines: CartLine[] = [];
const listeners = new Set<() => void>();

const persist = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable */
  }
};

const emit = () => {
  persist();
  listeners.forEach((l) => l());
};

const hydrate = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      lines = parsed.filter(
        (l): l is CartLine =>
          l && typeof l.slug === "string" && typeof l.size === "string" && typeof l.qty === "number",
      );
      listeners.forEach((l) => l());
    }
  } catch {
    /* ignore */
  }
};

let hydrated = false;

const maxFor = (slug: string, size: string) => {
  const product = findProduct(slug);
  return product ? stockForSize(product, size) : 0;
};

const keyOf = (l: CartLine) => `${l.slug}__${l.size}`;

export const cart = {
  subscribe(l: () => void) {
    if (!hydrated) {
      hydrated = true;
      hydrate();
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return lines;
  },
  add(slug: string, size: string, qty = 1) {
    const max = maxFor(slug, size);
    if (max <= 0) return false;
    const id = `${slug}__${size}`;
    const existing = lines.find((l) => keyOf(l) === id);
    lines = existing
      ? lines.map((l) => (keyOf(l) === id ? { ...l, qty: Math.min(max, l.qty + qty) } : l))
      : [...lines, { slug, size, qty: Math.min(max, qty) }];
    emit();
    return true;
  },
  setQty(slug: string, size: string, qty: number) {
    const id = `${slug}__${size}`;
    const max = maxFor(slug, size);
    lines =
      qty <= 0
        ? lines.filter((l) => keyOf(l) !== id)
        : lines.map((l) => (keyOf(l) === id ? { ...l, qty: Math.min(max, qty) } : l));
    emit();
  },
  remove(slug: string, size: string) {
    const id = `${slug}__${size}`;
    lines = lines.filter((l) => keyOf(l) !== id);
    emit();
  },
  clear() {
    lines = [];
    emit();
  },
};

const emptyServer: CartLine[] = [];

export function useCart() {
  return useSyncExternalStore(cart.subscribe, cart.get, () => emptyServer);
}

export function useCartCount() {
  const l = useCart();
  return l.reduce((sum, x) => sum + x.qty, 0);
}
