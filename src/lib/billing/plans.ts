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

import {
  type ExamTrack,
  DEFAULT_TRACK,
  TRACK_LABELS,
  TRACK_SUBJECT_COUNT,
} from "@/lib/tracks";

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

/**
 * Placeholder swapped per track by plansForTrack(). The tiers, prices and
 * quotas are identical on every track — only the subject-count line differs —
 * so PLANS stays a single array rather than one copy per track.
 */
const SUBJECTS_FEATURE = "__SUBJECTS__";

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
      SUBJECTS_FEATURE,
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

/**
 * The plans as shown to a student on a given track. Same tiers, same prices —
 * only the subject line is track-specific. Use this anywhere plans are rendered
 * or priced; PLANS itself is the untemplated source.
 */
export function plansForTrack(track: ExamTrack = DEFAULT_TRACK): PlanDef[] {
  const subjects = `All ${TRACK_SUBJECT_COUNT[track]} ${TRACK_LABELS[track]} subjects`;
  return PLANS.map((p) => ({
    ...p,
    features: p.features.map((f) => (f === SUBJECTS_FEATURE ? subjects : f)),
  }));
}

export function planByTier(tier: PlanTier, track: ExamTrack = DEFAULT_TRACK): PlanDef | undefined {
  return plansForTrack(track).find((p) => p.tier === tier);
}

export function planLabel(tier: PlanTier): string {
  return tier === "max_pro" ? "Max Pro" : tier.charAt(0).toUpperCase() + tier.slice(1);
}
