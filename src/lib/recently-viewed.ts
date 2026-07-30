import { useSyncExternalStore } from "react";

const KEY = "saaj.recent.v1";
const LIMIT = 8;

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

export const recentlyViewed = {
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
  push(slug: string) {
    if (slugs[0] === slug) return;
    slugs = [slug, ...slugs.filter((s) => s !== slug)].slice(0, LIMIT);
    emit();
  },
};

const emptyServer: string[] = [];

export function useRecentlyViewed() {
  return useSyncExternalStore(recentlyViewed.subscribe, recentlyViewed.get, () => emptyServer);
}
