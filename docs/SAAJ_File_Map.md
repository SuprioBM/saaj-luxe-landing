# SAAJ — Dependency & File Map

Generated from a full static analysis of `src/`. Three parallel data paths exist today:
**live DB**, **localStorage**, and a **dead `/api/*` path that always falls back to mocks**.

---

## 1. Route → Component → Hook → API → Table

| Route (file) | Components | Hooks / stores | Data call | Tables |
|---|---|---|---|---|
| `/` `routes/index.tsx` | SiteHeader, HeroSlider, ProductCard, RecentlyViewedRail, SiteFooter | `useProducts`, `useCategories`, `useRecentlyViewed` | `catalog-live.fetchProducts/Categories` | `products`, `product_variants`, `product_images`, `categories` |
| `/shop` `shop.tsx` | SiteHeader, ProductCard, SiteFooter | `useProducts`, `useSearch` (router) | same | same |
| `/category/$slug` | ProductCard, RecentlyViewedRail | `useProducts`, `useCategories` | same | same |
| `/product/$slug` | SizePicker, QtyStepper, StarRating, StockBadge, WishlistButton, ProductCard, RecentlyViewedRail | `useProduct`, `useProducts`, `cart.add`, `wishlist`, `recentlyViewed.push` | supabase read + localStorage write | `products`, `product_variants`, `product_images` |
| `/cart` | SiteHeader/Footer | `useCart`, `useCartCount` | **localStorage only** | — |
| `/checkout` | — | `useCart`, `orders.place` | **localStorage only** | — |
| `/order/$id` | — | `useOrders` | **localStorage only** | — |
| `/wishlist` | ProductCard | `useWishlist` | **localStorage only** | — |
| `/auth` | SiteHeader/Footer | `auth.login/signup/google`, `useAuth` | `supabase.auth` + profile hydration | `profiles`, `user_roles` |
| `_authenticated/route.tsx` (gate) | — | `supabase.auth.getUser()` | real | — |
| `/account`, `/account/orders`, `/account/profile` | AccountShell | `useAuth`, `useMyOrders`, `useWishlist` | `api.orders.mine` → **404** → `api-fallback` mock | **none** |
| `/admin`, `/admin/products`, `/admin/orders`, `/admin/customers` | AdminShell, ProductForm | `useAdminStats/Products/Orders/Customers` + mutations | `api.admin.*` → **404** → `api-fallback` mock | **none** |
| `/about`, `/lookbook`, `/contact`, `/privacy`, `/terms`, `/shipping`, `/returns` | PolicyPage / static | — | static `data/catalog.ts` | — |
| `/sitemap.xml` | — | — | static `data/catalog.ts` (**stale vs DB**) | — |

**Tables actually touched by code:** `products`, `product_variants`, `product_images`, `categories` (`lib/catalog-live.ts:85,96`), `profiles`, `user_roles` (`lib/auth.ts:41,45,145`).
14 of the 20 tables in the schema (carts, cart_items, orders, order_items, payments, coupons, coupon_redemptions, reviews, notifications, addresses, audit_logs, rate_limits, wishlists) are **never queried** — no `createServerFn` and no `src/routes/api/*` exist anywhere in the repo.

---

## 2. Variable dataflow of the core stores

- `lib/cart.ts` — `KEY="saaj.cart.v2"`, module-level `state: CartLine[]`, `useSyncExternalStore` → `useCart()`, `useCartCount()`. Mutations: `add/remove/setQty/clear`. Lines keyed by `slug+size`; price is re-resolved from `data/catalog.ts` at render, **not** from the DB → stale-price risk.
- `lib/wishlist.ts` — `KEY="saaj.wishlist.v1"`, `string[]` of slugs, same store pattern.
- `lib/recently-viewed.ts` — `KEY="saaj.recent.v1"`, capped slug list.
- `lib/orders.ts` — `KEY="saaj.orders.v1"`, `place()` snapshots cart lines + customer into a local order, generates `reference`. Zero server involvement, so **no payment, no stock decrement**.
- `lib/auth.ts` — `supabase.auth` session → `hydrate()` fetches `profiles` + `user_roles`; `roleFromRows` collapses `super_admin|admin|staff` → `ADMIN`, else `CUSTOMER`. Exposed by `useAuth()`. **Role is never enforced on `/admin`** — the gate only checks "logged in".
- `lib/catalog-live.ts` — `fetchProducts()` joins products+variants+images, `toProduct()` merges DB rows with editorial `PRODUCTS` from `data/catalog.ts` (specs, reviews, fallback imagery). Cached by TanStack Query.
- `lib/queries.ts` — every hook wraps `withFallback(realCall, mock)`; because `/api/*` doesn't exist, **the catch branch always wins silently**. This is the single most misleading construct in the codebase.

---

## 3. File classification

### Generated — never hand-edit
- `src/routeTree.gen.ts`
- `src/integrations/supabase/client.ts`, `client.server.ts`, `types.ts`, `auth-middleware.ts`, `auth-attacher.ts`
- `src/integrations/lovable/index.ts`, `src/lib/lovable-error-reporting.ts`, `src/lib/error-capture.ts`
- `src/integrations/supabase/auth-attacher.ts` — generated **and wired** (`src/start.ts:4`); unlike the two files above it is live.
- `.env`, `supabase/config.toml`

