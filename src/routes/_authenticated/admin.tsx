import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * Role gate for the entire `/admin/*` subtree.
 *
 * `_authenticated/route.tsx` only proves "logged in" — this layout is what
 * actually restricts admin access to staff. It independently re-checks the
 * role server-side via the `is_staff()` RPC (reads `user_roles` in Postgres)
 * on every navigation into `/admin`; it never trusts a role cached on the
 * client. Every admin server function *also* re-checks this — this gate is
 * about UX (don't render the admin shell for a customer), not the actual
 * security boundary.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/auth" });

    const { data: isStaff, error } = await supabase.rpc("is_staff", { _user_id: uid });
    if (error || !isStaff) throw redirect({ to: "/account" });
  },
  component: () => <Outlet />,
});
