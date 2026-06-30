# MEDprep Monetization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stripe subscription billing (Free + Basic/Pro/Max Pro, monthly & yearly, PHP) with server-side feature gating to MEDprep.

**Architecture:** Stripe hosted Checkout + Customer Portal; a Stripe webhook syncs subscription state into a Supabase `subscriptions` table (written via the service-role key, behind signature verification). Entitlements resolve from that table; gating is enforced in existing Supabase RPCs (`start_attempt`, `save_answer`) and in server code, with matching UI locks.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), `stripe` Node SDK, Tailwind v4.

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next.js code (per AGENTS.md — this Next.js may differ from training data).
- Currency: **PHP**. Prices: Basic ₱149/mo, ₱1,490/yr · Pro ₱349/mo, ₱3,490/yr · Max Pro ₱599/mo, ₱5,990/yr.
- Tier order: `free < basic < pro < max_pro`. Entitled when Stripe status ∈ {active, trialing}; else Free.
- Mock exams require `pro`+. Saved practice history requires `basic`+. Analytics requires `max_pro`. Study mode always allowed; Free capped at **10 answered study questions per UTC day**.
- All gating is enforced server-side (RPC/route); UI locks are secondary. Never trust the client.
- Supabase project ref: `gatfkzqabagfpqziiyjl`. Stripe sandbox: `acct_1TnpBvRpyWHwb96O` (test mode only).
- Service-role key is server-only — never imported into a Client Component.
- Follow existing patterns: `AppShell`, `.glass`/`.btn-primary` styles, server actions in `src/lib/*` and `src/app/*/actions.ts`, RPC wrappers in `src/lib/exam.ts`.

---

## File structure

- `src/lib/billing/plans.ts` — tier metadata, prices, Stripe price-ID ↔ {plan,interval} maps. **One source of truth for plan config.**
- `src/lib/billing/stripe.ts` — server-only Stripe SDK client.
- `src/lib/billing/entitlements.ts` — `getEntitlements()` server helper + tier comparison.
- `src/lib/supabase/admin.ts` — service-role client (re-introduced; webhook only).
- `src/app/api/checkout/route.ts` — create Checkout Session.
- `src/app/api/portal/route.ts` — create Billing Portal session.
- `src/app/api/stripe/webhook/route.ts` — verify + sync subscriptions.
- `src/app/pricing/page.tsx` + `PricingClient.tsx` — pricing UI with monthly/yearly toggle.
- `src/app/account/page.tsx` — current plan + Manage subscription.
- `src/app/analytics/page.tsx` — Max Pro analytics.
- `src/components/UpgradeGate.tsx` — reusable locked-feature block.
- `supabase/migrations/0005_subscriptions.sql` — schema, RLS, entitlements RPC, gating, `admin_set_plan`.
- Modify: `src/app/dashboard/page.tsx`, `src/app/practice/page.tsx`, `src/components/Sidebar.tsx`, `src/components/ExamRunner.tsx`, `src/app/admin/students/page.tsx`, `src/app/admin/actions.ts`.

---

### Task 1: Plan config + create Stripe prices

**Files:**
- Create: `src/lib/billing/plans.ts`

**Interfaces:**
- Produces: `PLANS` (array of `{ tier, name, blurb, features, monthlyAmount, yearlyAmount }`), `TIER_RANK: Record<PlanTier, number>`, `priceToPlan(priceId): {tier, interval} | null`, `planToPriceId(tier, interval): string | null`, `PLAN_TIERS = ['free','basic','pro','max_pro']`.

- [ ] **Step 1: Create the 6 recurring prices in the Stripe sandbox.**

Use the Stripe tools (test mode). For each tier create a product, then a monthly and a yearly PHP price. Amounts are in centavos (×100): Basic 14900/149000, Pro 34900/349000, Max Pro 59900/599000.

Run (one per product/price, via `stripe_api_write` or `stripe` CLI):
```
# product
stripe products create --name "MEDprep Basic"
# monthly price (repeat per tier/interval)
stripe prices create --product <prod_id> --currency php --unit-amount 14900 \
  --recurring.interval month
stripe prices create --product <prod_id> --currency php --unit-amount 149000 \
  --recurring.interval year
```
Record the 6 resulting `price_…` IDs.

