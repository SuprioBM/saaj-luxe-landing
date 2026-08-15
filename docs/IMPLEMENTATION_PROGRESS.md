# SAAJ — Production Implementation Progress

Live tracker for the "make it a real, functional, Bangladesh e-commerce site" build-out.
Started 2026-08-15. Updated as work lands — each checkbox is only ticked once the code is
written, wired to the real database, and manually verified against the running dev server.
**Nothing below is pre-checked. A box only flips once that specific piece is done and tested.**

Legend: `[x]` done & verified · `[~]` partially done (see note) · `[ ]` not started

## Decisions locked in with the user
- Payment gateway: **SSLCommerz** (Stripe does not support Bangladeshi merchant accounts),
  wired against SSLCommerz's public sandbox for now.
- Currency: BDT (৳), country default `BD`. All INR/India-specific copy, specs, and defaults
  are being swept out in favour of Bangladesh equivalents. Visual design is NOT changing.
- Architecture stays TanStack Start + Supabase Postgres, per the existing docs. No Express/
  Prisma/Redis/Mongo introduced.

## Phase 1 — Foundation
- [x] Inspected full repo (routes, lib, components, schema, generated clients)
- [x] New migration: BD defaults, address constraint, atomic order/payment SQL functions
- [x] Migration applied to live DB, verified (`place_order`/`finalize_order_paid`/`release_order_reservation` present)
- [x] Zod schema module (`src/lib/schemas.ts`)
- [x] Hand-patched `src/integrations/supabase/types.ts` (Docker unavailable for CLI gen — payments columns + 3 RPC signatures added manually, verified by `tsc --noEmit`)

## Server function layer (all typecheck clean)
- [x] `src/lib/server/authz.ts` (`requireStaff`), `rateLimit.ts`, `optionalAuth.ts`
- [x] `addresses.functions.ts`, `cart.functions.ts`, `wishlist.functions.ts`
- [x] `orders.functions.ts` (list mine, get-by-reference w/ guest email check, cancel)
- [x] `checkout.functions.ts` (server-priced, calls `place_order` RPC, starts SSLCommerz session)
- [x] `coupons.functions.ts` (preview/validate, service-role reads so guests can use it too)
- [x] `reviews.functions.ts` (list, eligibility, create — RLS enforces verified-buyer)
- [x] `admin/products.functions.ts`, `admin/orders.functions.ts`, `admin/customers.functions.ts`, `admin/dashboard.functions.ts`
- [x] `lib/payments/sslcommerz.ts` + `routes/api/public/payments/sslcommerz.$action.ts` (success/fail/cancel/ipn, Order Validation API check, idempotent)

## Phase 2 — Security
- [ ] `_authenticated/_admin` layout — server-verified role gate (was: login-only)
- [ ] Sign-out hygiene (`queryClient.clear()`, redirect)
- [ ] Every admin/privileged server fn independently re-checks `is_staff`/ownership server-side

## Phase 3 — Commerce (server functions, real DB)
- [ ] `addresses.functions.ts` — CRUD, single-default enforcement
- [ ] `cart.functions.ts` — DB-backed cart, guest→user merge on login
- [ ] `wishlist.functions.ts` — DB-backed wishlist
- [ ] `orders.functions.ts` — list mine, detail, cancel
- [ ] `checkout.functions.ts` — server-priced validate + atomic `place_order` RPC
- [ ] `coupons.functions.ts` — server-side validation used by checkout
- [ ] `admin/products.functions.ts` — CRUD products/variants/images
- [ ] `admin/orders.functions.ts` — list/detail/status transitions
- [ ] `admin/customers.functions.ts` — real customer list w/ order stats
- [ ] `admin/dashboard.functions.ts` — real aggregate metrics

## Phase 4 — Payments (SSLCommerz)
- [ ] `lib/payments/sslcommerz.ts` — session init + order validation call
- [ ] `routes/api/public/payments/sslcommerz.$action.ts` — success/fail/cancel/ipn handler
- [ ] Idempotent webhook → `finalize_order_paid` / `release_order_reservation` RPCs
- [ ] Checkout UI: real redirect to SSLCommerz sandbox, success/fail/cancel states

