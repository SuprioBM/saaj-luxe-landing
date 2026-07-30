import { useSyncExternalStore } from "react";

const KEY = "saaj.wishlist.v1";

let slugs: string[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(slugs));
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
      slugs = parsed.filter((s): s is string => typeof s === "string");
      listeners.forEach((l) => l());
    }
  } catch {
    /* ignore */
  }
};

export const wishlist = {
  subscribe(l: () => void) {
    if (!hydrated) {
      hydrated = true;
      hydrate();
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return slugs;
  },
  has(slug: string) {
    return slugs.includes(slug);
  },
  toggle(slug: string) {
    slugs = slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [slug, ...slugs];
    emit();
  },
  remove(slug: string) {
    slugs = slugs.filter((s) => s !== slug);
    emit();
  },
};

const emptyServer: string[] = [];

export function useWishlist() {
  return useSyncExternalStore(wishlist.subscribe, wishlist.get, () => emptyServer);
}
