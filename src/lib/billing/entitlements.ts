import { createClient } from "@/lib/supabase/server";
import { TIER_RANK, type PlanTier } from "@/lib/billing/plans";

export function hasAtLeast(plan: PlanTier, min: PlanTier): boolean {
  return TIER_RANK[plan] >= TIER_RANK[min];
}

/** Resolve the current user's effective plan from the subscriptions table. */
export async function getEntitlements(): Promise<{
  plan: PlanTier;
  status: string;
  entitled: boolean;
  currentPeriodEnd: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_entitlements");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    plan: (row?.plan ?? "free") as PlanTier,
    status: row?.status ?? "inactive",
    entitled: !!row?.entitled,
    currentPeriodEnd: row?.current_period_end ?? null,
  };
}

export type ExamUsage = {
  plan: PlanTier;
  periodStart: string | null;
  mockUsed: number;
  mockLimit: number | null; // null = unlimited
  otherUsed: number;
  otherLimit: number | null;
  unlimited: boolean; // admin
};

/**
 * How many exams the user has started this billing period, and how many their
 * plan allows. The DB (start_attempt) is the real gate; this drives the UI so
 * students see the limit before they hit it.
 */
export async function getExamUsage(): Promise<ExamUsage> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_exam_usage");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    plan: (row?.plan ?? "free") as PlanTier,
    periodStart: row?.period_start ?? null,
    mockUsed: row?.mock_used ?? 0,
    mockLimit: row?.mock_limit ?? null,
    otherUsed: row?.other_used ?? 0,
    otherLimit: row?.other_limit ?? null,
    unlimited: !!row?.unlimited,
  };
}

/** Remaining exams of a kind, or null when unlimited. */
export function remaining(usage: ExamUsage, isMock: boolean): number | null {
  const limit = isMock ? usage.mockLimit : usage.otherLimit;
  if (limit == null) return null;
  const used = isMock ? usage.mockUsed : usage.otherUsed;
  return Math.max(0, limit - used);
}
