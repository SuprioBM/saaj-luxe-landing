-- SAAJ — foundation schema (staged; apply via the migration tool once the
-- Supabase project is connected). Order matters:
-- create table -> grant -> enable RLS -> policies.

-- ---------------------------------------------------------------- enums
create type public.app_role      as enum ('super_admin', 'admin', 'staff', 'customer');
create type public.user_status   as enum ('active', 'suspended');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status  as enum ('pending', 'processing', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded');
create type public.payment_status as enum ('requires_payment', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded');
create type public.coupon_kind   as enum ('fixed', 'percent');
create type public.notification_audience as enum ('user', 'admin');

-- ------------------------------------------------------------- utilities
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  email       text not null,
  phone       text,
  avatar_url  text,
  status      public.user_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ user_roles
create table public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role    public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_user_idx on public.user_roles (user_id);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('super_admin', 'admin', 'staff')
  );
$$;

-- new signups get a profile and the customer role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id or public.is_staff(auth.uid()));

-- ------------------------------------------------------------- addresses
create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null default 'Home',
  name       text not null,
  phone      text not null,
  line1      text not null,
  line2      text,
  city       text not null,
  state      text not null,
  pincode    text not null,
  country    text not null default 'IN',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

grant select, insert, update, delete on public.addresses to authenticated;
grant all on public.addresses to service_role;
alter table public.addresses enable row level security;

create policy "own addresses" on public.addresses
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger addresses_updated_at before update on public.addresses
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ categories
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  parent_id  uuid references public.categories(id) on delete set null,
  blurb      text,
  image_url  text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id);

grant select on public.categories to anon, authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;

create policy "categories are public" on public.categories for select to anon, authenticated using (true);
create policy "staff manage categories" on public.categories
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- -------------------------------------------------------------- products
create table public.products (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  description    text not null default '',
  price          numeric(10,2) not null check (price >= 0),
  discount_price numeric(10,2) check (discount_price >= 0),
  sku            text not null unique,
  category_id    uuid references public.categories(id) on delete set null,
  subcategory_id uuid references public.categories(id) on delete set null,
  materials      text[] not null default '{}',
  tags           text[] not null default '{}',
  is_new         boolean not null default false,
  status         public.product_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint discount_below_price check (discount_price is null or discount_price <= price)
);
create index products_category_idx on public.products (category_id);
create index products_status_idx   on public.products (status);
create index products_search_idx   on public.products using gin (to_tsvector('simple', name || ' ' || description));

grant select on public.products to anon, authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create policy "active products are public" on public.products
  for select to anon, authenticated using (status = 'active' or public.is_staff(auth.uid()));
create policy "staff manage products" on public.products
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- product_images
create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url        text not null,
  alt        text,
  position   integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, position);

grant select on public.product_images to anon, authenticated;
grant all on public.product_images to service_role;
alter table public.product_images enable row level security;

create policy "product images are public" on public.product_images for select to anon, authenticated using (true);
create policy "staff manage product images" on public.product_images
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ------------------------------------------------------------- inventory
create table public.product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size       text not null,
  stock      integer not null default 0 check (stock >= 0),
  reserved   integer not null default 0 check (reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size)
);
create index product_variants_product_idx on public.product_variants (product_id);

grant select on public.product_variants to anon, authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;

create policy "variants are public" on public.product_variants for select to anon, authenticated using (true);
create policy "staff manage variants" on public.product_variants
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- wishlist
create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index wishlists_user_idx on public.wishlists (user_id);

grant select, insert, delete on public.wishlists to authenticated;
grant all on public.wishlists to service_role;
alter table public.wishlists enable row level security;

create policy "own wishlist" on public.wishlists
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------------ cart
create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  qty        integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index cart_items_cart_idx on public.cart_items (cart_id);

grant select, insert, update, delete on public.carts, public.cart_items to authenticated;
grant all on public.carts, public.cart_items to service_role;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "own cart" on public.carts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cart items" on public.cart_items
  for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

