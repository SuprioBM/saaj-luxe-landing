-- SAAJ Club — order / checkout / reward integration.
--
-- Builds on 20260831140000_membership_foundation.sql. Three concerns:
--   1. Order columns that snapshot what membership actually applied at
--      purchase time (spec 21 — history must not shift when a membership
--      later lapses), plus the order_kind / membership_id link.
--   2. place_order (v4, identical signature) — server-authoritative member
--      pricing, exclusive-product + early-access enforcement, and a
--      projected reward-point figure. Still the single pricing authority.
--   3. place_membership_order + an orders-status trigger that activates the
--      membership only after the order is independently marked paid — the
--      payment gateway code is never touched, the existing bKash callback's
--      finalize_order_paid UPDATE is what fires this.
--   4. A reward-points trigger: award once on the first eligible/paid
--      status, reverse once on cancel/refund. Idempotent via the ledger's
--      partial unique indexes.

/* --------------------------------------------------- order snapshot cols */

alter table public.orders
  add column order_kind             public.order_kind not null default 'product',
  add column membership_id          uuid references public.memberships(id) on delete set null,
  -- snapshot: what tier the buyer held when this order was placed
  add column membership_tier        public.membership_tier not null default 'NONE',
  -- snapshot: total member discount applied across all lines (BDT)
  add column membership_discount    numeric(10,2) not null default 0,
  -- snapshot: points this order is worth once it reaches an eligible state
  add column reward_points_earned   integer not null default 0;

create index orders_kind_idx on public.orders (order_kind);
create index orders_membership_idx on public.orders (membership_id) where (membership_id is not null);

/* ------------------------------------------------------- place_order v4 -- */
-- Same 8-arg signature as the bKash v3 (20260822130000). Additions are
-- membership-aware pricing/eligibility; the coupon, shipping and stock
-- logic are byte-for-byte the existing behaviour.

