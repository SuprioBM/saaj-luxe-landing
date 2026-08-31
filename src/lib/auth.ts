import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * SAAJ session store — backed by Supabase Auth.
 *
 * `useAuth()`, `auth.login/register/logout/updateProfile` are the whole
 * identity model; role comes from `user_roles` (never trusted from the
 * client for authorization — every privileged server fn re-checks it).
 */

export type Role = "CUSTOMER" | "ADMIN";

export type ApiUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  role: Role;
  createdAt: string;
};

type AuthState = { user: ApiUser | null; loading: boolean };

let state: AuthState = { user: null, loading: true };
const listeners = new Set<() => void>();
let booted = false;

const emit = () => listeners.forEach((l) => l());

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
      .select("name, phone, date_of_birth, created_at")
      .eq("id", uid)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
  ]);

  return {
    id: uid,
    name: (profileRes.data as { name: string } | null)?.name || email?.split("@")[0] || "Member",
    email: email ?? "",
    phone: (profileRes.data as { phone: string | null } | null)?.phone ?? null,
    dateOfBirth: (profileRes.data as { date_of_birth: string | null } | null)?.date_of_birth ?? null,
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

/**
 * Single source of truth for every auth redirect (email confirm, password
 * reset, Google OAuth). Set VITE_SITE_URL once in .env for a stable value
 * across dev/staging/prod; unset, it falls back to the current browser
 * origin so plain localhost dev still works with zero configuration.
 */
const siteUrl = (): string => {
  const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "");
  if (configured) return configured;
  return typeof window !== "undefined" ? window.location.origin : "";
};

const emailRedirectTo = () => (typeof window !== "undefined" ? `${siteUrl()}/auth` : undefined);

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
      options: { data: { name }, emailRedirectTo: emailRedirectTo() },
    });
    if (error) throw error;
    // Email confirmation may be required; if no session returns, surface that.
    if (!data.session || !data.user) {
      throw new Error("Check your email to confirm your account, then sign in.");
    }
    await applySession(data.user);
    return state.user;
  },

  async resendVerification(email: string): Promise<void> {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) throw error;
  },

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${siteUrl()}/reset-password` : undefined,
    });
    if (error) throw error;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /**
   * Google OAuth directly through Supabase Auth (the Google Cloud OAuth
   * client is configured against this project's own Supabase callback, not
   * a third-party broker). `signInWithOAuth` redirects the browser itself
   * on success — this call does not return; the session is picked up by
   * `onAuthStateChange` after Google/Supabase redirect back to `siteUrl()`.
   */
  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: siteUrl() },
    });
    if (error) throw error;
  },

  async updateProfile(patch: {
    name?: string;
    phone?: string;
    dateOfBirth?: string | null;
  }): Promise<ApiUser | null> {
    const current = state.user;
    if (!current) return null;
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.dateOfBirth !== undefined ? { date_of_birth: patch.dateOfBirth } : {}),
      })
      .eq("id", current.id);
    if (error) throw error;
    state = {
      user: {
        ...current,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        phone: patch.phone ?? current.phone,
        dateOfBirth: patch.dateOfBirth !== undefined ? patch.dateOfBirth : current.dateOfBirth,
      },
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

/**
 * Sign-out hygiene: stop in-flight queries, drop every cached response (so a
 * signed-out browser can never flash another account's admin/account data),
 * then send the visitor somewhere that doesn't require auth.
 */
export function useSignOut() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await qc.cancelQueries();
    await auth.logout();
    qc.clear();
    await navigate({ to: "/auth", replace: true });
  };
}
