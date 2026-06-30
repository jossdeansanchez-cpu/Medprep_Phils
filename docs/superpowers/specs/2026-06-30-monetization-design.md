# MEDprep Monetization — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design), pending implementation plan

## Goal

Add subscription monetization to MEDprep with three paid tiers (Basic, Pro, Max Pro),
each available **monthly or yearly**, plus a limited **Free** tier. Payments via **Stripe**
(hosted Checkout + Customer Portal + webhooks), built and tested in the connected Stripe
**sandbox** (`acct_1TnpBvRpyWHwb96O`, "dodge enterprise sandbox").

## Plans & gating

| Capability | Free | Basic | Pro | Max Pro |
|---|:--:|:--:|:--:|:--:|
| Study mode, all 12 subjects | ✓ (10 Q/day) | ✓ unlimited | ✓ unlimited | ✓ unlimited |
| Instant explanations in study mode | ✓ | ✓ | ✓ | ✓ |
| Saved practice history | — | ✓ | ✓ | ✓ |
| Timed PLE mock exams | — | — | ✓ unlimited | ✓ unlimited |
| Mock results + per-subject review | — | — | ✓ | ✓ |
| Analytics dashboard | — | — | — | ✓ |
| PDF score reports | — | — | — | ✓ (phase 2) |
| Early access to new question sets | — | — | — | ✓ |

**Prices (PHP, presentment currency).** Yearly ≈ 2 months free.

| Tier | Monthly | Yearly |
|---|---|---|
| Basic | ₱149 | ₱1,490 |
| Pro | ₱349 | ₱3,490 |
| Max Pro | ₱599 | ₱5,990 |

**Design notes**
- Study-mode explanations remain free for all tiers (core learning loop). The primary
  paid line is **mock exams = Pro+**.
- Free tier daily cap = **10 answered study questions per calendar day** (UTC day),
  enforced server-side.
- A user with no subscription row resolves to **Free**.

## Plan resolution (entitlements)

Tier order: `free < basic < pro < max_pro`.

A subscription is "entitled" when `status ∈ {active, trialing}`. Otherwise the user falls
back to Free. Feature checks:
- **Mock exams** (start a mock attempt, view mock results/review): requires `pro` or higher.
- **Saved practice history** (dashboard "recent attempts", results pages for practice):
  requires `basic` or higher.
- **Analytics dashboard**: requires `max_pro`.
- **Study mode** is always allowed; Free is capped at 10 answered questions/day.

## Data model (Supabase, migration `0005_subscriptions.sql`)

```sql
create type plan_tier as enum ('free','basic','pro','max_pro');
create type billing_interval as enum ('month','year');

create table subscriptions (
  user_id                uuid primary key references profiles(id) on delete cascade,
  plan                   plan_tier not null default 'free',
  status                 text not null default 'inactive', -- mirrors Stripe status
  interval               billing_interval,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

create table practice_daily (
  user_id  uuid references profiles(id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  answered int not null default 0,
  primary key (user_id, day)
);
```

**RLS**
- `subscriptions`: a user may `select` their own row; an admin may select all. No client
  `insert/update` — writes happen only through the webhook (service path) or admin RPC.
- `practice_daily`: no direct client access; only touched by SECURITY DEFINER functions.

**Helper RPC** `current_entitlements()` (SECURITY DEFINER, scoped to `auth.uid()`):
returns `{ plan, status, entitled (bool), current_period_end }`, resolving no-row → free.

## Free daily cap enforcement

`save_answer` (existing RPC) gains plan-awareness: when the caller's resolved plan is
`free` AND the attempt's template is practice mode, it increments
`practice_daily(user_id, today)` and raises `Daily free limit reached` once `answered`
would exceed 10. Paid tiers skip the counter. Mock attempts are unreachable by Free users
(blocked at start), so the cap only applies to study mode.

## Mock-exam gate

`start_attempt` (existing RPC) checks: if the template mode is `mock` and the caller's
resolved plan is below `pro`, raise `Upgrade to Pro to take mock exams`. The client also
hides/locks mock CTAs for non-Pro users, but the RPC is the authoritative gate.

## Stripe integration

### Products & prices
Create in the sandbox (via Stripe tools): 3 products (Basic, Pro, Max Pro), each with two
recurring PHP prices (monthly, yearly) → 6 price IDs. A server-side config maps
`price_id → { plan, interval }` and `{ plan, interval } → price_id`. Price IDs stored in a
small `src/lib/billing/plans.ts` config (sourced from env or committed test IDs).