create or replace function public.place_order(
  p_user_id uuid,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_coupon_code text default null,
  p_guest_token_hash text default null,
  p_payment_method text default 'bkash'
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_variant record;
  v_qty integer;
  v_base_price numeric(10,2);
  v_line_price numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  v_shipping numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_order_id uuid;
  v_reference text;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_coupon_id uuid;
  v_coupon_kind public.coupon_kind;
  v_coupon_value numeric(10,2);
  v_coupon_min_subtotal numeric(10,2);
  v_coupon_starts_at timestamptz;
  v_coupon_expires_at timestamptz;
  v_coupon_usage_limit integer;
  v_coupon_used_count integer;
  v_coupon_active boolean;
  v_payment_method public.payment_method;
  -- membership
  v_config public.membership_config;
  v_is_member boolean := false;
  v_member_tier public.membership_tier := 'NONE';
  v_membership_discount numeric(10,2) := 0;
  v_reward_points integer := 0;
  v_disc_bps integer;
  v_mem_from timestamptz;
begin
  if p_payment_method not in ('cod', 'bkash') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  v_payment_method := p_payment_method::public.payment_method;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  select * into v_config from public.membership_config where id = true;
  if p_user_id is not null and public.is_active_member(p_user_id) then
    v_is_member := true;
    v_member_tier := 'CLUB';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select
      pv.id as variant_id, pv.size, pv.stock, pv.reserved,
      p.id as product_id, p.slug, p.name, p.price, p.discount_price, p.status,
      p.members_only, p.member_discount_eligible, p.member_discount_bps,
      p.available_from, p.member_available_from
    into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
    for update of pv;

    if v_variant.variant_id is null then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;
    if v_variant.status <> 'active' then
      raise exception 'PRODUCT_UNAVAILABLE: %', v_variant.name;
    end if;

    -- SAAJ Club exclusive: visible to everyone, purchasable only by an
    -- active member. Backend-enforced (spec 9) — a bypassed frontend hits
    -- this.
    if v_variant.members_only and not v_is_member then
      raise exception 'MEMBERS_ONLY: %', v_variant.name;
    end if;

    -- Early access / coming soon: members may buy from
    -- member_available_from (falling back to available_from); the public
    -- only from available_from.
    v_mem_from := coalesce(v_variant.member_available_from, v_variant.available_from);
    if v_is_member then
      if v_mem_from is not null and now() < v_mem_from then
        raise exception 'NOT_YET_AVAILABLE: %', v_variant.name;
      end if;
    else
      if v_variant.available_from is not null and now() < v_variant.available_from then
        raise exception 'NOT_YET_AVAILABLE: %', v_variant.name;
      end if;
    end if;

    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QTY';
    end if;
    if (v_variant.stock - v_variant.reserved) < v_qty then
      raise exception 'INSUFFICIENT_STOCK: %', v_variant.name;
    end if;

    v_base_price := coalesce(v_variant.discount_price, v_variant.price);
    v_line_price := v_base_price;
    if v_is_member and v_variant.member_discount_eligible then
      v_disc_bps := coalesce(v_variant.member_discount_bps, v_config.member_discount_bps);
      if v_disc_bps > 0 then
        v_line_price := round(v_base_price * (10000 - v_disc_bps)::numeric / 10000, 2);
        v_membership_discount := v_membership_discount + (v_base_price - v_line_price) * v_qty;
      end if;
    end if;
    v_subtotal := v_subtotal + v_line_price * v_qty;

    v_lines := v_lines || jsonb_build_object(
      'variant_id', v_variant.variant_id,
      'product_id', v_variant.product_id,
      'name', v_variant.name,
      'slug', v_variant.slug,
      'size', v_variant.size,
      'image_url', (
        select pi.url from public.product_images pi
        where pi.product_id = v_variant.product_id
        order by pi.is_primary desc, pi.position asc limit 1
      ),
      'qty', v_qty,
      'unit_price', v_line_price
    );

    if v_payment_method = 'cod' then
      update public.product_variants set stock = greatest(0, stock - v_qty) where id = v_variant.variant_id;
    else
      update public.product_variants set reserved = reserved + v_qty where id = v_variant.variant_id;
    end if;
  end loop;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select id, kind, value, min_subtotal, starts_at, expires_at, usage_limit, used_count, active
      into v_coupon_id, v_coupon_kind, v_coupon_value, v_coupon_min_subtotal,
           v_coupon_starts_at, v_coupon_expires_at, v_coupon_usage_limit, v_coupon_used_count, v_coupon_active
      from public.coupons where lower(code) = lower(trim(p_coupon_code)) for update;

    if v_coupon_id is null or not v_coupon_active then
      raise exception 'INVALID_COUPON';
    end if;
    if v_coupon_starts_at > now() or (v_coupon_expires_at is not null and v_coupon_expires_at < now()) then
      raise exception 'COUPON_EXPIRED';
    end if;
    if v_subtotal < v_coupon_min_subtotal then
      raise exception 'COUPON_MIN_SUBTOTAL';
    end if;
    if v_coupon_usage_limit is not null and v_coupon_used_count >= v_coupon_usage_limit then
      raise exception 'COUPON_LIMIT_REACHED';
    end if;
    if p_user_id is not null and exists (
      select 1 from public.coupon_redemptions where coupon_id = v_coupon_id and user_id = p_user_id
    ) then
      raise exception 'COUPON_ALREADY_USED';
    end if;

    v_discount := case when v_coupon_kind = 'fixed' then v_coupon_value
                        else round(v_subtotal * v_coupon_value / 100, 2) end;
    if v_discount > v_subtotal then
      v_discount := v_subtotal;
    end if;
  end if;

  v_shipping := case when (v_subtotal - v_discount) <= 0 or (v_subtotal - v_discount) >= 5000
                      then 0 else 120 end;
  v_total := v_subtotal - v_discount + v_shipping;

  -- Projected reward points (spec 46.8): floor of eligible merchandise spend
  -- (after member discount AND coupon, before shipping) — members only.
  -- Snapshotted onto the order; the ledger row is written later by the
  -- reward trigger, only once the order reaches an eligible state.
  if v_is_member and v_config.reward_points_enabled then
    v_reward_points := floor(greatest(0, v_subtotal - v_discount) / 100 * v_config.points_per_100_bdt)::integer;
  end if;

  v_reference := 'SAAJ-' || to_char(now(), 'YYMMDD') || '-' || lpad(floor(random() * 999999)::text, 6, '0');

  insert into public.orders (
    reference, user_id, status, customer_name, customer_email, customer_phone,
    shipping_address, billing_address, subtotal, discount, tax, shipping, total, coupon_id,
    guest_access_token_hash, payment_method,
    order_kind, membership_tier, membership_discount, reward_points_earned
  ) values (
    v_reference, p_user_id, 'pending',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    p_shipping_address, p_billing_address,
    v_subtotal, v_discount, 0, v_shipping, v_total, v_coupon_id,
    case when p_user_id is null then p_guest_token_hash else null end,
    v_payment_method,
    'product', v_member_tier, v_membership_discount, v_reward_points
  ) returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, product_slug, size, image_url, qty, unit_price
    ) values (
      v_order_id,
      (v_line->>'product_id')::uuid,
      (v_line->>'variant_id')::uuid,
      v_line->>'name', v_line->>'slug', v_line->>'size', v_line->>'image_url',
      (v_line->>'qty')::integer, (v_line->>'unit_price')::numeric
    );
  end loop;

  if v_coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_coupon_id;
    insert into public.coupon_redemptions (coupon_id, user_id, order_id) values (v_coupon_id, p_user_id, v_order_id);
  end if;

  insert into public.payments (order_id, provider, status, amount, currency)
  values (v_order_id, p_payment_method, 'requires_payment', v_total, 'bdt');

  if p_user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', p_user_id, 'order_placed', 'Order placed',
            'Your order ' || v_reference || ' has been received.', '/order/' || v_reference);
  end if;
  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'order_placed', 'New order', v_reference || ' — ' || (p_customer->>'name'), '/admin/orders');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'order.create', 'order', v_order_id::text,
          jsonb_build_object('reference', v_reference, 'total', v_total, 'payment_method', p_payment_method,
                             'membership_tier', v_member_tier, 'membership_discount', v_membership_discount));

  return jsonb_build_object(
    'order_id', v_order_id, 'reference', v_reference,
    'total', v_total, 'subtotal', v_subtotal, 'discount', v_discount, 'shipping', v_shipping,
    'payment_method', p_payment_method,
    'is_member', v_is_member, 'membership_discount', v_membership_discount,
    'reward_points_earned', v_reward_points
  );