Expected: 3 products, 6 prices listed by `stripe prices list`.

- [ ] **Step 2: Write `plans.ts` with the recorded price IDs.**

```ts
export type PlanTier = "free" | "basic" | "pro" | "max_pro";
export type BillingInterval = "month" | "year";

export const PLAN_TIERS: PlanTier[] = ["free", "basic", "pro", "max_pro"];
export const TIER_RANK: Record<PlanTier, number> = { free: 0, basic: 1, pro: 2, max_pro: 3 };

// Test-mode price IDs (not secret). Override per-tier via env for live mode if set.
const PRICE_IDS: Record<Exclude<PlanTier, "free">, Record<BillingInterval, string>> = {
  basic:   { month: "price_BASIC_M",   year: "price_BASIC_Y" },
  pro:     { month: "price_PRO_M",     year: "price_PRO_Y" },
  max_pro: { month: "price_MAXPRO_M",  year: "price_MAXPRO_Y" },
};

export interface PlanDef {
  tier: PlanTier;
  name: string;
  blurb: string;
  monthly: number; // pesos
  yearly: number;  // pesos
  features: string[];
}

export const PLANS: PlanDef[] = [
  { tier: "basic", name: "Basic", blurb: "Unlimited practice", monthly: 149, yearly: 1490,
    features: ["Unlimited study mode", "All 12 subjects", "Saved practice history"] },
  { tier: "pro", name: "Pro", blurb: "Exam ready", monthly: 349, yearly: 3490,
    features: ["Everything in Basic", "Unlimited timed mock exams", "Full results & per-subject review"] },
  { tier: "max_pro", name: "Max Pro", blurb: "Track your progress", monthly: 599, yearly: 5990,
    features: ["Everything in Pro", "Analytics dashboard", "Early access to new question sets"] },
];

export function planToPriceId(tier: PlanTier, interval: BillingInterval): string | null {
  if (tier === "free") return null;
  return PRICE_IDS[tier]?.[interval] ?? null;
}

export function priceToPlan(priceId: string): { tier: PlanTier; interval: BillingInterval } | null {
  for (const tier of ["basic", "pro", "max_pro"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (PRICE_IDS[tier][interval] === priceId) return { tier, interval };
    }
  }
  return null;
}
```

- [ ] **Step 3: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/billing/plans.ts
git commit -m "feat(billing): add plan config and Stripe price IDs"
```

---

### Task 2: Database — subscriptions, gating, entitlements, admin_set_plan

**Files:**
- Create: `supabase/migrations/0005_subscriptions.sql`

**Interfaces:**
- Produces RPCs: `current_entitlements()` → `{ plan, status, entitled, current_period_end }`; `admin_set_plan(p_user_id uuid, p_plan plan_tier, p_interval billing_interval)`; modified `start_attempt` (mock gate) and `save_answer` (free daily cap). New tables `subscriptions`, `practice_daily`.

- [ ] **Step 1: Write the migration.**

```sql
create type plan_tier as enum ('free','basic','pro','max_pro');
create type billing_interval as enum ('month','year');