create trigger carts_updated_at before update on public.carts
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- coupons
create table public.coupons (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  kind         public.coupon_kind not null,
  value        numeric(10,2) not null check (value > 0),
  min_subtotal numeric(10,2) not null default 0,
  starts_at    timestamptz not null default now(),
  expires_at   timestamptz,
  usage_limit  integer,
  used_count   integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index coupons_code_idx on public.coupons (lower(code));

grant select on public.coupons to authenticated;
grant all on public.coupons to service_role;
alter table public.coupons enable row level security;

create policy "staff manage coupons" on public.coupons
  for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------- orders
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,
  user_id           uuid references auth.users(id) on delete set null,
  status            public.order_status not null default 'pending',
  customer_name     text not null,
  customer_email    text not null,
  customer_phone    text,
  shipping_address  jsonb not null,
  billing_address   jsonb,
  subtotal          numeric(10,2) not null default 0,
  discount          numeric(10,2) not null default 0,
  tax               numeric(10,2) not null default 0,
  shipping          numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  coupon_id         uuid references public.coupons(id) on delete set null,
  placed_at         timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_user_idx   on public.orders (user_id, placed_at desc);
create index orders_status_idx on public.orders (status);

create table public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  product_slug text not null,
  size         text not null,
  image_url    text,
  qty          integer not null check (qty > 0),
  unit_price   numeric(10,2) not null check (unit_price >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

grant select on public.orders, public.order_items to authenticated;
grant all on public.orders, public.order_items to service_role;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "own or staff orders" on public.orders
  for select to authenticated using (auth.uid() = user_id or public.is_staff(auth.uid()));
create policy "staff manage orders" on public.orders
  for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy "own or staff order items" on public.order_items
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = auth.uid() or public.is_staff(auth.uid()))
  ));

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- payments
create table public.payments (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders(id) on delete cascade,
  provider                  text not null default 'stripe',
  stripe_session_id         text unique,
  stripe_payment_intent_id  text unique,
  status                    public.payment_status not null default 'requires_payment',
  amount                    numeric(10,2) not null,
  currency                  text not null default 'inr',
  refunded_amount           numeric(10,2) not null default 0,
  failure_reason            text,
  raw_event                 jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;

create policy "own or staff payments" on public.payments
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_id and (o.user_id = auth.uid() or public.is_staff(auth.uid()))
  ));

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------- coupon redemptions
create table public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  order_id    uuid not null references public.orders(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);

grant select on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;
alter table public.coupon_redemptions enable row level security;

create policy "own or staff redemptions" on public.coupon_redemptions
  for select to authenticated using (auth.uid() = user_id or public.is_staff(auth.uid()));

-- --------------------------------------------------------------- reviews
create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  order_id   uuid references public.orders(id) on delete set null,
  rating     integer not null check (rating between 1 and 5),
  title      text,
  body       text not null default '',
  verified   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index reviews_product_idx on public.reviews (product_id, created_at desc);

grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;

create policy "reviews are public" on public.reviews for select to anon, authenticated using (true);
-- only verified buyers may write: a paid/shipped/delivered order containing the product
create policy "verified buyers write reviews" on public.reviews
  for insert to authenticated with check (
    auth.uid() = user_id and exists (
      select 1 from public.orders o
      join public.order_items oi on oi.order_id = o.id
      where o.user_id = auth.uid()
        and oi.product_id = reviews.product_id
        and o.status in ('paid', 'shipped', 'delivered')
    )
  );
create policy "authors edit reviews" on public.reviews
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "authors delete reviews" on public.reviews
  for delete to authenticated using (auth.uid() = user_id or public.is_staff(auth.uid()));

create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------- notifications
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  audience   public.notification_audience not null,
  user_id    uuid references auth.users(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null default '',
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx  on public.notifications (user_id, created_at desc);
create index notifications_admin_idx on public.notifications (audience, created_at desc);

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create policy "read own notifications" on public.notifications
  for select to authenticated
  using ((audience = 'user' and auth.uid() = user_id) or (audience = 'admin' and public.is_staff(auth.uid())));
create policy "mark own notifications read" on public.notifications
  for update to authenticated
  using ((audience = 'user' and auth.uid() = user_id) or (audience = 'admin' and public.is_staff(auth.uid())))
  with check ((audience = 'user' and auth.uid() = user_id) or (audience = 'admin' and public.is_staff(auth.uid())));

-- ------------------------------------------------------------ audit logs
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}',
  ip          text,
  created_at  timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx  on public.audit_logs (actor_id, created_at desc);

grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

create policy "staff read audit logs" on public.audit_logs
  for select to authenticated using (public.is_staff(auth.uid()));

-- --------------------------------------------------------- rate limiting
create table public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  identifier   text not null,
  window_start timestamptz not null default date_trunc('minute', now()),
  count        integer not null default 0,
  unique (bucket, identifier, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

grant all on public.rate_limits to service_role;
alter table public.rate_limits enable row level security;


-- ============================================================
-- Migration: 20260815120000_bd_commerce_functions.sql
-- Migration: 20260815130000_fix_place_order_coupon_null.sql (supersedes place_order below)
-- ============================================================

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


-- --- bugfix follow-up (place_order coupon-null crash) ---

-- Fix: place_order raised "record v_coupon is not assigned yet" whenever no
-- coupon code was supplied — PL/pgSQL record variables can't have their
-- fields read before a SELECT INTO has run. Replaced the coupon `record`
-- with plain scalar variables (which default to NULL) so the no-coupon path
-- works. Same signature, same behavior otherwise — CREATE OR REPLACE keeps
-- existing grants intact.
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
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  -- Coupon: scalar variables (not a record) so the no-coupon path never
  -- touches an unassigned field.
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
    shipping_address, billing_address, subtotal, discount, tax, shipping, total, coupon_id
  ) values (
    v_reference, p_user_id, 'pending',
    p_customer->>'name', p_customer->>'email', p_customer->>'phone',
    p_shipping_address, p_billing_address,
    v_subtotal, v_discount, 0, v_shipping, v_total, v_coupon_id
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

revoke execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.place_order(uuid, jsonb, jsonb, jsonb, jsonb, text) to service_role;