end;
$$;

revoke execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text, text) to service_role;

/* ------------------------------------------------ place_membership_order */
-- Creates the membership *purchase* order (marker order, no line items) +
-- its payment row. Does NOT create the membership — that only happens once
-- the order is independently marked paid (trigger below). Blocks a second
-- overlapping membership and a double-submit.

create or replace function public.place_membership_order(
  p_user_id uuid,
  p_customer jsonb,
  p_tier text default 'CLUB'
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_config public.membership_config;
  v_tier public.membership_tier;
  v_price numeric(10,2);
  v_order_id uuid;
  v_reference text;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_tier <> 'CLUB' then
    raise exception 'INVALID_TIER';
  end if;
  v_tier := p_tier::public.membership_tier;

  select * into v_config from public.membership_config where id = true;
  v_price := v_config.monthly_price;

  if exists (select 1 from security.active_membership(p_user_id) am where am.tier = v_tier) then
    raise exception 'ALREADY_MEMBER';
  end if;
  if exists (
    select 1 from public.orders
    where user_id = p_user_id and order_kind = 'membership'
      and status in ('pending', 'processing')
  ) then
    raise exception 'MEMBERSHIP_ORDER_PENDING';
  end if;

  v_reference := 'SAAJ-CLUB-' || to_char(now(), 'YYMMDD') || '-' || lpad(floor(random() * 999999)::text, 6, '0');

  insert into public.orders (
    reference, user_id, status, order_kind,
    customer_name, customer_email, customer_phone,
    shipping_address, billing_address,
    subtotal, discount, tax, shipping, total, coupon_id,
    guest_access_token_hash, payment_method, membership_tier
  ) values (
    v_reference, p_user_id, 'pending', 'membership',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    '{}'::jsonb, null,
    v_price, 0, 0, 0, v_price, null,
    null, 'bkash', v_tier
  ) returning id into v_order_id;

  insert into public.payments (order_id, provider, status, amount, currency)
  values (v_order_id, 'bkash', 'requires_payment', v_price, 'bdt');

  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'membership_signup', 'SAAJ Club sign-up',
          v_reference || ' — ' || coalesce(p_customer->>'name', 'member'), '/admin/members');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'membership.order_create', 'order', v_order_id::text,
          jsonb_build_object('reference', v_reference, 'tier', p_tier, 'price', v_price));

  return jsonb_build_object('order_id', v_order_id, 'reference', v_reference, 'total', v_price, 'tier', p_tier);
