import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * Managed auth gate for the protected subtree (account + admin).
 *
 * `ssr: false` because Supabase stores the session in localStorage, which the
 * server cannot read — gating server-side would redirect-loop on hard refresh.
 * The client-only `beforeLoad` checks the live session and bounces unsigned
 * visitors to /auth. Child routes need no per-route auth code.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
