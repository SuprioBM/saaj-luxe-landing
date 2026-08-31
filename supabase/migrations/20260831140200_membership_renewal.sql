-- SAAJ Club — allow manual renewal.
--
-- bKash has no recurring billing, so "renewal" is the member paying ৳50
-- again (spec 46.4). The first cut of place_membership_order hard-blocked
-- ANY order while a membership was ACTIVE (ALREADY_MEMBER), which also
-- blocked renewing. Relax it:
--   * still block a second *unpaid* membership order (double-submit guard),
--   * still block piling up more than ~1 extra month of runway
--     (guards against "accidental second overlapping membership", spec 38),
--   * otherwise allow it — activation already EXTENDS the single ACTIVE row
--     from its current period end (never creates a second overlapping
--     period), so a member with < ~45 days left can always renew.

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
  v_runway_end timestamptz;
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

  -- Already have plenty of runway queued — nothing to renew right now.
  select am.current_period_end into v_runway_end
    from security.active_membership(p_user_id) am
    where am.tier = v_tier;
  if v_runway_end is not null and v_runway_end > now() + interval '45 days' then
    raise exception 'ALREADY_MEMBER';
  end if;

  -- One unpaid membership order at a time.
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
