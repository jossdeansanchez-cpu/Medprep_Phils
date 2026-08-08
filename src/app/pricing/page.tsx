import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { isIosApp } from "@/lib/platform/server";
import type { PlanTier } from "@/lib/billing/plans";
import PricingClient from "./PricingClient";

export const metadata = { title: "Plans & Pricing — MEDprep" };

export default async function PricingPage() {
  // App Store Guideline 3.1.1 — this page cannot exist inside the iOS app.
  // The proxy blocks it too; this is the inner of two layers.
  if (await isIosApp()) notFound();

  const profile = await getCurrentProfile();
  let currentPlan: PlanTier = "free";
  if (profile) currentPlan = (await getEntitlements()).plan;

  return <PricingClient signedIn={!!profile} currentPlan={currentPlan} />;
}