## Phase 5 — Commerce features
- [ ] Reviews — verified-buyer write path wired to `/product/$slug`
- [ ] Notifications written by order/payment lifecycle (DB rows); minimal account bell UI
- [ ] Coupons — validation + redemption live at checkout
- [ ] Audit logs written for order create/paid/cancel and admin product/order mutations

## Phase 6 — Cleanup of fake architecture
- [x] Deleted `src/lib/api.ts`, `src/lib/api-fallback.ts`, `src/lib/queries.ts`, localStorage `orders.ts`
- [x] `cart.ts`/`wishlist.ts` rewritten as hybrid guest(localStorage)/DB stores with login-time merge
- [x] Rewired `cart.tsx`, `wishlist.tsx`, `checkout.tsx`, `order.$id.tsx`, `product.$slug.tsx`, account/admin routes
- [x] `ProductForm`, `AdminShell`, admin routes on real types/server functions
- [x] `_authenticated/admin.tsx` role-gate layout added; `useSignOut()` hygiene (cancel→clear→signOut→redirect) wired into AccountShell/AdminShell
- [x] Whole project (`tsc --noEmit`) typechecks clean after the rewrite

## Phase 7 — BD localization
- [x] `formatBDT` (৳, manual South-Asian grouping) replacing `inr()`; all price displays swept
- [x] Address forms: District/Post Code labels, country default BD, phone +880
- [x] Checkout: SSLCommerz redirect replaces the old card/UPI/COD picker (method chosen on their page)
- [x] Product specs / origin copy → Bangladesh (Dhaka), reviewer names localized (data/catalog.ts)
- [x] Policy/shipping/footer/contact copy swept for India-specific references (about, contact, shipping, returns, terms, privacy, SiteFooter)

## Phase 8 — Hardening
- [x] Rate limiting via `rate_limits` table on checkout (8/10min per user-or-email) and reviews (10/hr per user); auth abuse is covered by Supabase Auth's own built-in limits (verified live — see session notes)
- [x] Error states: friendly messages for stock/coupon/payment/auth/network failures throughout; no raw `undefined`/stack traces surfaced to users

## Phase 9 — Tests
- [x] vitest installed, `bun run test` script added — 26 unit tests, all passing (`src/data/catalog.test.ts`, `src/lib/pricing.test.ts`)
- [x] Real integration tests run directly against the live DB (scratchpad scripts, not committed — see session notes): 20 assertions on `place_order`/`finalize_order_paid`/`release_order_reservation` (reservation, idempotent payment, overselling rejection, cancellation) + 5 on coupon math/limits — all passed
- [ ] No Playwright/browser E2E suite committed to the repo — see Known Limitations in the final report

## Phase 10 — Final verification
- [x] `bunx tsc --noEmit` — clean, zero errors
- [x] `bunx vitest run` — 26/26 passing
- [x] `bun run build` — succeeds (client + SSR + Cloudflare Worker/nitro bundle)
- [~] `bun run lint` — fails, but 8,024/8,030 findings are pre-existing CRLF/prettier formatting noise present even in files never touched this session (verified: `src/lib/error-capture.ts` etc. fail identically); zero genuine ESLint rule errors, only 6 pre-existing `react-refresh/only-export-components` warnings
- [x] Manual smoke pass on the running dev server: all key routes 200, real signup/trigger verified live in the DB, real SSLCommerz sandbox session confirmed reachable and returning a genuine GatewayPageURL

