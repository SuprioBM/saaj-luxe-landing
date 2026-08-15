-- Guest order tracking & cancellation.
--
-- Adds: a hashed guest-access-token column (raw token is never stored —
-- only its SHA-256 hash; the raw value lives only in the confirmation
-- email/redirect URL), courier + shipment tracking columns, and a single
-- unified `cancel_order` function that replaces every ad-hoc cancellation
-- call site (webhook fail/cancel/expiry, checkout gateway-init failure,
-- customer self-cancel, admin cancel) so inventory correctness has exactly
-- one code path instead of several.

alter table public.orders
  add column if not exists guest_access_token_hash text,
  add column if not exists courier text,
  add column if not exists shipment_tracking_number text;

-- A guest token, once issued, identifies exactly one order — enforce
-- uniqueness so a hash collision (practically impossible with SHA-256 of a
-- 32-byte random value, but cheap to guard anyway) can never grant access
-- to the wrong order.
create unique index if not exists orders_guest_token_hash_idx
  on public.orders (guest_access_token_hash)
  where guest_access_token_hash is not null;

-- ------------------------------------------------------- place_order (v2)
-- Same as before, plus an optional guest token hash captured at order
-- creation time. Old 6-arg signature is dropped so there is exactly one
-- place_order in the schema (the app always calls the 7-arg form now).
drop function if exists public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text);

create or replace function public.place_order(
  p_user_id uuid,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_coupon_code text default null,
  p_guest_token_hash text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_variant record;
  v_qty integer;
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
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select
      pv.id as variant_id, pv.size, pv.stock, pv.reserved,
      p.id as product_id, p.slug, p.name, p.price, p.discount_price, p.status
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

    v_qty := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QTY';
    end if;
    if (v_variant.stock - v_variant.reserved) < v_qty then
      raise exception 'INSUFFICIENT_STOCK: %', v_variant.name;
    end if;

    v_line_price := coalesce(v_variant.discount_price, v_variant.price);
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

    update public.product_variants set reserved = reserved + v_qty where id = v_variant.variant_id;
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

  v_reference := 'SAAJ-' || to_char(now(), 'YYMMDD') || '-' || lpad(floor(random() * 999999)::text, 6, '0');

  insert into public.orders (
    reference, user_id, status, customer_name, customer_email, customer_phone,
    shipping_address, billing_address, subtotal, discount, tax, shipping, total, coupon_id,
    guest_access_token_hash
  ) values (
    v_reference, p_user_id, 'pending',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    p_shipping_address, p_billing_address,
    v_subtotal, v_discount, 0, v_shipping, v_total, v_coupon_id,
    case when p_user_id is null then p_guest_token_hash else null end
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
  values (v_order_id, 'sslcommerz', 'requires_payment', v_total, 'bdt');

  if p_user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', p_user_id, 'order_placed', 'Order placed',
            'Your order ' || v_reference || ' has been received.', '/order/' || v_reference);
  end if;
  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'order_placed', 'New order', v_reference || ' — ' || (p_customer->>'name'), '/admin/orders');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_user_id, 'order.create', 'order', v_order_id::text,
          jsonb_build_object('reference', v_reference, 'total', v_total));

  return jsonb_build_object(
    'order_id', v_order_id, 'reference', v_reference,
    'total', v_total, 'subtotal', v_subtotal, 'discount', v_discount, 'shipping', v_shipping
  );
end;
$$;

revoke execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text) to service_role;

-- ------------------------------------------------------------ cancel_order
-- The one cancellation code path for every scenario: webhook payment
-- failed/cancelled/expired, checkout gateway-init failure, customer
-- self-cancel (authenticated or guest-token), and admin cancel.
--
-- Cancellable statuses: pending, processing, paid. Not cancellable once
-- shipped/delivered/cancelled/refunded.
--
-- Inventory correctness: if the order had already reached 'paid' (or
-- 'processing', which in this app only ever follows 'paid'), real stock
-- was already decremented by finalize_order_paid — cancelling must restock
-- it. If it never got past 'pending', only `reserved` was incremented —
-- cancelling releases that reservation, stock itself is untouched.
--
-- Never marks a payment 'refunded' here — that would claim money has moved
-- when it hasn't. A captured payment on a cancelled order is left
-- 'succeeded' for a human to action (see order.$id.tsx messaging).
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default 'cancelled'
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_was_committed boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status in ('shipped', 'delivered', 'cancelled', 'refunded') then
    raise exception 'ORDER_NOT_CANCELLABLE: %', v_order.status;
  end if;

  v_was_committed := v_order.status in ('paid', 'processing');

  for v_item in select * from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      if v_was_committed then
        update public.product_variants set stock = stock + v_item.qty where id = v_item.variant_id;
      else
        update public.product_variants set reserved = greatest(0, reserved - v_item.qty) where id = v_item.variant_id;
      end if;
    end if;
  end loop;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;

  if not v_was_committed then
    update public.payments set status = 'failed', updated_at = now()
      where order_id = p_order_id and status = 'requires_payment';
  end if;
  -- else: payment stays 'succeeded' — refund is a manual/admin follow-up,
  -- never auto-claimed here.

  if v_order.user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', v_order.user_id, 'order_cancelled', 'Order cancelled',
            v_order.reference || ' — ' || p_reason, '/order/' || v_order.reference);
  end if;
  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'order_cancelled', 'Order cancelled', v_order.reference || ' (' || p_reason || ')', '/admin/orders');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_order.user_id, 'order.cancel', 'order', p_order_id::text,
          jsonb_build_object('reason', p_reason, 'was_committed', v_was_committed));
end;
$$;

revoke execute on function public.cancel_order(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, text) to service_role;

-- ------------------------------------------------------- shipment update
-- Small, explicit function so admin shipment updates go through the same
-- audit-logged path as everything else, rather than a bare UPDATE.
create or replace function public.set_order_shipment(
  p_order_id uuid,
  p_courier text,
  p_tracking_number text,
  p_actor_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reference text;
  v_user_id uuid;
begin
  update public.orders
    set courier = p_courier, shipment_tracking_number = p_tracking_number, updated_at = now()
    where id = p_order_id
    returning reference, user_id into v_reference, v_user_id;

  if v_reference is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', v_user_id, 'shipment_update', 'Shipment details added',
            v_reference || ' — tracking via ' || coalesce(p_courier, 'courier'), '/order/' || v_reference);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'order.shipment_update', 'order', p_order_id::text,
          jsonb_build_object('courier', p_courier, 'tracking_number', p_tracking_number));
end;
$$;

revoke execute on function public.set_order_shipment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.set_order_shipment(uuid, text, text, uuid) to service_role;
