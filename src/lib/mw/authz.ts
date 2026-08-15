import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Every admin/staff server function must independently verify the caller's
 * role server-side — never trust a role claimed by the client. This chains
 * on top of `requireSupabaseAuth` (so `context.supabase`/`context.userId`
 * are already populated) and calls the `public.is_staff()` RPC, which reads
 * `user_roles` directly in Postgres.
 */
export const requireStaff = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("is_staff", {
      _user_id: context.userId,
    });
    if (error || !data) {
      throw new Error("Forbidden: staff access required");
    }
    return next();
  });
