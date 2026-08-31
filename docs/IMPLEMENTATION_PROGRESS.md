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

---

## Phase 12 — SSLCommerz → PortPos + Cash on Delivery (2026-08-16)
Decision reversal: SSLCommerz's cost structure doesn't fit SAAJ's ~৳10,000 initial launch
capital. Switched to **PortPos** (৳0 setup/monthly, ~2.2–3.5% per-txn) for online payment, and
added **Cash on Delivery** as a first-class payment method — both requirements from the user,
not a redesign of checkout/commerce.

- [x] Migration `20260816130000_portpos_cod_payments.sql`: new `payment_method` enum
  (`cod`/`portpos`) + `orders.payment_method` column; `place_order` (v3, 8-arg) branches
  inventory handling — COD commits real stock immediately (no gateway step to abandon), PortPos
  keeps the existing reserve-then-commit-on-payment behaviour; `cancel_order` patched so
  "was stock actually committed" also accounts for COD, independent of `order.status`; new
  `mark_cod_collected` RPC (the only place a COD payment becomes `succeeded`, idempotent, never
  touches `order.status`). Applied to the live DB via `supabase db push --db-url` (remote
  migration history table was never populated by earlier sessions — repaired with
  `migration repair --status applied` for the 10 pre-existing migrations first, then pushed only
  the new one). Verified live: 18/18 assertions across a full COD lifecycle (place → commit
  stock → mark collected, idempotent × 2 → cancel → restock, payment stays `succeeded`) and a
  full PortPos lifecycle (place → reserve → `finalize_order_paid`, idempotent × 2 → cancel →
  restock) — inventory returned to exact baseline after cleanup.
