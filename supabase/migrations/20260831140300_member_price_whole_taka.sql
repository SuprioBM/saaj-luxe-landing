-- SAAJ Club — round the member price to the whole taka.
--
-- place_order v4 computed the member unit price with round(..., 2), which
-- left paisa on prices like ৳1899 → ৳1709.10. SAAJ shows every price as a
-- whole taka (formatBDT rounds), and the client-side member-price helper
-- rounds to the whole taka too — so the stored order line must match. Round
-- to 0 decimals. Everything else in place_order is unchanged from
-- 20260831140100.

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

    if v_variant.members_only and not v_is_member then
      raise exception 'MEMBERS_ONLY: %', v_variant.name;
    end if;

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
        -- whole taka — SAAJ never shows paisa, and the client helper rounds
        -- the same way, so the stored line matches what the customer saw.
        v_line_price := round(v_base_price * (10000 - v_disc_bps)::numeric / 10000, 0);
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
