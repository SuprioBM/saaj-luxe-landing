-- SAAJ Club — membership foundation (enhancement, not a redesign).
--
-- Adds the minimum schema for a recurring monthly membership that:
--   * is optional (normal shopping is untouched),
--   * is configurable (price / discount / points live in one config row,
--     never hardcoded),
--   * is future-tier-ready (membership_tier enum, per-tier partial unique),
--   * derives "is this customer a member?" from authoritative rows only.
--
-- This migration is purely additive: new enums, new tables, new nullable
-- columns on products/profiles, new helper functions. It touches no
-- existing function, policy, or column, and nothing here is aware of the
-- payment gateway — activation is wired separately in the companion
-- migration via an orders-status trigger.

/* ------------------------------------------------------------- enums ---- */

create type public.membership_tier as enum ('NONE', 'CLUB');
create type public.membership_status as enum ('ACTIVE', 'EXPIRED', 'CANCELLED', 'PAYMENT_FAILED');
create type public.reward_ledger_kind as enum ('EARNED', 'REDEEMED', 'ADJUSTED', 'EXPIRED', 'REVERSED', 'BONUS');
create type public.order_kind as enum ('product', 'membership');

/* --------------------------------------------------- membership_config -- */
-- Single-row, typed config. The one authoritative source for the ৳50 price,
-- the 10% member discount, the points rule and the birthday reward. The
-- frontend reads this (public select) for display; every business
-- calculation reads it server-side.

create table public.membership_config (
  id                     boolean primary key default true,
  monthly_price          numeric(10,2) not null default 50 check (monthly_price >= 0),
  currency               text not null default 'BDT',
  billing_interval       text not null default 'MONTHLY',
  -- basis points: 1000 = 10.00%. bps (not a bare percent) so a future
  -- 12.5% is expressible without schema churn.
  member_discount_bps    integer not null default 1000 check (member_discount_bps between 0 and 10000),
  points_per_100_bdt     numeric(10,2) not null default 1 check (points_per_100_bdt >= 0),
  reward_points_enabled  boolean not null default true,
  birthday_reward_points integer not null default 100 check (birthday_reward_points >= 0),
  -- extra days benefits linger after current_period_end before a membership
  -- is considered lapsed. 0 = benefits stop exactly at period end.
  grace_period_days      integer not null default 0 check (grace_period_days >= 0),
  updated_at             timestamptz not null default now(),
  constraint membership_config_singleton check (id)
);

insert into public.membership_config (id) values (true);

grant select on public.membership_config to anon, authenticated;
grant all on public.membership_config to service_role;
alter table public.membership_config enable row level security;

create policy "membership config is public" on public.membership_config
  for select to anon, authenticated using (true);
create policy "staff manage membership config" on public.membership_config
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create trigger membership_config_updated_at before update on public.membership_config
  for each row execute function public.set_updated_at();

/* -------------------------------------------------------- memberships -- */
-- One membership per customer per tier over its lifetime; renewal extends
-- the ACTIVE row rather than inserting a new one. The partial unique index
-- guarantees a customer can never hold two overlapping ACTIVE memberships
-- of the same tier (spec 46.6).

create table public.memberships (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  tier                 public.membership_tier not null default 'CLUB',
  status               public.membership_status not null default 'ACTIVE',
  price                numeric(10,2) not null check (price >= 0),
  currency             text not null default 'BDT',
  started_at           timestamptz not null default now(),
  current_period_start timestamptz not null,
  current_period_end   timestamptz not null,
  -- bKash (URL-based Tokenized Checkout) has no recurring billing, so this
  -- is false for now. Kept so a future recurring provider needs no schema
  -- change. The UI must never claim auto-renewal while this is false.
  auto_renew           boolean not null default false,
  cancelled_at         timestamptz,
  payment_provider     text,
  payment_reference    text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint membership_period_valid check (current_period_end > current_period_start)
);

create index memberships_user_idx        on public.memberships (user_id);
create index memberships_status_idx      on public.memberships (status);
create index memberships_period_end_idx  on public.memberships (current_period_end);
create unique index memberships_one_active_per_tier
  on public.memberships (user_id, tier) where (status = 'ACTIVE');

grant select on public.memberships to authenticated;
grant all on public.memberships to service_role;
alter table public.memberships enable row level security;

-- Read-only for the owner + staff. All writes go through service-role
-- server functions / RPCs — a client can never mint or extend a membership.
create policy "read own membership" on public.memberships
  for select to authenticated using (auth.uid() = user_id or public.is_staff(auth.uid()));

create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

/* ------------------------------------------------------ reward_ledger -- */
-- Append-only ledger. Balance is always sum(points); balance_after is an
-- audit convenience, written best-effort under a per-user row lock.

create table public.reward_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          public.reward_ledger_kind not null,
  points        integer not null,            -- signed: +earned/-redeemed
  balance_after integer not null,
  order_id      uuid references public.orders(id) on delete set null,
  reason        text,
  actor_id      uuid references auth.users(id) on delete set null,  -- admin, for manual adjustments
  created_at    timestamptz not null default now()
);