- [x] `src/lib/payments/portpos.ts` (replaces `sslcommerz.ts`): invoice creation
  (`POST /payment/v2/invoice`), Bearer-token auth (`base64(appKey:md5(secret+unixTimestamp))`),
  and authoritative verification (`GET /payment/v2/invoice/ipn/{invoiceId}/{amount}` — PortPos
  itself checks the amount we pass, equivalent to SSLCommerz's Order Validation API). API shape
  confirmed against PortPos's public docs and the open-source PortWallet PHP SDK (PortPos is
  PortWallet's current brand, same API family) — exact IPN/redirect payload field names could
  not be 100% confirmed from public sources (no sandbox account available in this session), so
  the callback route never trusts incoming payload fields for the paid decision — only the `ref`
  query param we ourselves embed, used to look up our own stored invoice id and expected amount.
  **A real sandbox transaction against real PortPos credentials is still needed before launch**
  to confirm the redirect leg's exact field names — see final report.
- [x] `src/routes/api/public/payments/portpos.$action.ts` (replaces `sslcommerz.$action.ts`):
  `return` (browser leg) + `ipn` (server-to-server) actions, both GET+POST, idempotent
  (short-circuits on `order.status === 'paid'`), rejects orders that aren't `payment_method
  = 'portpos'`, never marks anything paid without a successful `validatePortPosTransaction` call.
- [x] `checkout.functions.ts`: `place_order` call now passes `p_payment_method`; COD returns
  immediately after `place_order` (no gateway call, `gatewayUrl: null`); PortPos unchanged in
  shape (still rolls back via `cancel_order` on gateway-init failure).
- [x] `schemas.ts`: `paymentMethodSchema`, `checkoutSchema.paymentMethod` (required),
  `adminMarkCodCollectedSchema`.
- [x] `orders.functions.ts` / `admin/orders.functions.ts`: `paymentMethod` exposed on
  `OrderDetail`/`AdminOrder`; new `adminMarkCodCollected` server fn (staff-only, delegates to the
  RPC, re-validates server-side).
- [x] Checkout UI (`checkout.tsx`): new "Payment" step — Cash on Delivery / Online Payment cards
  with the exact copy specified, required before proceeding; COD navigates straight to
  `/order/$id` (no redirect), PortPos redirects to the gateway URL as before.
- [x] Tracking UI (`order.$id.tsx`): **added a lucide icon per timeline step**
  (ShoppingBag/CreditCard/PackageSearch/Truck/Home) above each hairline segment — this was the
  second ask ("only lines are showing, add logos for each step"). COD orders get their own
  4-step timeline (no "Payment Confirmed" step, since order.status never implies COD money was
  actually collected) plus a separate "pay ৳X on delivery" / "payment collected" line driven by
  `payments.status`.
- [x] Admin UI (`admin.orders.tsx`): COD/ONLINE (PORTPOS) badge per order; "MARK COD COLLECTED"
  button (hidden once `paymentStatus === 'succeeded'`).
- [x] Cleanup: deleted `src/lib/payments/sslcommerz.ts` and
  `src/routes/api/public/payments/sslcommerz.$action.ts`; `.env`/`.env.example` SSLCOMMERZ_* →
  PORTPOS_APP_KEY/PORTPOS_SECRET/PORTPOS_MODE; `privacy.tsx` payments copy updated. Repo-wide
  grep confirms zero remaining `sslcommerz` references outside generated files
  (`routeTree.gen.ts`, regenerated) and historical artifacts that must not be touched (already-
  applied migration files, this log's own earlier entries, `docs/schema.sql` — a stale reference
  mirror that was already out of sync with the DB before this session and is conventionally not
  kept in lockstep, per Part 2 of HANDOFF.md).
- [x] `tsc --noEmit` clean, `bunx vitest run` 26/26, `bun run build` succeeds, `eslint` on every
  touched file shows zero rule violations (581 flagged lines are 100% pre-existing CRLF vs.
  prettier's LF expectation, the same repo-wide non-issue the 2026-08-15 session already
  documented).

## Phase 13 — PortPos → bKash (2026-08-22)

Payment-provider swap only — checkout/order/COD business logic untouched. Reason: bKash is the
gateway SAAJ actually has merchant access to.

- [x] Migrations `20260822120000_bkash_add_payment_method_enum_value.sql` (adds `'bkash'` to the
  `payment_method` enum, alone, in its own transaction — Postgres won't let a freshly-added enum
  label be used in the same transaction it was added in on some versions) and
  `20260822130000_bkash_payment_functions.sql` (`place_order` v3 now validates/defaults to
  `'cod' | 'bkash'`; `orders.payment_method`/`payments.provider` defaults moved to `'bkash'`; new
  nullable `payments.guest_token` column — see below). `'portpos'` deliberately stays in the enum
  and is never touched — historical orders keep reading back correctly, `cancel_order` /
  `finalize_order_paid` / `mark_cod_collected` needed no changes at all (none of them hardcode a
  provider string).
- [x] `src/lib/payments/bkash.ts` (replaces `portpos.ts`): bKash's Tokenized Checkout (URL based)
  API, v1.2.0-beta — grant/refresh an id_token (in-memory cache, best-effort across warm
  invocations), create a payment (`bkashURL` to redirect to), and authoritative verification via
  `payment/status` (query-first) falling back to `execute` — bKash allows exactly one `execute`
  call per payment, so a retried/refreshed callback hit must check current status before ever
  attempting to execute again. Endpoint paths/payload shapes cross-checked against a maintained
  open-source TS client (bKash has no public sandbox docs page) — **flagged for the operator to
  re-verify against bKash's own onboarding docs before going live.**
- [x] `src/routes/api/public/payments/bkash.callback.ts` (replaces `portpos.$action.ts`): single
  browser-redirect callback (bKash has no separate server-to-server IPN the way PortPos did).
  Finds the order via `payments.gateway_session_id = paymentID`, never via anything threaded
  through the callback URL's query string — bKash's documented behaviour is to simply append
  `?paymentID=&status=` to whatever `callbackURL` we hand it, with no confirmed guarantee that
  merges correctly with a URL that already has a `?query` of its own, so `callbackURL` is now
  handed to bKash bare. New `payments.guest_token` column carries the guest tracking token across
  that same round trip instead (written at payment-creation time, read + cleared once here) —
  replaces the `?t=` query param PortPos threaded through `redirect_url`/`ipn_url`. Same
  idempotency/never-trust-the-request shape as the PortPos handler: a `paid` order short-circuits,
  a non-`success` `status` hint only releases the reservation, and the *paid* decision only ever
  comes from bKash's own query/execute response.
- [x] Checkout UI (`checkout.tsx`): payment method selector now offers bKash instead of Online
  Payment/PortPos; `paymentMethodSchema` (`schemas.ts`) is `'cod' | 'bkash'`. Admin UI
  (`admin.orders.tsx`): online-payment badge now reads the order's actual `payment_method`
  (`ONLINE (BKASH)` / `ONLINE (PORTPOS)` for historical orders) instead of a hardcoded PortPos
  label.
- [x] Cleanup: deleted `src/lib/payments/portpos.ts` and
  `src/routes/api/public/payments/portpos.$action.ts`; `.env.example` PORTPOS_APP_KEY/
  PORTPOS_SECRET/PORTPOS_MODE → BKASH_APP_KEY/BKASH_APP_SECRET/BKASH_USERNAME/BKASH_PASSWORD/
  BKASH_MODE/BKASH_BASE_URL; `privacy.tsx` payments copy updated. Repo-wide grep confirms no
  remaining `portpos`/PortPos references outside generated files (`routeTree.gen.ts`,
  regenerated), historical migrations, and this log's own earlier phase-12 entry (left as-is —
  it's a record of what happened then, not current state).

## Phase 14 — SAAJ Club membership (2026-08-31)

Additive enhancement — normal shopping, auth, cart, checkout, the bKash gateway integration
(`src/lib/payments/bkash.ts`, `bkash.callback.ts`) and its finalize/cancel RPC semantics are
untouched.

### Phase 14.0 — baseline
- [x] The two pending bKash migrations (`20260822120000`, `20260822130000`) were still
  **local-only** — remote was on `payment_method = (cod, portpos)` and had no
  `payments.guest_token`, so online checkout was broken against the code already in the tree.
  Pushed them as the membership baseline (they are committed, intended, and prerequisite).

### Phase 14.1 — data model (`supabase db push`, applied + smoke-tested live, then rolled back)
- [x] `20260831140000_membership_foundation.sql`: enums `membership_tier` (`NONE|CLUB`),
  `membership_status` (`ACTIVE|EXPIRED|CANCELLED|PAYMENT_FAILED`), `reward_ledger_kind`,
  `order_kind`. `membership_config` (singleton: ৳50 price, 1000 bps discount, 1 pt/৳100,
  100 birthday pts, 0 grace days — all backend-authoritative, public-readable). `memberships`
  (partial unique `(user_id,tier) where status='ACTIVE'` → no overlapping periods). `reward_ledger`
  (append-only; partial unique idempotency indexes for earn-once / reverse-once / birthday-once).
  Product cols `members_only`, `member_discount_eligible`, `member_discount_bps`,
  `available_from`, `member_available_from` (all nullable/defaulted — existing products
  unchanged). `profiles.date_of_birth`. `security.active_membership()` / `is_active_member()`
  (SECURITY DEFINER + INVOKER wrapper, honours grace period) — the authoritative "is this
  customer a member?" read. `product_member_discount_bps()`, `expire_memberships()`.
- [x] `20260831140100_membership_order_integration.sql`: `orders` snapshot cols (`order_kind`,
  `membership_id`, `membership_tier`, `membership_discount`, `reward_points_earned` — spec 21).
  `place_order` **v4** (identical 8-arg signature): server-side member pricing, `MEMBERS_ONLY`
  and `NOT_YET_AVAILABLE` rejection, projected reward points — coupon/shipping/stock logic
  byte-for-byte unchanged. `place_membership_order()` (marker order + payment row, blocks
  `ALREADY_MEMBER` / `MEMBERSHIP_ORDER_PENDING`). `security.activate_membership_from_order()` +
  `after update of status on orders` trigger `membership_order_paid` — activation happens only
  when the order is independently marked `paid` (the existing bKash callback's
  `finalize_order_paid` UPDATE fires it; gateway code never touched). Idempotent (order.membership_id
  guard). Renewal extends from current period end, not from now. `order_reward_points` trigger:
  award once on first `paid|shipped|delivered`, reverse once on `cancelled|refunded`.
  `cancel_membership()` (default: `auto_renew=false` + keep benefits to period end).
  `admin_set_membership()`, `admin_adjust_reward_points()` (reason required, audited),
  `redeem_reward_points()`, `award_birthday_reward()` (birthday-month + idempotent).
- [x] Hand-patched `src/integrations/supabase/types.ts` (3 tables, order/product/profile cols,
  10 RPC sigs, 4 enums) — `tsc --noEmit` clean.
- [x] Live smoke test (transaction, rolled back): `place_membership_order` → `finalize_order_paid`
  → trigger → `memberships` row ACTIVE 1-month period, order linked; finalize/activate retries
  keep count = 1; `ALREADY_MEMBER` enforced; guest blocked from a `members_only` product with
  `MEMBERS_ONLY`.

### Phase 14.2 — backend server functions (tsc clean)
- [x] `membership.functions.ts` — `getMembershipConfig` (public), `getMyMembership` (status +
  reward balance + benefits + best-effort birthday reward), `joinMembership` (→
  `place_membership_order` RPC → `initBkashPayment` **imported unmodified** → stash
  `gateway_session_id`; rolls the marker order back on gateway failure), `cancelMembership`.
- [x] `rewards.functions.ts` — `getMyRewards` (balance = `sum(points)` + last-50 ledger).
- [x] `membership-pricing.ts` — pure display/estimate helpers mirroring `place_order`'s math
  (`resolveMemberDiscountBps`, `memberUnitPrice`, `projectedPoints`, `canPurchase`,
  `releaseState`). 19 unit tests (`membership-pricing.test.ts`).
- [x] `cart.functions.ts` — `CartLine` now carries `listPrice` + effective `unitPrice` (member
  price for active members), `membersOnly`, release dates; friendly early stop for
  members-only / unreleased pieces (DB still the real gate). `cart.ts` guest path unchanged
  (guests are never members).
- [x] `orders.functions.ts` — `OrderDetail` gains `orderKind` / `membershipTier` /
  `membershipDiscount` / `rewardPointsEarned` (spec-21 snapshots); My Orders filtered to
  `order_kind='product'` so membership payments don't clutter the orders tab.
- [x] `catalog-live.ts` + `catalog.ts` — product member columns fetched + mapped.
- [x] `admin/members.functions.ts` — `adminListMembers`, `adminGetMemberDetail` (periods +
  ledger + membership payments), `adminSetMembership` / `adminAdjustRewardPoints` (reason
  required, delegate to audited RPCs), `adminGet/UpdateClubConfig`. `admin/dashboard.functions.ts`
  gains `activeMembers`.
- [x] `admin/products.functions.ts` + `schemas.ts` — product CRUD threads
  `membersOnly` / `memberDiscountEligible` / `memberDiscountPercent` / `availableFrom` /
  `memberAvailableFrom`.
- [x] `auth.ts` — profile now carries `dateOfBirth` (self-update via RLS).

### Phase 14.3 — storefront
- [x] `routes/club.tsx` — dedicated SAAJ Club page ("FOR THE FEW.", ৳50/month from config,
  benefits grid, CTA state machine: guest → `/auth?redirect=/club`; member → confirm-phone
  modal → bKash; active → MANAGE; cancelled-active / expired variants).
- [x] `SiteHeader` — `✦ SAAJ Club` desktop nav + mobile drawer entry. `index.tsx` — subtle
  home band. `shop.tsx` — `SAAJ CLUB` filter row (All / New / ✦ Club Exclusive / Early Access).
- [x] `ProductCard` / `product.$slug` / `QuickViewModal` — CLUB EXCLUSIVE + EARLY ACCESS
  badges, "YOUR CLUB PRICE" (member) / "৳X for SAAJ Club" (non-member), members-only &
  coming-soon gates that replace Add-to-bag with a JOIN CTA, contextual "WANT MORE?" box for
  logged-in non-members.
- [x] `cart.tsx` / `checkout.tsx` — per-line list/member price, "SAAJ Club discount" summary
  line, join nudge for non-members. `order.$id.tsx` — membership-order confirmation
  ("Welcome to the club"), reward-points-earned line on product orders.
- [x] `auth.tsx` — `?redirect=` (in-app paths only) so the guest → join flow returns to `/club`.
- [x] `account.profile.tsx` — date-of-birth field (for the birthday reward).

### Phase 14.4 — account dashboard
- [x] `routes/_authenticated/account.membership.tsx` — active/cancelled/expired states, benefits
  grid, reward balance + ledger, cancel modal (auto-renewal off, benefits to period end),
  renew/rejoin flow. `AccountShell` gains the "SAAJ Club" tab.

### Phase 14.5 — admin
- [x] `routes/_authenticated/admin.members.tsx` — members list + search, per-member drawer
  (manual status change, point adjustment — both reason-gated & audited, membership periods,
  membership payments, reward ledger), club-config editor (price / discount % / points rate /
  birthday points / grace days / rewards on-off). `AdminShell` nav + dashboard metric.
- [x] `ProductForm` — SAAJ Club section (members only, member discount enabled + custom %,
  public release + member early-access datetimes).

### Phase 14.6 — AI (read-only, agent not built)
- [x] `lib/ai/membership-tools.functions.ts` — `getCustomerMembership`, `getCustomerRewards`,
  `getMembershipBenefits`, `getExclusiveProducts` as authoritative read-only server fns for a
  future SAAJ AI agent. The agent must call these, never infer membership from being logged in
  or from chat history; it can READ only — no membership/reward/discount/payment writes.

### Phase 14.7 — verification
- [x] `bunx tsc --noEmit` clean · `bunx vitest run` 45/45 · `bun run build` succeeds (client +
  SSR + Worker; nodemailer confirmed server-only, absent from `.output/public`).
- [x] Live integration suite (scratchpad script, all in rolled-back transactions — **no test
  data persisted**): 44/44 assertions — membership lifecycle (join → verified payment →
  ACTIVE → cancel keeps benefits → expire), renewal extends the single row (no overlap),
  member pricing (10% / custom % / excluded product / expired-loses-it / snapshot on
  order_items + orders), exclusive + early-access rejection for the wrong shopper,
  reward points (projected → awarded on paid → not re-awarded on ship → reversed on cancel →
  net zero → audited admin adjustment), privileged RPCs not `authenticated`-executable,
  membership never activates without a verified payment.
- [x] Dev-server smoke: `/club`, `/shop` (club filters + "৳X for SAAJ Club" on cards),
  `/product/$slug` (member price line), home band, `/account/membership` → `/auth` redirect
  when signed out — all render, zero console errors.

### Migrations (applied to live DB via `supabase db push`)
- `20260822120000` / `20260822130000` — the two **pre-existing, un-pushed bKash migrations**
  (remote was still on `payment_method=(cod,portpos)` with no `payments.guest_token`; online
  checkout was broken against the code already in the tree). Applied as the membership baseline.
- `20260831140000` — membership foundation · `20260831140100` — order/checkout/reward
  integration · `20260831140200` — manual-renewal relaxation · `20260831140300` — member price
  rounds to the whole taka (matches `formatBDT` + the client helper).

### Not touched (per the brief)
- `src/lib/payments/bkash.ts`, `src/routes/api/public/payments/bkash.callback.ts`, and the
  `finalize_order_paid` / `cancel_order` semantics — membership activation rides the existing
  status→`paid` UPDATE via the `membership_order_paid` trigger.

---

## Phase 15 — AI Commerce Agent (2026-08-31)

Additive. No storefront, auth, Supabase, cart, checkout, order, payment, admin or SAAJ Club
code was rebuilt. The agent is an untrusted reasoning layer — the backend stays the authority.

### Architecture chosen (from Phase-1 inspection)
- **LLM**: Groq via an OpenAI-compatible client (`@langchain/openai` → `AGENT_BASE_URL`).
  Provider is replaceable by env. `.env`'s `GROQ_API_KEY` holds a **comma-separated list of 5
  keys** — `pickApiKey()` picks one at random per request to spread rate limits. Default model
  `openai/gpt-oss-120b` (the account has no `llama-3.3`; gpt-oss-120b does tool-calling +
  streaming well — verified live).
- **Orchestration**: `@langchain/langgraph` — one `agent` node ⇄ one `ToolNode`, conditional
  loop, hard step cap (`AGENT_MAX_STEPS`). No extra nodes.
- **Transport**: SSE. The app is on Cloudflare Workers with no WebSocket layer; a streamed
  `Response` from a file API route (`src/routes/api/agent/chat.ts`) is the right fit and is
  outside `start.ts`'s CSRF-for-serverFn filter. Identity comes from the `Authorization`
  header (`identifyCaller`), never the body.
- **State**: `chat_threads` / `chat_messages` (migration). The graph runs per-request (no
  live TCP for a LangGraph checkpointer on Workers), so history is loaded from these tables
  each turn. `thread_id` in `localStorage`.
- **RAG**: Postgres full-text search (`knowledge_chunks` + `match_knowledge`). No embedding
  provider is wired (Groq has no embeddings API; a Worker can't host a model). `match_knowledge`
  does OR-matched `ts_rank_cd` ranking — good for policy/FAQ where customer wording ≠ document
  wording. A nullable `embedding vector(384)` column + `pgvector` are in place for a future
  hybrid upgrade with no re-authoring.

### 15.1 — DB (`supabase db push`, applied + tested)
- [x] `20260831150000` — `chat_threads`, `chat_messages` (RLS: owner reads own; guest threads
  reached only through the service-role endpoint by possession of the id). `pgvector`.
  `knowledge_chunks` (content-hash unique → idempotent ingestion; generated `fts` tsvector +
  GIN). `match_knowledge` / `replace_knowledge_source` / `prune_chat_threads`.
- [x] `20260831150100` — **fixes a real pre-existing bug**: `service_role` lacked `USAGE` on
  schema `security`, so `place_order`'s `is_active_member` call (added in Phase 14) failed for
  member checkout via `supabaseAdmin`, and the agent's tools failed the same way. Granted.
  Also switched `match_knowledge` to OR-matching.
- [x] `20260831150200` — cast the combined rank to `real` (RETURNS TABLE type).
- [x] Hand-patched `types.ts` (3 tables + 3 RPCs). `tsc` clean.

### 15.2 — agent backend (`src/lib/agent/`)
- [x] `config.ts` / `provider.ts` — env-driven, key rotation. `context.ts` — `AgentContext`
  (`userId` from the verified session ONLY) + `AgentCollector` (products / actions / tool
  calls surfaced to the UI). `graph.ts`, `prompt.ts` (system prompt separate from code),
  `service.ts` (`runAgent` async generator → SSE events; persists user + final assistant
  message with metadata), `identify.ts`, `knowledge.ts`.
- [x] `tools.ts` — 13 tools: `search_products`, `get_product_details`,
  `get_product_availability`, `get_exclusive_products`, `get_early_access_products`,
  `get_membership_benefits`, `get_customer_membership`, `get_customer_rewards`,
  `get_customer_orders`, `get_order_status`, `get_order_details`,
  `get_cancellation_eligibility`, `get_store_policies` (RAG). Every customer tool is scoped to
  `ctx.userId`; **none takes a user id / owner / membership flag as an argument**. A guest
  hitting a customer tool gets `{error:"auth_required"}` → the model asks them to sign in.
- [x] `src/routes/api/agent/chat.ts` — SSE POST + history GET. Rate-limited via the existing
  `rate_limits` table (`assertRateLimit`, 20/5min per user-or-ip).

### 15.3 — RAG ingestion
- [x] `knowledge-sources.ts` — the canonical static knowledge (shipping, returns, terms,
  privacy, about, contact, product-care, FAQ, SAAJ Club) mirroring the storefront pages,
  authored so re-ingestion is a no-op on unchanged content. `ingest.ts` — semantic chunking
  (per section, never mid-paragraph, page+heading kept with each), SHA-256 hash,
  `replace_knowledge_source` (clears a source's chunks then re-inserts). `scripts/ingest-knowledge.mjs`
  + a staff serverFn (`adminReingestKnowledge`) with a button on Admin → Overview.
- [x] 33 chunks / 9 sources ingested to the live DB.

### 15.4 — chat UI (`src/components/agent/`, mounted once in `__root.tsx`)
- [x] `ChatWidget` — floating bubble using the **actual SAAJ favicon**
  (`/favicon_io/android-chrome-192x192.png`), draggable (Pointer Events on `document` →
  mouse + touch, 4px tap/drag threshold, viewport-clamped, position in `localStorage`),
  hidden while the panel is open so it can't intercept the input row's clicks.
- [x] `useBodyScrollLock` — position:fixed + restore-scroll technique (holds on mobile Safari,
  no jump on close). `ChatPanel` — desktop panel / mobile sheet, header (favicon + New chat +
  close), message list is the **only** scroller (`overscroll-contain`), streaming tokens,
  "SAAJ is thinking…" / per-tool status lines, compact SAAJ-styled product cards (member
  prices, link to `/product/$slug`), action pills (navigate existing routes), inline error +
  RETRY, textarea (Enter send / Shift+Enter newline). Backdrop closes on outside click; the
  panel is a sibling with a higher z-index so inside clicks never reach it; Escape closes;
  scrolling is restored on close.

### 15.5 — verification
- [x] `tsc --noEmit` clean · `vitest` 45/45 · `vite build` succeeds; `@langchain`/`langgraph`
  are **server bundle only** (`grep` on `.output/public` is clean); server bundle 5.8 MB.
- [x] Live tool/RAG suite (scratchpad, 25/25): ingestion + idempotency, `match_knowledge`
  across 6 realistic policy questions + source filtering, product query, `active_membership`
  callable by `service_role`, order lookup scoped by `user_id`+reference (no cross-account).
- [x] Live end-to-end through the SSE endpoint + browser: policy question → `get_store_policies`
  → grounded answer citing the returns policy with the real 5–7 day figure; "recommend a
  minimal everyday chain" → `search_products` → two real product cards with member prices;
  guest "Am I a member?" / "How many points do I have?" → polite sign-in prompt (no
  invention, no "logged-in = member"); "members-only pieces?" → correct empty answer
  (none seeded). Bubble drag persists across reload; open → background scroll locked
  (`position:fixed`) → close → restored; outside-click closes, Send/input clicks don't.

### Known limitation
- **The `GROQ_API_KEY` in `.env` must be valid.** As delivered it is a valid 5-key rotation
  list and the agent works end-to-end. If the keys expire, the bubble still renders and every
  message returns "The assistant is unavailable right now" — nothing else in the app breaks.
- RAG is lexical (FTS), not vector — see the migration note. Swapping in embeddings later is a
  small migration + wiring an `embed()` call, with no change to `knowledge-sources.ts`.
