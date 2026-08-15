import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Like `requireSupabaseAuth`, but never throws for a missing/invalid token —
 * `context.userId` is simply `null`. Used by server fns that must serve both
 * guests and signed-in customers (checkout, coupon preview) while still
 * knowing *for certain* who the caller is when they are signed in.
 */
export const optionalSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Server is not configured (missing Supabase environment variables).");
    }

    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
    const token = rawToken && rawToken.split(".").length === 3 ? rawToken : null;

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    let userId: string | null = null;
    if (token) {
      const { data } = await supabase.auth.getClaims(token);
      userId = (data?.claims?.sub as string | undefined) ?? null;
    }

    return next({ context: { supabase, userId } });
  },
);