### Production-critical — breaking these breaks the app
`src/router.tsx`, `src/start.ts`, `src/server.ts`, `src/routes/__root.tsx`, `src/routes/_authenticated/route.tsx`, `src/lib/auth.ts`, `src/lib/catalog-live.ts`, `src/lib/cart.ts`, `src/styles.css`, `src/components/SiteHeader.tsx`, `vite.config.ts`.

### Legacy — works, but must be replaced to reach production
| File | Why |
|---|---|
| `src/lib/api.ts` | REST client for a backend that was never built; `tokenStore` is a second, unused auth mechanism competing with Supabase. |
| `src/lib/api-fallback.ts` | In-memory mock DB. Admin edits appear to save, then vanish on refresh. |
| `src/lib/queries.ts` | Fallback wrapper hides the 404s. Rewrite onto `createServerFn`. |
| `src/lib/orders.ts` | localStorage order book; must become `orders` + `order_items` + Stripe. |
| `src/lib/wishlist.ts` | Must become the `wishlists` table. |
| `src/data/catalog.ts` (593 lines) | Half legacy (`PRODUCTS`, `PRICE_MAX`), half still load-bearing (`inr`, `SIZE_SETS`, `HERO_SLIDES`, `stockState`, reviews). Split before deleting anything. |
| `src/routes/sitemap[.]xml.ts` | Reads static catalog, not the DB. |
| `docs/schema.sql`, `docs/seed_catalog.sql` | Already applied; historical record only. |

### Safe to delete now
- **44 unused shadcn primitives** in `src/components/ui/` — every file except `sonner.tsx`. (`button`, `card`, `dialog`, `table`, `sidebar`, `chart`, `carousel`, …) Nothing outside `ui/` imports them. Keep the ones you plan to use for admin tables/forms; delete the rest.
- `src/hooks/use-mobile.tsx` — only consumed by `ui/sidebar.tsx`, which is itself unused.
- `src/integrations/supabase/client.server.ts` — **zero importers**. Generated, but a vestige of a planned admin/RLS-bypass flow. Keep it only if you intend to write privileged server functions (you will — see step 2 below); otherwise it is dead weight.
- `src/integrations/supabase/auth-middleware.ts` — **zero importers**. Same caveat: `requireSupabaseAuth` becomes essential the moment you add protected server functions. Do not delete before step 2.
- Dead exports inside a live file: `searchProducts`, `PRICE_MIN`, `PRICE_MAX` in `src/data/catalog.ts:580,592-593` have no call sites (`shop.tsx` computes its own max from live data).
- `PROGRESS.md` once superseded by `docs/HANDOFF.md`.
- Any `src/assets/*.jpg` still duplicated in `public/images/` (DB rows point at `/images/*`).

---

## 4. Top 20 files to understand, in order

1. `src/routes/__root.tsx` — shell, head metadata, auth-state invalidation, Toaster.
2. `src/router.tsx` — QueryClient factory, `defaultPreloadStaleTime`.
3. `src/routeTree.gen.ts` — read-only proof of what routes exist.
4. `src/lib/auth.ts` — the whole identity model.
5. `src/routes/_authenticated/route.tsx` — the only guard; **role check missing here**.
6. `src/lib/catalog-live.ts` — the one real DB read path and the DB↔static merge.
7. `src/data/catalog.ts` — still supplies specs, sizes, reviews, currency, hero slides.
8. `src/lib/cart.ts` — store pattern used by every other client store.
9. `src/lib/queries.ts` — where the fake backend hides.
10. `src/lib/api.ts` — the contract your real server functions should implement.
11. `src/lib/api-fallback.ts` — what to delete last, once every hook is real.
12. `src/lib/orders.ts` — the checkout model to port to Postgres + Stripe.
13. `src/routes/checkout.tsx` — order payload shape.
14. `src/routes/_authenticated/admin.products.tsx` — heaviest admin surface.
15. `src/components/ProductForm.tsx` — product write DTO, incl. image upload call.
16. `src/routes/product.$slug.tsx` — most complex read surface (gallery, sizes, stock).
17. `src/components/SiteHeader.tsx` — global nav, search, cart badge.
18. `src/styles.css` — the entire design system (tokens, `eyebrow`, `saaj-rail`).
19. `src/start.ts` — CSRF + Supabase bearer middleware; required before protected server fns.
20. `src/integrations/supabase/types.ts` — generated DB types; your source of truth for the 14 unused tables.

---

## 5. Recommended order to continue

1. **Security first:** add a role check to `_authenticated/route.tsx` (or an `_authenticated/admin` layout) using `has_role`. Today any signed-in user reaches `/admin`.
2. Create `src/lib/*.functions.ts` server functions for products/inventory (admin, role-gated) and swap `useAdminProducts` off `withFallback`.
3. Move cart + wishlist to `carts`/`cart_items`/`wishlists` with a guest→user merge on login.
4. Orders + Stripe: server fn creates `orders`/`order_items` + Checkout Session; `src/routes/api/public/stripe-webhook.ts` finalizes payment and decrements `product_variants.stock`.
5. Reviews, coupons, notifications, addresses.
6. Delete `api.ts`, `api-fallback.ts`, `orders.ts`, and the unused `ui/` primitives.
7. Make `sitemap.xml` read the DB.
