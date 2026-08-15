-- Fix: "permission denied for schema security" for any authenticated
-- request whose RLS evaluation touches a policy that calls is_staff()/
-- has_role() — e.g. products -> categories join, which always evaluates
-- the "staff manage categories" ALL policy alongside the public SELECT one.
--
-- Root cause: migration 20260731111320 created the private `security`
-- schema (to hide the SECURITY DEFINER helpers from the linter) but never
-- granted USAGE on it to anon/authenticated. `public.is_staff`/`has_role`
-- are SECURITY INVOKER wrappers, so when they call security.is_staff(...)
-- the *caller's* role needs USAGE on that schema — not just EXECUTE on the
-- function. This went unnoticed because guest (anon) requests either never
-- hit a policy that calls is_staff(), or short-circuit past it; the first
-- authenticated request that does (any catalog read while signed in) fails.
grant usage on schema security to anon, authenticated;

-- Explicit, matching the project's existing "be explicit about grants"
-- convention (default PUBLIC-execute on function creation likely already
-- covers this, but don't rely on the default).
grant execute on function security.is_staff(uuid) to anon, authenticated;
grant execute on function security.has_role(uuid, public.app_role) to anon, authenticated;
