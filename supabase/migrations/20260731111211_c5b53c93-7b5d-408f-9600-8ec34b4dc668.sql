-- Security linter hardening for SAAJ foundation

-- 1. set_updated_at: pin search_path (clears 'Function Search Path Mutable')
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Revoke default public EXECUTE from all SECURITY DEFINER functions
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.has_role(uuid, public.app_role) from public;
revoke execute on function public.is_staff(uuid) from public;

-- 3. handle_new_user is a trigger function only — no direct grants needed.

-- 4. Role-check helpers are referenced inside RLS policies on public catalog
--    tables (products, categories, variants, images), so both anon and
--    authenticated must retain EXECUTE for policy evaluation.
grant execute on function public.is_staff(uuid) to anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;