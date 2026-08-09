// Single source of truth for subscription plans.
// Billed as one-time PayMongo Payment Intents per period (not an
// auto-recurring subscription — see src/lib/billing/paymongo.ts) — the
// peso amount here is all that's needed, no external price/plan IDs.
//
// Plans are billed ANNUALLY: one payment covers a student's whole PLE review
// season. Exam allowances still reset MONTHLY — see the "per month" feature
// copy below and public.entitlement_period_start() in the database. Billing
// period and quota window are deliberately separate concerns; deriving one
// from the other is what broke when this moved off monthly billing.

export type PlanTier = "free" | "basic" | "pro" | "max_pro";
export type BillingInterval = "month" | "year";

/** How much access one payment buys. Drives the DB period end and price copy. */
export const BILLING_INTERVAL: BillingInterval = "year";
export const BILLING_PERIOD_DAYS = 365;

export const PLAN_TIERS: PlanTier[] = ["free", "basic", "pro", "max_pro"];
export const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  max_pro: 3,
};

export interface PlanDef {
  tier: PlanTier;
  name: string;
  blurb: string;
  /** Pesos for one full billing period — i.e. per year. */
  price: number;
  features: string[];
  highlighted?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    tier: "basic",
    name: "Basic",
    blurb: "Unlimited practice",
    price: 499,
    features: [
      "Unlimited daily & weekly exams",
      "2 mock exams per month",
      "Resources: books, PDFs & review materials",
      "All 12 PLE subjects",
      "Instant answer explanations",
      "Saved practice history",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    blurb: "Exam ready",
    price: 699,
    highlighted: true,
    features: [
      "Everything in Basic",
      "Quiz Maker — build your own custom-length exams",
      "10 mock exams per month",
      "Full results & per-subject review",
      "Up to 2 devices",
    ],
  },
  {
    tier: "max_pro",
    name: "Max Pro",
    blurb: "Everything, unlimited",
    price: 799,
    features: [
      "Everything in Pro",
      "Unlimited mock exams",
      "Analytics dashboard",
      "Weak-subject insights",
      "Up to 3 devices",
    ],
  },
];

/**
 * Exams allowed per billing period. `null` = unlimited.
 * Mirrors public.plan_exam_limit() in the database, which is the real
 * enforcement point — this copy only drives the UI.
 */
export const EXAM_LIMITS: Record<PlanTier, { mock: number | null; practice: number | null }> = {
  free: { mock: 0, practice: 1 },
  basic: { mock: 2, practice: null },
  pro: { mock: 10, practice: null },
  max_pro: { mock: null, practice: null },
};

export function planByTier(tier: PlanTier): PlanDef | undefined {
  return PLANS.find((p) => p.tier === tier);
}

export function planLabel(tier: PlanTier): string {
  return tier === "max_pro" ? "Max Pro" : tier.charAt(0).toUpperCase() + tier.slice(1);
}
