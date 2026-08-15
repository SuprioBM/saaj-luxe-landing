-- SAAJ — Bangladesh localization + atomic commerce functions.
-- Adds: BD defaults, single-default-address constraint, SSLCommerz-friendly
-- payment columns, and the three server-authoritative order functions that
-- make checkout/payment/cancellation atomic and race-safe.
--
-- All three functions are EXECUTE-revoked from anon/authenticated and granted
-- only to service_role — they must only ever be called from a server function
-- that has already independently verified the caller's identity.

-- ---------------------------------------------------------- BD localization
alter table public.addresses alter column country set default 'BD';
alter table public.payments alter column provider set default 'sslcommerz';
alter table public.payments alter column currency set default 'bdt';

-- Provider-agnostic gateway reference columns (SSLCommerz session/transaction
-- ids don't belong under stripe_*; keep those columns untouched but unused).
alter table public.payments add column if not exists gateway_session_id text unique;
alter table public.payments add column if not exists gateway_transaction_id text unique;

-- Only one default address per user (fixes the gap noted in the handoff doc).
create unique index if not exists addresses_one_default_per_user
  on public.addresses (user_id) where (is_default);

-- ------------------------------------------------------- place_order (atomic)
-- Validates stock + coupon against live rows (row-locked), snapshots order
-- items, reserves inventory, and writes the order/payment/notification/audit
-- rows in a single transaction. Pricing, stock and coupon math all happen
-- here — the caller (server fn) never gets to dictate totals.
create or replace function public.place_order(
  p_user_id uuid,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_coupon_code text default null
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
  v_coupon record;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
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
    select * into v_coupon from public.coupons where lower(code) = lower(trim(p_coupon_code)) for update;
    if v_coupon.id is null or not v_coupon.active then
      raise exception 'INVALID_COUPON';
    end if;
    if v_coupon.starts_at > now() or (v_coupon.expires_at is not null and v_coupon.expires_at < now()) then
      raise exception 'COUPON_EXPIRED';
    end if;
    if v_subtotal < v_coupon.min_subtotal then
      raise exception 'COUPON_MIN_SUBTOTAL';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      raise exception 'COUPON_LIMIT_REACHED';
    end if;
    if p_user_id is not null and exists (
      select 1 from public.coupon_redemptions where coupon_id = v_coupon.id and user_id = p_user_id
    ) then
      raise exception 'COUPON_ALREADY_USED';
    end if;

    v_discount := case when v_coupon.kind = 'fixed' then v_coupon.value
                        else round(v_subtotal * v_coupon.value / 100, 2) end;
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
    shipping_address, billing_address, subtotal, discount, tax, shipping, total, coupon_id
  ) values (
    v_reference, p_user_id, 'pending',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    p_shipping_address, p_billing_address,
    v_subtotal, v_discount, 0, v_shipping, v_total, v_coupon.id
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

  if v_coupon.id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_coupon.id;
    insert into public.coupon_redemptions (coupon_id, user_id, order_id) values (v_coupon.id, p_user_id, v_order_id);
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

revoke execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text) to service_role;

-- --------------------------------------------------- finalize_order_paid
-- Called once by the SSLCommerz webhook after independently validating the
-- transaction with SSLCommerz's Order Validation API. Idempotent: a second
-- call for an already-paid order is a silent no-op.
create or replace function public.finalize_order_paid(
  p_order_id uuid,
  p_provider text,
  p_transaction_id text,
  p_raw_event jsonb default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_order record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status = 'paid' then
    return;
  end if;
  if v_order.status not in ('pending', 'processing') then
    raise exception 'ORDER_NOT_PAYABLE: %', v_order.status;
  end if;

  update public.orders set status = 'paid', updated_at = now() where id = p_order_id;

  update public.payments
    set status = 'succeeded',
        gateway_transaction_id = coalesce(gateway_transaction_id, p_transaction_id),
        raw_event = coalesce(p_raw_event, raw_event),
        updated_at = now()
    where order_id = p_order_id;

  for v_item in select * from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants
        set stock = greatest(0, stock - v_item.qty),
            reserved = greatest(0, reserved - v_item.qty)
        where id = v_item.variant_id;
    end if;
  end loop;

  if v_order.user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', v_order.user_id, 'payment_succeeded', 'Payment received',
            'Payment for ' || v_order.reference || ' was successful.', '/order/' || v_order.reference);
  end if;
  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'payment_succeeded', 'Order paid', v_order.reference, '/admin/orders');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (null, 'order.paid', 'order', p_order_id::text,
          jsonb_build_object('provider', p_provider, 'transaction_id', p_transaction_id));
end;
$$;

revoke execute on function public.finalize_order_paid(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_order_paid(uuid, text, text, jsonb) to service_role;

-- ----------------------------------------------- release_order_reservation
-- Used for payment failure/expiry/cancel and for customer-initiated
-- cancellation (called after the server fn has verified ownership).
create or replace function public.release_order_reservation(
  p_order_id uuid,
  p_reason text default 'cancelled'
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item record;
  v_order record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status in ('paid', 'shipped', 'delivered', 'refunded') then
    raise exception 'ORDER_NOT_CANCELLABLE: %', v_order.status;
  end if;
  if v_order.status = 'cancelled' then
    return;
  end if;

  for v_item in select * from public.order_items where order_id = p_order_id
  loop
    if v_item.variant_id is not null then
      update public.product_variants set reserved = greatest(0, reserved - v_item.qty) where id = v_item.variant_id;
    end if;
  end loop;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
  update public.payments set status = 'failed', updated_at = now()
    where order_id = p_order_id and status = 'requires_payment';

  if v_order.user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', v_order.user_id, 'order_cancelled', 'Order cancelled',
            v_order.reference || ' — ' || p_reason, '/account/orders');
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_order.user_id, 'order.cancel', 'order', p_order_id::text, jsonb_build_object('reason', p_reason));
end;
$$;

revoke execute on function public.release_order_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.release_order_reservation(uuid, text) to service_role;