### Routes (App Router route handlers)
- `POST /api/checkout` — body `{ plan, interval }`. Verifies the user is signed in, finds
  or creates a Stripe customer (store `stripe_customer_id`), creates a Checkout Session
  (`mode: subscription`, the chosen price, `client_reference_id = user_id`,
  metadata `{ user_id }`, success/cancel URLs), returns the session URL for redirect.
- `POST /api/portal` — creates a Billing Portal session for the user's Stripe customer,
  returns the URL.
- `POST /api/stripe/webhook` — raw body + signature verification with
  `STRIPE_WEBHOOK_SECRET`. Handles:
  - `checkout.session.completed` → record customer + subscription, upsert `subscriptions`.
  - `customer.subscription.created|updated` → upsert plan (from price), status, interval,
    `current_period_end`.
  - `customer.subscription.deleted` → set plan `free`, status `canceled`.
  - `invoice.payment_failed` → status `past_due`.
  Webhook uses a privileged DB path (service-role client) to write `subscriptions`,
  resolving the user via `client_reference_id`/customer mapping.

### Env vars (add to `.env.local` and Vercel)
- `STRIPE_SECRET_KEY` (test `sk_test_…`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_…`)
- `NEXT_PUBLIC_SITE_URL` (for Checkout success/cancel + portal return URLs)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; needed by the webhook to write subscriptions
  bypassing RLS). This is the one place the service-role key is introduced; it stays
  server-only and is never imported into client code.
- Price IDs (6) — in `plans.ts` config or env.

## UI

- **`/pricing`** — three tier cards with a **monthly/yearly toggle**, prices, feature
  bullets, and a Subscribe button per tier (→ `/api/checkout` → redirect). The user's
  current plan is highlighted; current plan shows "Manage" (→ portal) instead of Subscribe.
- **Upgrade gates** — a reusable `<UpgradeGate requires="pro">` block shown where a locked
  feature would be (e.g., mock-exam CTAs for non-Pro), linking to `/pricing`.
- **Billing** — a section on a `/account` (or within dashboard) page: current plan,
  renewal date, "Manage subscription" (portal) button.
- **Sidebar** — small plan badge under the user; an "Upgrade" link for Free/Basic.
- **Analytics (Max Pro)** — `/analytics` page built from existing `exam_attempts` /
  `attempt_questions`: average over time, per-subject mastery, weakest subjects,
  pass-rate trend. Gated to Max Pro.

## Admin

- Show each student's plan in `/admin/students`.
- **Grant plan manually**: admin-only RPC `admin_set_plan(user_id, plan, interval?)` that
  upserts a `subscriptions` row with status `active` and a far-future `current_period_end`
  (no Stripe customer). Useful for comping friends during the feedback phase. Gated by
  `is_admin()`.

## Going-live caveat (out of scope for this build)

The sandbox supports the full build/test flow. Accepting **live** payments from a
Philippine-based business is not currently supported by Stripe; going live later requires a
Stripe entity in a supported country or a PH-friendly processor (PayMongo, or a
merchant-of-record like Paddle/Lemon Squeezy). The integration is structured so the
processor swap is isolated to the `/api/checkout`, `/api/portal`, `/api/stripe/webhook`
handlers and `plans.ts`.

## Out of scope / phase 2
- PDF score report generation (Max Pro) — ship the gate/label; build the generator later.
- Proration UX niceties, coupons/promo codes, tax handling.
- Email receipts beyond Stripe's defaults.

## Verification plan
1. Create the 6 prices in the sandbox; confirm IDs load in `plans.ts`.
2. Run migration; confirm `subscriptions`/`practice_daily` + RLS + `current_entitlements()`.
3. Free flow: new user → study mode works; answering an 11th question in a day is blocked;
   mock-exam start is blocked with an upgrade message.
4. Subscribe flow (Stripe test card `4242…`): `/pricing` → Checkout → webhook upserts
   `subscriptions` → user becomes Pro → mock exams unlock; verify via the live webhook
   (Stripe CLI `stripe listen` locally) and on the deployed URL.
5. Portal: cancel in portal → `subscription.deleted` webhook → user drops to Free.
6. Max Pro: analytics page gated correctly; visible only to Max Pro.
7. Admin grant: `admin_set_plan` upgrades a student; non-admin is rejected.
8. Security: a Free user calling `start_attempt` for a mock directly via REST is rejected.