create table public.subscriptions (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  plan                   plan_tier not null default 'free',
  status                 text not null default 'inactive',
  interval               billing_interval,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

create table public.practice_daily (
  user_id  uuid references public.profiles(id) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  answered int not null default 0,
  primary key (user_id, day)
);

alter table public.subscriptions enable row level security;
alter table public.practice_daily enable row level security;

create policy "subs read own" on public.subscriptions
  for select using (user_id = auth.uid() or public.is_admin());
-- No client write policies: writes go through service-role (webhook) or admin RPC.

-- Resolve the caller's plan. No row / not entitled => free.
create or replace function public.current_entitlements()
returns table (plan plan_tier, status text, entitled boolean, current_period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select
    case when s.status in ('active','trialing') then s.plan else 'free'::plan_tier end,
    coalesce(s.status, 'inactive'),
    coalesce(s.status in ('active','trialing'), false),
    s.current_period_end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

-- Helper: caller's effective tier rank.
create or replace function public.effective_plan()
returns plan_tier language sql stable security definer set search_path = public as $$
  select case when s.status in ('active','trialing') then s.plan else 'free'::plan_tier end
  from (select auth.uid() as uid) me
  left join public.subscriptions s on s.user_id = me.uid;
$$;

create or replace function public.plan_rank(p plan_tier)
returns int language sql immutable as $$
  select case p when 'free' then 0 when 'basic' then 1 when 'pro' then 2 when 'max_pro' then 3 end;
$$;

-- Admin: comp a plan (no Stripe).
create or replace function public.admin_set_plan(
  p_user_id uuid, p_plan plan_tier, p_interval billing_interval default 'month'
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.subscriptions (user_id, plan, status, interval, current_period_end, updated_at)
  values (p_user_id, p_plan,
          case when p_plan = 'free' then 'inactive' else 'active' end,
          p_interval, now() + interval '100 years', now())
  on conflict (user_id) do update
    set plan = excluded.plan, status = excluded.status, interval = excluded.interval,
        current_period_end = excluded.current_period_end, updated_at = now();
end;
$$;
```

- [ ] **Step 2: Append the gating updates to the same migration (re-create the two RPCs with gates).**

Re-create `start_attempt` adding a mock gate after the template lookup, and `save_answer` adding the free daily cap. Copy the current bodies from `0003_exam_functions.sql` and insert the marked blocks:

In `start_attempt`, immediately after `if not v_published and not public.is_admin() ... end if;` add:
```sql
  -- Mock exams require Pro+.
  if (select mode from public.exam_templates where id = p_template_id) = 'mock'
     and public.plan_rank(public.effective_plan()) < public.plan_rank('pro') then
    raise exception 'Upgrade to Pro to take mock exams';
  end if;
```

In `save_answer`, after the `if v_status <> 'in_progress' ...` guard and before the `update`, add:
```sql
  -- Free tier: cap study-mode answers at 10 per UTC day.
  if v_mode = 'practice' and public.effective_plan() = 'free' then
    insert into public.practice_daily (user_id, day, answered)
    values (v_uid, (now() at time zone 'utc')::date, 1)
    on conflict (user_id, day) do update set answered = public.practice_daily.answered + 1;
    if (select answered from public.practice_daily
        where user_id = v_uid and day = (now() at time zone 'utc')::date) > 10 then
      raise exception 'Daily free limit reached. Upgrade to keep practicing.';
    end if;
  end if;
```
(Include the full re-created function bodies in the migration — copy verbatim from `0003_exam_functions.sql` with these inserts.)

- [ ] **Step 3: Apply the migration.**

Use `apply_migration` (project `gatfkzqabagfpqziiyjl`, name `subscriptions`) with the full SQL.
Expected: `{"success":true}`.

- [ ] **Step 4: Verify with SQL/REST.**

```bash
# As a fresh free user (create via admin_create_student or use student token):
# current_entitlements -> plan free, entitled false
curl -s -X POST "$URL/rest/v1/rpc/current_entitlements" -H "apikey: $KEY" -H "Authorization: Bearer $STOK" -H "Content-Type: application/json" -d '{}'
# start_attempt on a mock template -> error "Upgrade to Pro to take mock exams"
# admin_set_plan as admin -> upgrades; re-check current_entitlements -> pro
```
Expected: free user blocked from mock; `admin_set_plan` upgrades; non-admin `admin_set_plan` → "Not authorized".

- [ ] **Step 5: Commit.**

```bash
git add supabase/migrations/0005_subscriptions.sql
git commit -m "feat(billing): subscriptions schema, entitlements, gating, admin_set_plan"
```

---

### Task 3: Service-role client + Stripe SDK client + env

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/billing/stripe.ts`
- Modify: `.env.local` (local), Vercel env

**Interfaces:**
- Produces: `createAdminClient()` (service-role Supabase), `stripe` (configured Stripe client).

- [ ] **Step 1: Install Stripe SDK.**

Run: `npm install stripe`
Expected: added to dependencies.

- [ ] **Step 2: Create the service-role client.**

```ts
// src/lib/supabase/admin.ts — SERVER ONLY. Bypasses RLS. Use only after verifying intent.
import { createClient } from "@supabase/supabase-js";
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

- [ ] **Step 3: Create the Stripe client.**

```ts
// src/lib/billing/stripe.ts — SERVER ONLY.
import Stripe from "stripe";
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

- [ ] **Step 4: Add env vars locally.**

Append to `.env.local`:
```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…            # from `stripe listen` or dashboard endpoint
SUPABASE_SERVICE_ROLE_KEY=…             # Supabase dashboard → Project Settings → API
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
(Get `STRIPE_SECRET_KEY` from the sandbox apikeys link; `SUPABASE_SERVICE_ROLE_KEY` from the Supabase API settings. `STRIPE_WEBHOOK_SECRET` is set in Task 5.)

- [ ] **Step 5: Typecheck + commit.**

Run: `npx tsc --noEmit` → no errors.
```bash
git add src/lib/supabase/admin.ts src/lib/billing/stripe.ts package.json package-lock.json
git commit -m "feat(billing): add Stripe + service-role clients"
```

---

### Task 4: Entitlements server helper

**Files:**
- Create: `src/lib/billing/entitlements.ts`

**Interfaces:**
- Produces: `getEntitlements()` → `{ plan: PlanTier, entitled: boolean, currentPeriodEnd: string | null }`; `hasAtLeast(plan, min): boolean`.

- [ ] **Step 1: Implement.**

```ts
import { createClient } from "@/lib/supabase/server";
import { TIER_RANK, type PlanTier } from "@/lib/billing/plans";

export function hasAtLeast(plan: PlanTier, min: PlanTier) {
  return TIER_RANK[plan] >= TIER_RANK[min];
}

export async function getEntitlements(): Promise<{
  plan: PlanTier; entitled: boolean; currentPeriodEnd: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_entitlements");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    plan: (row?.plan ?? "free") as PlanTier,
    entitled: !!row?.entitled,
    currentPeriodEnd: row?.current_period_end ?? null,
  };
}
```

- [ ] **Step 2: Typecheck + commit.**

Run: `npx tsc --noEmit` → no errors.
```bash
git add src/lib/billing/entitlements.ts
git commit -m "feat(billing): entitlements server helper"
```

---

### Task 5: Webhook route + Stripe CLI listener

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

**Interfaces:**
- Consumes: `stripe`, `createAdminClient`, `priceToPlan`.
- Produces: upserts into `subscriptions` keyed by `user_id`.

- [ ] **Step 1: Implement the webhook.**

```ts
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceToPlan } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  const db = createAdminClient();

  async function upsertFromSubscription(sub: Stripe.Subscription, userId?: string) {
    const priceId = sub.items.data[0]?.price.id ?? "";
    const mapped = priceToPlan(priceId);
    const uid = userId ?? (sub.metadata.user_id as string | undefined);
    if (!uid) return;
    await db.from("subscriptions").upsert({
      user_id: uid,
      plan: mapped?.tier ?? "free",
      interval: mapped?.interval ?? null,
      status: sub.status,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const uid = s.client_reference_id ?? (s.metadata?.user_id as string | undefined);
      if (s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription as string);
        await upsertFromSubscription(sub, uid ?? undefined);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db.from("subscriptions")
        .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Start the local listener to get the signing secret.**

Run: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
Copy the printed `whsec_…` into `.env.local` as `STRIPE_WEBHOOK_SECRET`, restart `npm run dev`.
Expected: "Ready! …" and events forward on trigger.

- [ ] **Step 3: Smoke-test signature handling.**

Run: `stripe trigger checkout.session.completed`
Expected: route returns 200 in the `stripe listen` log (a no-op upsert without a real user is fine).

- [ ] **Step 4: Commit.**

```bash
git add src/app/api/stripe/webhook/route.ts
git commit -m "feat(billing): Stripe webhook syncing subscriptions"
```

---

### Task 6: Checkout + Portal routes

**Files:**
- Create: `src/app/api/checkout/route.ts`, `src/app/api/portal/route.ts`

**Interfaces:**
- Consumes: `stripe`, `getCurrentProfile`, `createClient`, `planToPriceId`.
- Produces: JSON `{ url }` to redirect the browser to.

- [ ] **Step 1: Checkout route.**

```ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";
import { planToPriceId, type PlanTier, type BillingInterval } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { plan, interval } = (await req.json()) as { plan: PlanTier; interval: BillingInterval };
  const price = planToPriceId(plan, interval);
  if (!price) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const { data: sub } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
    success_url: `${site}/account?checkout=success`,
    cancel_url: `${site}/pricing?checkout=cancel`,
  });
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Portal route.**

```ts
import { NextResponse } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: sub } = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!sub?.stripe_customer_id) return NextResponse.json({ error: "No billing account" }, { status: 400 });

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/account`,
  });
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 3: Build + commit.**

Run: `npm run build` → succeeds.
```bash
git add src/app/api/checkout/route.ts src/app/api/portal/route.ts
git commit -m "feat(billing): checkout and customer portal routes"
```

---

### Task 7: Pricing page

**Files:**
- Create: `src/app/pricing/page.tsx`, `src/app/pricing/PricingClient.tsx`

**Interfaces:**
- Consumes: `PLANS`, `getEntitlements`, `getCurrentProfile`. Posts to `/api/checkout`.

- [ ] **Step 1: Server page — pass current plan + sign-in state to the client.**

```tsx
// page.tsx
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const profile = await getCurrentProfile();
  const ent = profile ? await getEntitlements() : { plan: "free" as const };
  return <PricingClient signedIn={!!profile} currentPlan={ent.plan} />;
}
```

- [ ] **Step 2: Client — monthly/yearly toggle + subscribe.**

`PricingClient.tsx` ("use client"): a toggle state `interval: "month" | "year"`; render the three `PLANS` cards (`.glass` styling) showing `interval === "month" ? monthly : yearly` with "/mo" or "/yr"; each card's button:
- if `!signedIn` → link to `/login?redirect=/pricing`.
- else if `currentPlan === tier` → "Current plan" (disabled) + link to `/account`.
- else → button that `await fetch("/api/checkout", { method:"POST", body: JSON.stringify({ plan: tier, interval }) })`, then `window.location.href = (await res.json()).url`.
Wrap page in the gradient (`app-gradient min-h-screen`) with a centered max-w container and a heading "Choose your plan".

- [ ] **Step 3: Build + browser check.**

Run: `npm run build` → succeeds. Visit `/pricing`: toggle switches prices; buttons reflect sign-in/current plan.

- [ ] **Step 4: Commit.**

```bash
git add src/app/pricing
git commit -m "feat(billing): pricing page with monthly/yearly toggle"
```

---

### Task 8: Account/billing page + sidebar plan badge

**Files:**
- Create: `src/app/account/page.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `getEntitlements`, `PLANS`. Posts to `/api/portal`.

- [ ] **Step 1: Account page in `AppShell`.**

Server page: `getCurrentProfile` (redirect if none), `getEntitlements`. Render a `.glass` card: plan name, status, renewal date (`currentPeriodEnd`), and either a "Manage subscription" button (client component posting to `/api/portal` → redirect) when on a paid plan, or an "Upgrade" link to `/pricing` when free. Title "Account".

- [ ] **Step 2: Sidebar plan badge.**

Modify `Sidebar.tsx` to accept an optional `plan?: PlanTier` prop and render a small badge + an "Upgrade" link (to `/pricing`) when `plan` is `free`/`basic`. Update `AppShell` to pass the plan: in `AppShell.tsx`, call `getEntitlements()` and pass `plan` to `<Sidebar>`. (`AppShell` is already a server component.)

- [ ] **Step 3: Build + commit.**

Run: `npm run build` → succeeds.
```bash
git add src/app/account src/components/Sidebar.tsx src/components/AppShell.tsx
git commit -m "feat(billing): account page and sidebar plan badge"
```

---

### Task 9: Gate mock exams + free cap UX

**Files:**
- Modify: `src/app/dashboard/page.tsx`, `src/app/practice/page.tsx`, `src/components/ExamRunner.tsx`
- Create: `src/components/UpgradeGate.tsx`

**Interfaces:**
- Consumes: `getEntitlements`, `hasAtLeast`.

- [ ] **Step 1: UpgradeGate component.**

```tsx
import Link from "next/link";
export default function UpgradeGate({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass p-5 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>
      <Link href="/pricing" className="btn-primary mt-3 inline-flex">See plans</Link>
    </div>
  );
}
```

- [ ] **Step 2: Dashboard — lock mock exams for non-Pro.**

In `dashboard/page.tsx`, after fetching templates, call `getEntitlements()`. If `!hasAtLeast(plan, "pro")`, replace the "Next mock exam" card's Start button with `<UpgradeGate title="Mock exams are a Pro feature" body="Upgrade to take full timed PLE mock exams." />`. Also hide the "Recent attempts" table for `free` (saved history requires Basic+); show an upgrade hint instead.

- [ ] **Step 3: ExamRunner — surface the free daily-cap error.**

In `ExamRunner.tsx` `choose()`, the `saveAnswer` call can reject with "Daily free limit reached…". Catch it: set a state `capMessage` and render a `.glass` banner with the message + a `/pricing` link, and stop further answering. (The optimistic selection is already rolled back in the existing catch; add the message there by inspecting `err`.)

- [ ] **Step 4: Build + browser check.**

Run: `npm run build` → succeeds. As a free user: dashboard shows the upgrade gate instead of Start; answering 11 study questions shows the cap banner.

- [ ] **Step 5: Commit.**

```bash
git add src/components/UpgradeGate.tsx src/app/dashboard/page.tsx src/app/practice/page.tsx src/components/ExamRunner.tsx
git commit -m "feat(billing): gate mock exams and free daily cap UX"
```

---

### Task 10: Admin — show plan + grant plan

**Files:**
- Modify: `src/app/admin/students/page.tsx`, `src/app/admin/actions.ts`, `src/app/admin/students/StudentForm.tsx` (or a new small client control)

**Interfaces:**
- Consumes: `admin_set_plan` RPC. Produces: `setStudentPlan(userId, plan)` server action.

- [ ] **Step 1: Server action `setStudentPlan`.**

```ts
// in src/app/admin/actions.ts
export async function setStudentPlan(userId: string, plan: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan", { p_user_id: userId, p_plan: plan, p_interval: "month" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/students");
}
```

- [ ] **Step 2: Students page — show plan + a plan selector per row.**

Extend `list_students` to also return the plan: modify the RPC in a new migration `0006_list_students_plan.sql` to `left join public.subscriptions` and select the effective plan. Then in `students/page.tsx` add a "Plan" column and a small client `<PlanSelect userId plan />` that calls `setStudentPlan` on change (a `<select>` of free/basic/pro/max_pro inside a form using the action).

- [ ] **Step 3: Apply migration + build.**

Apply `0006_list_students_plan.sql` via `apply_migration`. Run `npm run build` → succeeds. In `/admin/students`, change a student's plan; verify it persists and that student gains access.

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/0006_list_students_plan.sql src/app/admin
git commit -m "feat(billing): admin can view and grant student plans"
```

---

### Task 11: Max Pro analytics page

**Files:**
- Create: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `getEntitlements`, `hasAtLeast`, Supabase (`exam_attempts`, `get_attempt_review` or aggregate query).

- [ ] **Step 1: Gate + data.**

Server page in `AppShell` (title "Analytics"): `getEntitlements()`; if `!hasAtLeast(plan, "max_pro")` render `<UpgradeGate title="Analytics is a Max Pro feature" body="Upgrade to Max Pro to track progress over time." />` and return. Otherwise query the user's submitted `exam_attempts` (general_average over time) and aggregate per-subject correctness across their `attempt_questions` (via a new SECURITY DEFINER RPC `my_subject_mastery()` returning `{subject_name, pct}` for the caller).

- [ ] **Step 2: Render.**

`.glass` cards: a simple inline-SVG or CSS-bar line of `general_average` per attempt (date on x), a per-subject mastery bar list (reuse the results-page bar pattern), and a "weakest subjects" highlight (lowest 3 pct). No chart library — use the existing bar markup.

- [ ] **Step 3: Add `my_subject_mastery()` RPC (migration `0007_analytics.sql`), apply, build.**

```sql
create or replace function public.my_subject_mastery()
returns table (subject_name text, pct numeric)
language sql stable security definer set search_path = public as $$
  select s.name,
         round(100.0 * sum(case when aq.is_correct then 1 else 0 end) / nullif(count(*),0), 1)
  from public.attempt_questions aq
  join public.exam_attempts a on a.id = aq.attempt_id
  join public.subjects s on s.id = aq.subject_id
  where a.user_id = auth.uid() and a.status = 'submitted'
  group by s.name order by 2 nulls last;
$$;
```
Run `npm run build` → succeeds. Visit `/analytics` as Max Pro (use `admin_set_plan`) → charts render; as lower tier → gate shows.

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/0007_analytics.sql src/app/analytics
git commit -m "feat(billing): Max Pro analytics dashboard"
```

---

### Task 12: End-to-end verification, deploy, push

**Files:** none (verification + ops)

- [ ] **Step 1: Full local Stripe flow.**

With `stripe listen` running and dev server up, as a free test user: `/pricing` → choose Pro monthly → Checkout with test card `4242 4242 4242 4242`, any future expiry/CVC → redirected to `/account?checkout=success`. Confirm the `subscriptions` row is `pro/active` (SQL), the dashboard now shows Start (mock unlocked), `/analytics` still gated (not Max Pro).

- [ ] **Step 2: Cancel flow.**

`/account` → Manage subscription → cancel in portal → `customer.subscription.deleted` arrives → user drops to free; dashboard re-locks mock exams.

- [ ] **Step 3: Add env to Vercel + deploy.**

```bash
# add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL
printf "%s" "<val>" | vercel env add <NAME> production
vercel deploy --prod --yes
```
Create a **production webhook endpoint** in Stripe (Dashboard → Webhooks) pointing at `https://medprep-teal.vercel.app/api/stripe/webhook`, subscribing to `checkout.session.completed`, `customer.subscription.*`; copy its signing secret into the Vercel `STRIPE_WEBHOOK_SECRET` (production) and redeploy. Set `NEXT_PUBLIC_SITE_URL=https://medprep-teal.vercel.app`.

- [ ] **Step 4: Verify on production + push.**

Subscribe once on the live URL with the test card; confirm webhook updates the row and the UI unlocks.
```bash
git push origin main
```

- [ ] **Step 5: Update memory.**

Add a `monetization.md` memory: tiers, PHP prices, Stripe sandbox acct, that the service-role key is now used by the webhook, and the PH go-live caveat. Update `MEMORY.md` index.

---

## Self-review

- **Spec coverage:** subscriptions table + RLS (T2), entitlements (T2,T4), free 10/day cap (T2,T9), mock gate (T2,T9), Stripe products/prices (T1), Checkout (T6), Portal (T6), webhook + events (T5), env incl. service-role (T3), pricing page + toggle (T7), account/manage (T8), sidebar badge (T8), analytics Max Pro (T11), admin grant plan (T10), going-live ops (T12). PDF reports intentionally deferred (phase 2) per spec. All covered.
- **Placeholders:** price IDs are `price_*` symbols filled in T1 Step 1 (real values recorded then); env secret values are user-supplied by design. No TBDs in logic.
- **Type consistency:** `PlanTier`/`BillingInterval` from `plans.ts` used throughout; `priceToPlan`/`planToPriceId`/`TIER_RANK`/`hasAtLeast` names consistent across tasks; RPC names (`current_entitlements`, `effective_plan`, `plan_rank`, `admin_set_plan`, `my_subject_mastery`) consistent between definition and callers.
