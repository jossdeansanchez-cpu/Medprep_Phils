import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { isIosApp } from "@/lib/platform/server";
import type { PlanTier } from "@/lib/billing/plans";
import { DEFAULT_TRACK } from "@/lib/tracks";
import PricingClient from "./PricingClient";

export const metadata = { title: "Plans & Pricing — MEDprep" };

export default async function PricingPage() {
  // App Store Guideline 3.1.1 — this page cannot exist inside the iOS app.
  // The proxy blocks it too; this is the inner of two layers.
  if (await isIosApp()) notFound();

  const profile = await getCurrentProfile();
  let currentPlan: PlanTier = "free";
  if (profile) currentPlan = (await getEntitlements()).plan;

  // Signed in, the track is settled — a plan only ever applies to the track the
  // student is on, so showing the other one's plans would be an invitation to
  // buy access they can't use. Signed out, let visitors browse either.
  return (
    <PricingClient
      signedIn={!!profile}
      currentPlan={currentPlan}
      track={profile?.track ?? DEFAULT_TRACK}
      lockedToTrack={!!profile}
    />
  );
}