end;
$$;

revoke execute on function public.place_membership_order(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.place_membership_order(uuid, jsonb, text) to service_role;

/* -------------------------------------- activate membership once paid -- */

create or replace function security.activate_membership_from_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_config public.membership_config;
  v_provider text;
  v_txn text;
  v_existing public.memberships;
  v_membership_id uuid;
  v_period_end timestamptz;
  v_renewal boolean := false;
begin
  select o.id, o.user_id, o.reference, o.total, o.order_kind, o.status, o.membership_tier, o.membership_id
    into v_order
    from public.orders o where o.id = p_order_id for update;

  if v_order.id is null then return; end if;
  if v_order.order_kind <> 'membership' then return; end if;
  if v_order.status <> 'paid' then return; end if;
  if v_order.membership_id is not null then return; end if;  -- idempotent
  if v_order.user_id is null then return; end if;

  select * into v_config from public.membership_config where id = true;
  select p.provider, p.gateway_transaction_id into v_provider, v_txn
    from public.payments p where p.order_id = p_order_id limit 1;

  select * into v_existing
    from public.memberships
    where user_id = v_order.user_id and tier = coalesce(v_order.membership_tier, 'CLUB')
    order by current_period_end desc
    limit 1
    for update;

  if v_existing.id is not null and v_existing.status = 'ACTIVE' and v_existing.current_period_end > now() then
    v_renewal := true;
    update public.memberships
       set current_period_end = v_existing.current_period_end + interval '1 month',
           price = v_order.total,
           payment_provider = coalesce(v_provider, payment_provider),
           payment_reference = coalesce(v_txn, payment_reference),
           updated_at = now()
     where id = v_existing.id
     returning id, current_period_end into v_membership_id, v_period_end;
  elsif v_existing.id is not null then
    v_period_end := now() + interval '1 month';
    update public.memberships
       set status = 'ACTIVE',
           current_period_start = now(),
           current_period_end = v_period_end,
           cancelled_at = null,
           auto_renew = false,
           price = v_order.total,
           payment_provider = v_provider,
           payment_reference = v_txn,
           updated_at = now()
     where id = v_existing.id
     returning id into v_membership_id;
  else
    v_period_end := now() + interval '1 month';
    insert into public.memberships (
      user_id, tier, status, price, currency,
      started_at, current_period_start, current_period_end,
      auto_renew, payment_provider, payment_reference
    ) values (
      v_order.user_id, coalesce(v_order.membership_tier, 'CLUB'), 'ACTIVE', v_order.total, v_config.currency,
      now(), now(), v_period_end,
      false, v_provider, v_txn
    ) returning id into v_membership_id;
  end if;

  update public.orders set membership_id = v_membership_id where id = p_order_id;

  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('user', v_order.user_id, 'membership_active',
          case when v_renewal then 'SAAJ Club renewed' else 'Welcome to SAAJ Club' end,
          case when v_renewal
               then 'Your SAAJ Club membership now runs to ' || to_char(v_period_end, 'DD Mon YYYY') || '.'
               else 'Your SAAJ Club benefits are active until ' || to_char(v_period_end, 'DD Mon YYYY') || '.' end,
          '/account/membership');
  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'membership_active',
          case when v_renewal then 'SAAJ Club renewal' else 'New SAAJ Club member' end,
          v_order.reference, '/admin/members');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_order.user_id,
          case when v_renewal then 'membership.renew' else 'membership.activate' end,
          'membership', v_membership_id::text,
          jsonb_build_object('order_id', p_order_id, 'period_end', v_period_end, 'renewal', v_renewal));