## Session notes (cont.)
- Caught and fixed a real bug via the integration test: `place_order` crashed with "record v_coupon is not assigned yet" whenever checkout ran with no coupon code (PL/pgSQL record fields can't be read before a SELECT INTO runs). Fixed via a follow-up migration (`20260815130000_fix_place_order_coupon_null.sql`) using scalar variables instead of a record — did not edit the already-applied migration.
- Caught and fixed a real production-build failure: `src/lib/server/*` tripped TanStack Start's client-bundle import-protection plugin (any path matching `**/server/**` is denied from client-reachable code, even though the files' *content* was server-only middleware). Renamed the folder to `src/lib/mw/`.
- Mid-session I ran `git stash` to test a hypothesis about lint noise and it reverted the entire uncommitted working tree. Recovered fully via `git stash pop` after resolving one conflict on the generated `routeTree.gen.ts` (discarded the dev-server-regenerated copy, then popped clean). Verified full recovery via `tsc`/`vitest` before continuing. No data was lost, but this should not have been risked mid-task.

## Phase 11 — Guest order tracking & cancellation (2026-08-16)
- [x] Migration `20260816120000_guest_order_tracking.sql`: `orders.guest_access_token_hash`
  (unique, hash-only — raw token never persisted), `orders.courier`/`shipment_tracking_number`;
  `place_order` extended (old 6-arg signature dropped, 7-arg replaces it) to accept + store the
  token hash; new unified `cancel_order()` (release reservation if pre-paid, **restock** if
  already paid, never falsely marks a payment "refunded"); new `set_order_shipment()`
- [x] `src/lib/mw/guestToken.ts` — token generation/hashing/constant-time verification (Node
  `crypto`, dynamically imported so it's safe from any file)
- [x] Token flows: generated at checkout → embedded in SSLCommerz callback URLs → survives the
  gateway round trip → final redirect carries it → confirmation email carries it → tracking
  page reads it from the URL (sessionStorage fallback if the query string is ever dropped)
- [x] `orders.functions.ts`: `getOrderByReference` now requires token (guest) or session
  ownership/staff (authenticated) — no more email-alone access; unified `cancelOrder` (guest +
  authenticated, re-validates ownership/status server-side regardless of UI state);
  `resendGuestTrackingLink` (order number + email → issues a **new** token, emails it — old
  link is invalidated since only the hash was ever stored)
- [x] `admin/orders.functions.ts`: admin cancel now routes through `cancel_order` too (was
  calling the old release-only function — would have under-restocked a cancelled paid order);
  new `adminSetShipment`
- [x] Real nodemailer + Gmail App Password email (`src/lib/email/`): SAAJ-branded HTML
  templates (order confirmation, cancellation, tracking-link resend) — light background by
  design (dark HTML email is unreliable across clients), champagne accent matches the site's
  token. Best-effort: a send failure never blocks checkout/cancellation
  - **Requires `SMTP_USER`/`SMTP_APP_PASSWORD` in `.env` to actually send** — until set, sends
    are skipped (logged) and the app keeps working normally
- [x] `order.$id.tsx` rewritten: real status timeline (Order Placed → Payment Confirmed →
  Processing → Shipped → Delivered, only real backend statuses), courier/tracking display,
  cancel button + reason-select confirmation modal, "cancellation unavailable" messaging,
  lost-link recovery form, safe generic errors (no order-existence leak on bad/missing token)
- [x] `admin.orders.tsx`: guest/registered badge, courier + tracking number editor
- [x] Verified live end-to-end against the real DB (script, not committed): token hash storage,
  correct-token access, wrong-token rejection, cross-order token rejection (no IDOR),
  cancel-while-pending (release only), cancel-while-paid (restock, payment stays "succeeded"
  not falsely "refunded"), cancel-blocked-once-shipped, `set_order_shipment` — 18/18 passed,
  inventory verified back to exact baseline after cleanup
- [x] `tsc --noEmit`, `bun run build` (nodemailer confirmed present only in the server bundle,
  absent from `.output/public`), `vitest run` (26/26) all clean after this phase

---
## Session notes
2026-08-15: Full repo inspected, SSLCommerz + BD localization confirmed with user. Beginning
implementation now — this file updates as each phase lands, not just at the end.

2026-08-16: Guest order tracking/cancellation built per user spec. Two live-network outages hit
this sandbox mid-session (unrelated to the app — DNS resolution failed for all external hosts,
including google.com); work paused on anything needing the DB/network and resumed once
connectivity returned, rather than reporting unverified results.
