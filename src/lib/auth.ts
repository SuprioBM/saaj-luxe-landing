import { useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { ApiUser, Role } from "@/lib/api";

/**
 * SAAJ session store — backed by Supabase Auth.
 *
 * Mirrors the previous demo API so existing consumers (`useAuth()`,
 * `auth.login/register/logout/updateProfile`) keep working, but now every
 * call hits real Supabase Auth + the `profiles` / `user_roles` tables.
 */

type AuthState = { user: ApiUser | null; loading: boolean };

let state: AuthState = { user: null, loading: true };
const listeners = new Set<() => void>();
let booted = false;

const emit = () => listeners.forEach((l) => l());

const STAFF_ROLES: Role[] = ["ADMIN"];

function roleFromRows(rows: { role: string }[] | null): Role {
  if (!rows?.length) return "CUSTOMER";
  return rows.some((r) =>
    ["super_admin", "admin", "staff"].includes(r.role),
  )
    ? "ADMIN"
    : "CUSTOMER";
}

/** Build an ApiUser from the Supabase auth user + their profile/role rows. */
async function loadUser(
  uid: string,
  email: string | undefined,
): Promise<ApiUser> {
  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, phone, created_at")
      .eq("id", uid)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
  ]);

  return {
    id: uid,
    name: (profileRes.data as { name: string } | null)?.name || email?.split("@")[0] || "Member",
    email: email ?? "",
    phone: (profileRes.data as { phone: string | null } | null)?.phone ?? null,
    role: roleFromRows(rolesRes.data as { role: string }[] | null),
    createdAt:
      (profileRes.data as { created_at: string } | null)?.created_at ??
      new Date().toISOString(),
  };
}

/** React to a Supabase auth-session change (sign in / out / refresh). */
async function applySession(
  sbUser: { id: string; email?: string } | null,
): Promise<void> {
  if (!sbUser) {
    state = { user: null, loading: false };
    emit();
    return;
  }
  state = { user: null, loading: true };
  emit();
  try {
    const user = await loadUser(sbUser.id, sbUser.email);
    state = { user, loading: false };
  } catch {
    state = { user: null, loading: false };
  }
  emit();
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  // Seed initial state from any persisted session, then listen for changes.
  void supabase.auth.getSession().then(({ data }) => {
    void applySession(data.session?.user ?? null);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    void applySession(session?.user ?? null);
  });
}

export const auth = {
  subscribe(l: () => void) {
    boot();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return state.user;
  },
  loading() {
    return state.loading;
  },

  async login(email: string, password: string): Promise<ApiUser | null> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    await applySession(data.user ?? null);
    return state.user;
  },

  async register(name: string, email: string, password: string): Promise<ApiUser | null> {
    // The `handle_new_user` trigger creates the profile + customer role.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;
    // Email confirmation may be required; if no session returns, surface that.
    if (!data.session || !data.user) {
      throw new Error("Check your email to confirm your account, then sign in.");
    }
    await applySession(data.user);
    return state.user;
  },

  /** Google OAuth via the Lovable broker (iframe-safe in the preview). */
  async signInWithGoogle(): Promise<void> {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) throw result.error;
    // `redirected === true` means the browser navigated away to Google; the
    // onAuthStateChange listener will hydrate the session on return.
  },

  async updateProfile(patch: { name?: string; phone?: string }): Promise<ApiUser | null> {
    const current = state.user;
    if (!current) return null;
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      })
      .eq("id", current.id);
    if (error) throw error;
    state = {
      user: { ...current, ...patch, phone: patch.phone ?? current.phone },
      loading: false,
    };
    emit();
    return state.user;
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    state = { user: null, loading: false };
    emit();
  },
};

export function useAuth(): ApiUser | null {
  return useSyncExternalStore(auth.subscribe, auth.get, () => null);
}

export function useAuthLoading(): boolean {
  return useSyncExternalStore(
    auth.subscribe,
    auth.loading,
    () => false,
  );
}
