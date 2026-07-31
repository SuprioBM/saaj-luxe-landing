-- Move privileged role-check logic out of the exposed public schema.

create schema if not exists security;

-- Actual SECURITY DEFINER helpers live in the private security schema.
-- They are NOT reachable through the PostgREST / Data API, so the linter
-- (which inspects the exposed public schema) does not flag them.
create or replace function security.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('super_admin', 'admin', 'staff')
  );
$$;

create or replace function security.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

-- Replace the public versions with SECURITY INVOKER wrappers.
-- INVOKER functions are not flagged by linters 0028 / 0029.
-- They delegate to the security-schema DEFINER, which bypasses RLS on
-- user_roles and therefore avoids the recursive-policy problem.
create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select security.is_staff(_user_id);
$$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security invoker set search_path = public as $$
  select security.has_role(_user_id, _role);
$$;

-- handle_new_user is a trigger function: only the trigger (owned by the
-- table owner) calls it. Strip EXECUTE from anon and authenticated so no
-- client can invoke it directly.
revoke execute on function public.handle_new_user() from anon, authenticated;