end;
$$;

revoke execute on function security.activate_membership_from_order(uuid) from public, anon, authenticated;
grant execute on function security.activate_membership_from_order(uuid) to service_role;

create or replace function public.tg_membership_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_kind = 'membership'
     and new.status = 'paid'
     and old.status is distinct from 'paid'
     and new.membership_id is null then
    perform security.activate_membership_from_order(new.id);
  end if;
  return new;
end;
$$;

create trigger membership_order_paid
  after update of status on public.orders
  for each row execute function public.tg_membership_order_paid();

/* -------------------------------------------- reward points on status -- */

create or replace function public.tg_order_reward_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_earned record;
  v_balance integer;
begin
  if new.order_kind <> 'product' or new.user_id is null then
    return new;
  end if;

  -- Award once, when the order first reaches paid/shipped/delivered.
  if new.status in ('paid', 'shipped', 'delivered')
     and old.status not in ('paid', 'shipped', 'delivered')
     and coalesce(new.reward_points_earned, 0) > 0 then
    perform 1 from public.reward_ledger where user_id = new.user_id for update;
    select coalesce(sum(points), 0) into v_balance from public.reward_ledger where user_id = new.user_id;
    begin
      insert into public.reward_ledger (user_id, kind, points, balance_after, order_id, reason)
      values (new.user_id, 'EARNED', new.reward_points_earned,
              v_balance + new.reward_points_earned, new.id, 'Order ' || new.reference);
      insert into public.notifications (audience, user_id, kind, title, body, link)
      values ('user', new.user_id, 'reward_earned', 'Reward points earned',
              'You earned ' || new.reward_points_earned || ' points on order ' || new.reference || '.',
              '/account/membership');
    exception when unique_violation then
      null;  -- already earned for this order
    end;
  end if;

  -- Reverse once, if an earned order is later cancelled/refunded.
  if new.status in ('cancelled', 'refunded')
     and old.status not in ('cancelled', 'refunded') then
    for v_earned in
      select rl.user_id, rl.points from public.reward_ledger rl
      where rl.order_id = new.id and rl.kind = 'EARNED'
    loop
      perform 1 from public.reward_ledger where user_id = v_earned.user_id for update;
      select coalesce(sum(points), 0) into v_balance from public.reward_ledger where user_id = v_earned.user_id;
      begin
        insert into public.reward_ledger (user_id, kind, points, balance_after, order_id, reason)
        values (v_earned.user_id, 'REVERSED', -v_earned.points,
                v_balance - v_earned.points, new.id, 'Reversal — order ' || new.reference);
      exception when unique_violation then
        null;
      end;
    end loop;
  end if;

  return new;
end;
$$;

create trigger order_reward_points
  after update of status on public.orders
  for each row execute function public.tg_order_reward_points();

/* ------------------------------------------------ membership cancellation */

