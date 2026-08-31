import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

function isOpaqueKey(v: string): boolean {
  return v.startsWith("sb_publishable_") || v.startsWith("sb_secret_");
}

/**
 * Resolve the caller's verified user id from the request's Authorization
 * header — the SAME session mechanism the rest of SAAJ uses. Returns null
 * for a guest. Never trusts anything in the request body.
 */
export async function identifyCaller(request: Request): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const header = request.headers.get("authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = raw && raw.split(".").length === 3 ? raw : null;
  if (!token) return null;

  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: (i, init) => {
        const h = new Headers(init?.headers);
        if (isOpaqueKey(key) && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(i, { ...init, headers: h });
      },
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data } = await supabase.auth.getClaims(token);
    return (data?.claims?.sub as string | undefined) ?? null;
  } catch {
    return null;
  }
}
