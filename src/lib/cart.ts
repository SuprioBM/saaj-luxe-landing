import { useSyncExternalStore } from "react";

export type CartLine = { slug: string; qty: number };

let lines: CartLine[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const cart = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return lines;
  },
  add(slug: string, qty = 1) {
    const existing = lines.find((l) => l.slug === slug);
    lines = existing
      ? lines.map((l) => (l.slug === slug ? { ...l, qty: l.qty + qty } : l))
      : [...lines, { slug, qty }];
    emit();
  },
  setQty(slug: string, qty: number) {
    lines = qty <= 0 ? lines.filter((l) => l.slug !== slug) : lines.map((l) => (l.slug === slug ? { ...l, qty } : l));
    emit();
  },
  remove(slug: string) {
    lines = lines.filter((l) => l.slug !== slug);
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
