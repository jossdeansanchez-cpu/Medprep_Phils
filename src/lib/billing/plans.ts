// Single source of truth for subscription plans.
// Billed as one-time PayMongo Payment Intents per period (not an
// auto-recurring subscription — see src/lib/billing/paymongo.ts) — the
// peso amount here is all that's needed, no external price/plan IDs.

export type PlanTier = "free" | "basic" | "pro" | "max_pro";
export type BillingInterval = "month" | "year";

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
  monthly: number; // pesos
  features: string[];
  highlighted?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    tier: "basic",
    name: "Basic",
    blurb: "Unlimited practice",
    monthly: 499,
    features: [
      "Unlimited study mode",
      "All 12 PLE subjects",
      "Instant answer explanations",
      "Saved practice history",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    blurb: "Exam ready",
    monthly: 699,
    highlighted: true,
    features: [
      "Everything in Basic",
      "Unlimited timed mock exams",
      "Full results & per-subject review",
      "Up to 2 devices",
    ],
  },
  {
    tier: "max_pro",
    name: "Max Pro",
    blurb: "Track your progress",
    monthly: 799,
    features: [
      "Everything in Pro",
      "Analytics dashboard",
      "Weak-subject insights",
      "Up to 3 devices",
    ],
  },
];

export function planByTier(tier: PlanTier): PlanDef | undefined {
  return PLANS.find((p) => p.tier === tier);
}

export function planLabel(tier: PlanTier): string {
  return tier === "max_pro" ? "Max Pro" : tier.charAt(0).toUpperCase() + tier.slice(1);
}