create or replace function public.cancel_membership(
  p_user_id uuid,
  p_immediate boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_m public.memberships;
begin
  select * into v_m from public.memberships
    where user_id = p_user_id and status = 'ACTIVE'
    order by current_period_end desc limit 1 for update;
  if v_m.id is null then
    raise exception 'NO_ACTIVE_MEMBERSHIP';
  end if;

  if p_immediate then
    update public.memberships
       set status = 'CANCELLED', cancelled_at = now(), auto_renew = false,
           current_period_end = least(current_period_end, now()), updated_at = now()
     where id = v_m.id;
  else
    update public.memberships
       set auto_renew = false, cancelled_at = now(), updated_at = now()
     where id = v_m.id;
  end if;

  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('user', p_user_id, 'membership_cancelled', 'SAAJ Club cancelled',
          case when p_immediate
               then 'Your SAAJ Club membership has ended.'
               else 'Auto-renewal is off. Your benefits stay active until '
                    || to_char(v_m.current_period_end, 'DD Mon YYYY') || '.' end,
          '/account/membership');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'membership.cancel', 'membership', v_m.id::text,
          jsonb_build_object('immediate', p_immediate));

  return jsonb_build_object(
    'status', case when p_immediate then 'CANCELLED' else 'ACTIVE' end,
    'current_period_end', v_m.current_period_end
  );
end;
$$;

revoke execute on function public.cancel_membership(uuid, boolean) from public, anon, authenticated;
grant execute on function public.cancel_membership(uuid, boolean) to service_role;

/* ---------------------------------------------------- admin operations -- */

create or replace function public.admin_set_membership(
  p_user_id uuid,
  p_status text,
  p_period_end timestamptz,
  p_actor_id uuid,
  p_reason text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_config public.membership_config;
  v_m public.memberships;
  v_id uuid;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  if p_status not in ('ACTIVE', 'EXPIRED', 'CANCELLED') then raise exception 'INVALID_STATUS'; end if;
  select * into v_config from public.membership_config where id = true;

  select * into v_m from public.memberships
    where user_id = p_user_id and tier = 'CLUB'
    order by current_period_end desc limit 1 for update;

  if p_status = 'ACTIVE' then
    if p_period_end is null or p_period_end <= now() then raise exception 'PERIOD_END_REQUIRED'; end if;
    if v_m.id is null then
      insert into public.memberships (
        user_id, tier, status, price, currency,
        started_at, current_period_start, current_period_end, auto_renew, payment_provider
      ) values (
        p_user_id, 'CLUB', 'ACTIVE', v_config.monthly_price, v_config.currency,
        now(), now(), p_period_end, false, 'manual'
      ) returning id into v_id;
    else
      update public.memberships
         set status = 'ACTIVE',
             current_period_start = coalesce(current_period_start, now()),
             current_period_end = p_period_end,
             cancelled_at = null,
             updated_at = now()
       where id = v_m.id returning id into v_id;
    end if;
  else
    if v_m.id is null then raise exception 'NO_MEMBERSHIP'; end if;
    update public.memberships
       set status = p_status::public.membership_status,
           cancelled_at = case when p_status = 'CANCELLED' then now() else cancelled_at end,
           current_period_end = least(current_period_end, now()),
           updated_at = now()
     where id = v_m.id returning id into v_id;
  end if;

  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('user', p_user_id, 'membership_admin_update', 'SAAJ Club membership updated',
          'Your SAAJ Club status is now ' || p_status || '.', '/account/membership');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'membership.admin_set', 'membership', coalesce(v_id::text, p_user_id::text),
          jsonb_build_object('status', p_status, 'period_end', p_period_end, 'reason', p_reason));

  return v_id;
end;
$$;