create index reward_ledger_user_idx  on public.reward_ledger (user_id, created_at desc);
create index reward_ledger_order_idx on public.reward_ledger (order_id);

-- Idempotency: an order can be earned once and reversed once, no matter how
-- many times a webhook / status update retries.
create unique index reward_ledger_earned_once   on public.reward_ledger (order_id) where (kind = 'EARNED');
create unique index reward_ledger_reversed_once  on public.reward_ledger (order_id) where (kind = 'REVERSED');
-- Birthday bonus: at most one per customer per calendar year (reason is
-- 'birthday:<year>'), so a page refresh or a re-run never double-issues.
create unique index reward_ledger_birthday_once
  on public.reward_ledger (user_id, reason) where (kind = 'BONUS' and reason like 'birthday:%');

grant select on public.reward_ledger to authenticated;
grant all on public.reward_ledger to service_role;
alter table public.reward_ledger enable row level security;

create policy "read own reward ledger" on public.reward_ledger
  for select to authenticated using (auth.uid() = user_id or public.is_staff(auth.uid()));

/* ------------------------------------------- product membership columns -- */
-- All nullable / defaulted so every existing product keeps its exact
-- current behaviour (not exclusive, member-discount eligible at the global
-- rate, available now).

alter table public.products
  add column members_only            boolean not null default false,
  add column member_discount_eligible boolean not null default true,
  -- per-product override in bps; null = use membership_config.member_discount_bps
  add column member_discount_bps      integer check (member_discount_bps is null or member_discount_bps between 0 and 10000),
  -- null = available immediately to the public
  add column available_from          timestamptz,
  -- null = members get the same date as the public (no early access)
  add column member_available_from   timestamptz;

create index products_members_only_idx on public.products (members_only) where (members_only);

/* -------------------------------------------------- profile DOB (birthday) */

alter table public.profiles add column date_of_birth date;

/* -------------------------------------------------- authoritative reads -- */
-- SECURITY DEFINER helper in the private `security` schema (same pattern as
-- security.is_staff), with a SECURITY INVOKER public wrapper. Reads the
-- memberships table directly, honouring the configured grace period.

create or replace function security.active_membership(_user_id uuid)
returns table (
  membership_id        uuid,
  tier                 public.membership_tier,
  status               public.membership_status,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  auto_renew           boolean,
  cancelled_at         timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.tier, m.status, m.current_period_start, m.current_period_end,
         m.auto_renew, m.cancelled_at
  from public.memberships m, public.membership_config c
  where m.user_id = _user_id
    and m.status = 'ACTIVE'
    and m.current_period_end + make_interval(days => c.grace_period_days) > now()
  order by m.current_period_end desc
  limit 1;
$$;

create or replace function public.active_membership(_user_id uuid)
returns table (
  membership_id        uuid,
  tier                 public.membership_tier,
  status               public.membership_status,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  auto_renew           boolean,
  cancelled_at         timestamptz
)
language sql stable security invoker set search_path = public as $$
  select * from security.active_membership(_user_id);
$$;

create or replace function security.is_active_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from security.active_membership(_user_id));
$$;

create or replace function public.is_active_member(_user_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select security.is_active_member(_user_id);
$$;

grant usage on schema security to anon, authenticated;  -- idempotent; already granted
grant execute on function security.active_membership(uuid) to anon, authenticated;
grant execute on function security.is_active_member(uuid) to anon, authenticated;

/* -------------------------------- resolved per-product member discount -- */
-- The single place the "is this product eligible, and at what rate?"
-- decision is made — used by place_order (companion migration) and by the
-- read-only member-pricing API. Returns bps (0 = no member discount).

create or replace function public.product_member_discount_bps(_product_id uuid)
returns integer language sql stable security invoker set search_path = public as $$
  select case
           when p.member_discount_eligible
             then coalesce(p.member_discount_bps, c.member_discount_bps)
           else 0
         end
  from public.products p, public.membership_config c
  where p.id = _product_id;
$$;

grant execute on function public.product_member_discount_bps(uuid) to anon, authenticated;

/* ------------------------------------------------- lapse expired members */
-- Flips ACTIVE → EXPIRED once the period (plus grace) has fully elapsed.
-- Safe to call on any schedule (cron / scheduled task); benefits are
-- already gated by active_membership() regardless, this just keeps the
-- stored status honest and frees the partial unique slot for a re-join.

create or replace function public.expire_memberships()
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_count integer;
begin
  with c as (select grace_period_days from public.membership_config where id = true)
  update public.memberships m
     set status = 'EXPIRED', updated_at = now()
    from c
   where m.status = 'ACTIVE'
     and m.current_period_end + make_interval(days => c.grace_period_days) <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_memberships() from public, anon, authenticated;
grant execute on function public.expire_memberships() to service_role;
