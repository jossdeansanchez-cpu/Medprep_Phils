import { createClient } from "@/lib/supabase/server";
import { TIER_RANK, type PlanTier } from "@/lib/billing/plans";

export function hasAtLeast(plan: PlanTier, min: PlanTier): boolean {
  return TIER_RANK[plan] >= TIER_RANK[min];
}

/** Resolve the current user's effective plan from the subscriptions table. */
export async function getEntitlements(): Promise<{
  plan: PlanTier;
  entitled: boolean;
  currentPeriodEnd: string | null;
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
