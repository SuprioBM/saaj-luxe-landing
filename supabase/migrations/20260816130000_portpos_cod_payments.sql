-- SAAJ — replace SSLCommerz with PortPos (online) + Cash on Delivery.
--
-- Adds an explicit, authoritative payment_method column on orders (COD vs
-- PORTPOS) so the app never has to infer payment method from the gateway
-- provider string. place_order gains a required p_payment_method argument
-- and branches inventory handling:
--   * portpos — unchanged from today: increments `reserved` only. Real
--     stock is committed later by finalize_order_paid, once PortPos's
--     server-side verification confirms the transaction actually paid.
--   * cod — commits real stock immediately. There is no gateway step for a
--     COD order to "abandon" the way a redirect-to-pay customer can, so
--     placing the order *is* the confirmation event. The order is left in
--     'pending' status (identical to a fresh online order) and — crucially
--     — payments.status stays 'requires_payment' (unpaid) until an admin
--     explicitly marks the cash collected via mark_cod_collected(). Nothing
--     here ever marks a COD order 'paid' at creation time.
--
-- cancel_order is patched so it restocks (rather than merely releases a
-- reservation) for any COD order, and for any portpos order that already
-- reached paid/processing — i.e. wherever real stock was actually
-- committed, independent of order.status alone.

create type public.payment_method as enum ('cod', 'portpos');

alter table public.orders
  add column if not exists payment_method public.payment_method not null default 'portpos';

alter table public.payments alter column provider set default 'portpos';

-- ------------------------------------------------------- place_order (v3)
-- Same as the guest-token version, plus p_payment_method. Old 7-arg
-- signature is dropped so there is exactly one place_order in the schema.
drop function if exists public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text);

create or replace function public.place_order(
  p_user_id uuid,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_items jsonb,
  p_coupon_code text default null,
  p_guest_token_hash text default null,
  p_payment_method text default 'portpos'
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
  v_payment_method public.payment_method;
begin
  if p_payment_method not in ('cod', 'portpos') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  v_payment_method := p_payment_method::public.payment_method;

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

    -- COD: no gateway round trip for the customer to abandon — placing the
    -- order is itself the commitment, so commit real stock now. PortPos:
    -- unchanged — only reserve until finalize_order_paid confirms payment.
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

  v_reference := 'SAAJ-' || to_char(now(), 'YYMMDD') || '-' || lpad(floor(random() * 999999)::text, 6, '0');

  insert into public.orders (
    reference, user_id, status, customer_name, customer_email, customer_phone,
    shipping_address, billing_address, subtotal, discount, tax, shipping, total, coupon_id,
    guest_access_token_hash, payment_method
  ) values (
    v_reference, p_user_id, 'pending',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    p_shipping_address, p_billing_address,
    v_subtotal, v_discount, 0, v_shipping, v_total, v_coupon_id,
    case when p_user_id is null then p_guest_token_hash else null end,
    v_payment_method
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

  -- Payment row always starts 'requires_payment' (unpaid) regardless of
  -- method — a COD order is never paid at creation, only once collected.
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
          jsonb_build_object('reference', v_reference, 'total', v_total, 'payment_method', p_payment_method));

  return jsonb_build_object(
    'order_id', v_order_id, 'reference', v_reference,
    'total', v_total, 'subtotal', v_subtotal, 'discount', v_discount, 'shipping', v_shipping,
    'payment_method', p_payment_method
  );
end;
$$;

revoke execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text, text, text) to service_role;

-- ------------------------------------------------------------ cancel_order
-- Same entry point, patched so "was stock actually committed" also accounts
-- for COD (committed at creation, regardless of order.status) rather than
-- only order.status in ('paid','processing') — which was only ever true for
-- a payment-gateway order that had already been confirmed.
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

  v_was_committed := v_order.payment_method = 'cod' or v_order.status in ('paid', 'processing');

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
  -- else: payment stays whatever it was ('requires_payment' for an
  -- uncollected COD order — correctly reflects no money ever moved; or
  -- 'succeeded' for a captured online/collected-COD payment, left for a
  -- human refund follow-up) — never auto-claimed here.

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

-- ------------------------------------------------------- mark_cod_collected
-- The one and only place a COD payment becomes 'succeeded'. Called by an
-- admin server function once the courier confirms cash was collected.
-- Idempotent: a second call is a silent no-op. Never touches order.status —
-- fulfillment stage (processing/shipped/delivered) is tracked independently
-- via adminUpdateOrderStatus, same as every other order.
create or replace function public.mark_cod_collected(
  p_order_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order record;
  v_payment record;
begin
  select o.id, o.reference, o.user_id, o.payment_method, o.status
    into v_order
    from public.orders o
    where o.id = p_order_id
    for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.payment_method <> 'cod' then
    raise exception 'NOT_A_COD_ORDER';
  end if;
  if v_order.status in ('cancelled', 'refunded') then
    raise exception 'ORDER_NOT_COLLECTIBLE: %', v_order.status;
  end if;

  select id, status into v_payment from public.payments where order_id = p_order_id for update;
  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;
  if v_payment.status = 'succeeded' then
    return; -- already recorded — idempotent no-op
  end if;

  update public.payments
    set status = 'succeeded',
        gateway_transaction_id = coalesce(gateway_transaction_id, 'COD-' || to_char(now(), 'YYYYMMDDHH24MISS')),
        updated_at = now()
    where id = v_payment.id;

  if v_order.user_id is not null then
    insert into public.notifications (audience, user_id, kind, title, body, link)
    values ('user', v_order.user_id, 'payment_succeeded', 'Payment received',
            'Cash on delivery for ' || v_order.reference || ' was collected.', '/order/' || v_order.reference);
  end if;
  insert into public.notifications (audience, user_id, kind, title, body, link)
  values ('admin', null, 'payment_succeeded', 'COD collected', v_order.reference, '/admin/orders');

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_actor_id, 'order.cod_collected', 'order', p_order_id::text, jsonb_build_object('reference', v_order.reference));
end;
$$;

revoke execute on function public.mark_cod_collected(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_cod_collected(uuid, uuid) to service_role;
