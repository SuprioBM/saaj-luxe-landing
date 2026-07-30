import { useSyncExternalStore } from "react";

import type { CartLine } from "@/lib/cart";

export type OrderCustomer = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  method: "card" | "upi" | "cod";
};

export type Order = {
  id: string;
  placedAt: string;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  total: number;
  customer: OrderCustomer;
};

const KEY = "saaj.orders.v1";

let orders: Order[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(orders));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
};

let hydrated = false;
const hydrate = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      orders = parsed as Order[];
      listeners.forEach((l) => l());
    }
  } catch {
    /* ignore */
  }
};

const makeId = () => {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `SAAJ-${n}`;
};

export const ordersStore = {
  subscribe(l: () => void) {
    if (!hydrated) {
      hydrated = true;
      hydrate();
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return orders;
  },
  find(id: string) {
    if (!hydrated) {
      hydrated = true;
      hydrate();
    }
    return orders.find((o) => o.id === id) ?? null;
  },
  place(input: Omit<Order, "id" | "placedAt">) {
    const order: Order = { ...input, id: makeId(), placedAt: new Date().toISOString() };
    orders = [order, ...orders];
    emit();
    return order;
  },
};

const emptyServer: Order[] = [];

export function useOrders() {
  return useSyncExternalStore(ordersStore.subscribe, ordersStore.get, () => emptyServer);
}
