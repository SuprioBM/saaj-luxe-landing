# SAAJ — Production Build Progress

Living document. Update at the end of every work session.

## Target architecture (agreed)

| Layer | Decision |
| --- | --- |
| Framework | TanStack Start v1 (React 19 + Vite). **Not** Next.js — the router is fixed on this platform. |
| API layer | `createServerFn` for app-internal RPC; `src/routes/api/public/*` server routes for webhooks/external callers. **Not** a separate Express process — the runtime is Cloudflare Workers. |
| Database | Supabase Postgres (user's own project `rtzvnafw…`), connected via the Lovable Supabase integration. |
| Auth | Supabase Auth — email/password + Google OAuth. |
| Sessions | Supabase-issued JWT in an HTTP-only cookie, re-validated server-side on every protected call via `requireSupabaseAuth`. **No Redis** (no long-lived process in a Worker runtime); Postgres + edge cache take its place. |
| Payments | Stripe Checkout + signed webhook at `/api/public/webhooks/stripe`. |
| Storage | Supabase Storage (`product-images` bucket). |
| Roles | `user_roles` table + `has_role()` security-definer fn. Never on `profiles`. |

## Status legend
`DONE` · `IN PROGRESS` · `BLOCKED` · `TODO`

---

## Phase 0 — Connection
| Item | Status | Notes |
| --- | --- | --- |
| Connect user's Supabase project | **BLOCKED** | User must connect via Project Settings → Integrations → Supabase. Chat-pasted DB password must be rotated and is not used. |
| Rotate leaked DB password | **BLOCKED** | User action. |

## Phase 1 — Foundation (current)
| Item | Status | Notes |
| --- | --- | --- |
| Full schema migration authored | **DONE** | `docs/schema.sql` — 18 tables, enums, FKs, indexes, RLS, grants, triggers. Applied verbatim through the migration tool once connected. |
| Migration applied to database | **BLOCKED** | Waiting on Phase 0. |
| Seed catalog from `src/data/catalog.ts` | TODO | Literal INSERTs in a seed migration. |
| Auth pages wired to Supabase (email/password) | TODO | Replaces demo logic in `src/lib/auth.ts`. |
| Google OAuth via Lovable broker | TODO | `lovable.auth.signInWithOAuth("google")` + `configure_social_auth`. |
| `_authenticated` route gate | TODO | Move `/account/*` under it. |
| Admin role gate (`_authenticated/_admin`) | TODO | Move `/admin/*` under it. |
| Cart moved off localStorage → `carts`/`cart_items` | TODO | Server fns; guest cart merges on login. |
| Wishlist moved off localStorage → `wishlists` | TODO | |
| Orders moved off localStorage → `orders` | TODO | |

## Phase 2 — Commerce
| Item | Status |
| --- | --- |
| Product read/search/filter/sort/paginate server fns | TODO |
| Admin product CRUD against DB | TODO |
| Supabase Storage image upload (replaces data-URL fallback) | TODO |
| Checkout → Stripe Checkout session | TODO |
| Stripe webhook + payment status tracking | TODO |
| Stock decrement on paid / restore on cancel-refund | TODO |
| Coupons (fixed + percent, expiry, usage limits) | TODO |

## Phase 3 — Post-purchase & admin
| Item | Status |
| --- | --- |
| Order lifecycle + status transitions | TODO |
| Reviews (verified-buyer gated) | TODO |
| Notifications (user + admin) | TODO |
| Admin dashboard metrics from real data | TODO |
| Admin user management (suspend/activate/role change) | TODO |
| Invoices | TODO |
| Audit logs write path | TODO |

## Phase 4 — Hardening
| Item | Status |
| --- | --- |
| Zod validation on every server fn | TODO |
| Rate limiting (`rate_limits` table, per-IP/user) | TODO |
| Remove all local fallbacks (`src/lib/api-fallback.ts`) | TODO |
| Security scan + fixes | TODO |

---

## Session log

### 2026-07-31 — Session 1
- Confirmed stack constraints with user; agreed to build natively on TanStack Start.
- Authored `supabase/migrations/0001_foundation.sql` (complete schema).
- Created this tracker.
- **Blocked on:** user connecting their Supabase project.
- **Next session starts at:** apply `0001_foundation.sql`, then seed the catalog, then rewire `src/lib/auth.ts` to Supabase Auth.
