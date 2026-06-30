import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import type { PlanTier } from "@/lib/billing/plans";
import PricingClient from "./PricingClient";

export const metadata = { title: "Plans & Pricing — MEDprep" };

export default async function PricingPage() {
  const profile = await getCurrentProfile();
  let currentPlan: PlanTier = "free";
  if (profile) currentPlan = (await getEntitlements()).plan;

  return <PricingClient signedIn={!!profile} currentPlan={currentPlan} />;
}
