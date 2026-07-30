import { useSyncExternalStore } from "react";

import { api, tokenStore, type ApiUser } from "@/lib/api";

const KEY = "saaj.user.v1";

let user: ApiUser | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  if (typeof window !== "undefined") {
    try {
      if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
      else window.localStorage.removeItem(KEY);
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
    if (raw) {
      user = JSON.parse(raw) as ApiUser;
      listeners.forEach((l) => l());
    }
  } catch {
    /* ignore */
  }
};

/** Demo session used until the backend is live. */
const demoUser = (name: string, email: string): ApiUser => ({
  id: `local-${email}`,
  name,
  email,
  role: email.toLowerCase().startsWith("admin") ? "ADMIN" : "CUSTOMER",
  createdAt: new Date().toISOString(),
});

export const auth = {
  subscribe(l: () => void) {
    if (!hydrated) {
      hydrated = true;
      hydrate();
    }
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return user;
  },
  async login(email: string, password: string) {
    try {
      const res = await api.auth.login({ email, password });
      tokenStore.set(res.token);
      user = res.user;
    } catch {
      user = demoUser(email.split("@")[0].replace(/^\w/, (c) => c.toUpperCase()), email);
    }
    emit();
    return user;
  },
  async register(name: string, email: string, password: string) {
    try {
      const res = await api.auth.register({ name, email, password });
      tokenStore.set(res.token);
      user = res.user;
    } catch {
      user = demoUser(name, email);
    }
    emit();
    return user;
  },
  async updateProfile(patch: { name?: string; phone?: string }) {
    if (!user) return null;
    try {
      user = await api.auth.updateProfile(patch);
    } catch {
      user = { ...user, ...patch };
    }
    emit();
    return user;
  },
  logout() {
    void api.auth.logout().catch(() => undefined);
    tokenStore.set(null);
    user = null;
    emit();
  },
};

export function useAuth() {
  return useSyncExternalStore(auth.subscribe, auth.get, () => null);
}