revoke execute on function public.admin_set_membership(uuid, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_membership(uuid, text, timestamptz, uuid, text) to service_role;

create or replace function public.admin_adjust_reward_points(
  p_user_id uuid,
  p_points integer,
  p_reason text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_points = 0 then raise exception 'ZERO_ADJUSTMENT'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  perform 1 from public.reward_ledger where user_id = p_user_id for update;
  select coalesce(sum(points), 0) into v_balance from public.reward_ledger where user_id = p_user_id;
  if v_balance + p_points < 0 then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into public.reward_ledger (user_id, kind, points, balance_after, reason, actor_id)
  values (p_user_id, 'ADJUSTED', p_points, v_balance + p_points, p_reason, p_actor_id);

  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('user', p_user_id, 'reward_adjusted', 'Reward points updated',
          case when p_points > 0 then 'We added ' || p_points || ' points to your account.'
               else (abs(p_points))::text || ' points were adjusted from your account.' end,
          '/account/membership');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'reward.adjust', 'user', p_user_id::text,
          jsonb_build_object('points', p_points, 'reason', p_reason, 'balance_after', v_balance + p_points));

  return jsonb_build_object('balance', v_balance + p_points);
end;
$$;

revoke execute on function public.admin_adjust_reward_points(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_reward_points(uuid, integer, text, uuid) to service_role;

/* ------------------------------------------------- redemption + birthday */

create or replace function public.redeem_reward_points(
  p_user_id uuid,
  p_points integer,
  p_order_id uuid default null,
  p_reason text default 'Redeemed'
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_points <= 0 then raise exception 'INVALID_POINTS'; end if;
  perform 1 from public.reward_ledger where user_id = p_user_id for update;
  select coalesce(sum(points), 0) into v_balance from public.reward_ledger where user_id = p_user_id;
  if v_balance < p_points then raise exception 'INSUFFICIENT_BALANCE'; end if;

  insert into public.reward_ledger (user_id, kind, points, balance_after, order_id, reason)
  values (p_user_id, 'REDEEMED', -p_points, v_balance - p_points, p_order_id, p_reason);

  return jsonb_build_object('balance', v_balance - p_points);
end;
$$;

revoke execute on function public.redeem_reward_points(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_reward_points(uuid, integer, uuid, text) to service_role;

create or replace function public.award_birthday_reward(p_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_config public.membership_config;
  v_dob date;
  v_year text := to_char(now(), 'YYYY');
  v_balance integer;
begin
  if not public.is_active_member(p_user_id) then
    return jsonb_build_object('awarded', false, 'reason', 'not_member');
  end if;
  select * into v_config from public.membership_config where id = true;
  if v_config.birthday_reward_points <= 0 then
    return jsonb_build_object('awarded', false, 'reason', 'disabled');
  end if;

  select date_of_birth into v_dob from public.profiles where id = p_user_id;
  if v_dob is null then
    return jsonb_build_object('awarded', false, 'reason', 'no_dob');
  end if;
  if extract(month from v_dob) <> extract(month from now()) then
    return jsonb_build_object('awarded', false, 'reason', 'not_birthday_month');
  end if;

  perform 1 from public.reward_ledger where user_id = p_user_id for update;
  select coalesce(sum(points), 0) into v_balance from public.reward_ledger where user_id = p_user_id;
  begin
    insert into public.reward_ledger (user_id, kind, points, balance_after, reason)
    values (p_user_id, 'BONUS', v_config.birthday_reward_points,
            v_balance + v_config.birthday_reward_points, 'birthday:' || v_year);
  exception when unique_violation then
    return jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end;

  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('user', p_user_id, 'birthday_reward', 'A little something from SAAJ',
          'Happy birthday — ' || v_config.birthday_reward_points || ' reward points are on your account.',
          '/account/membership');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'reward.birthday', 'user', p_user_id::text,
          jsonb_build_object('points', v_config.birthday_reward_points, 'year', v_year));

  return jsonb_build_object('awarded', true, 'points', v_config.birthday_reward_points);
end;
$$;

revoke execute on function public.award_birthday_reward(uuid) from public, anon, authenticated;
grant execute on function public.award_birthday_reward(uuid) to service_role;
