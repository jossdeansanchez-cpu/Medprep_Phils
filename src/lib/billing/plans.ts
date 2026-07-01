// Single source of truth for subscription plans and Stripe price mapping.

export type PlanTier = "free" | "basic" | "pro" | "max_pro";
export type BillingInterval = "month" | "year";

export const PLAN_TIERS: PlanTier[] = ["free", "basic", "pro", "max_pro"];
export const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  max_pro: 3,
};

// Test-mode price IDs from the Stripe sandbox (not secret). Monthly only.
const PRICE_IDS: Record<Exclude<PlanTier, "free">, Partial<Record<BillingInterval, string>>> = {
  basic: { month: "price_1ToWY6RpyWHwb96O7eNlXy3y" },
  pro: { month: "price_1ToWY7RpyWHwb96OwE8wWxsQ" },
  max_pro: { month: "price_1ToWY7RpyWHwb96Ot8jlN9jG" },
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
    monthly: 350,
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
    monthly: 499,
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
    monthly: 700,
    features: [
      "Everything in Pro",
      "Analytics dashboard",
      "Weak-subject insights",
      "Up to 3 devices",
    ],
  },
];

export function planToPriceId(tier: PlanTier, interval: BillingInterval): string | null {
  if (tier === "free") return null;
  return PRICE_IDS[tier]?.[interval] ?? null;
}

export function priceToPlan(
  priceId: string
): { tier: PlanTier; interval: BillingInterval } | null {
  for (const tier of ["basic", "pro", "max_pro"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (PRICE_IDS[tier][interval] === priceId) return { tier, interval };
    }
  }
  return null;
}

export function planLabel(tier: PlanTier): string {
  return tier === "max_pro" ? "Max Pro" : tier.charAt(0).toUpperCase() + tier.slice(1);
}
