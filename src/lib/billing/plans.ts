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

// Test-mode price IDs from the Stripe sandbox (not secret).
const PRICE_IDS: Record<Exclude<PlanTier, "free">, Record<BillingInterval, string>> = {
  basic: {
    month: "price_1TnusJRpyWHwb96OyumbNDIS",
    year: "price_1TnusPRpyWHwb96OtNbfgyy4",
  },
  pro: {
    month: "price_1TnusWRpyWHwb96OO94FewRv",
    year: "price_1TnusaRpyWHwb96OnOouRgmd",
  },
  max_pro: {
    month: "price_1TnusdRpyWHwb96OMXk9DNer",
    year: "price_1TnushRpyWHwb96OolTF6VZv",
  },
};

export interface PlanDef {
  tier: PlanTier;
  name: string;
  blurb: string;
  monthly: number; // pesos
  yearly: number; // pesos
  features: string[];
  highlighted?: boolean;
}

export const PLANS: PlanDef[] = [
  {
    tier: "basic",
    name: "Basic",
    blurb: "Unlimited practice",
    monthly: 149,
    yearly: 1490,
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
    monthly: 349,
    yearly: 3490,
    highlighted: true,
    features: [
      "Everything in Basic",
      "Unlimited timed mock exams",
      "Full results & per-subject review",
      "Attempt history",
    ],
  },
  {
    tier: "max_pro",
    name: "Max Pro",
    blurb: "Track your progress",
    monthly: 599,
    yearly: 5990,
    features: [
      "Everything in Pro",
      "Analytics dashboard",
      "Weak-subject insights",
      "Early access to new question sets",
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
