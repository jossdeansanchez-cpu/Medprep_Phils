import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isIosApp } from "@/lib/platform/server";
import { plansForTrack, PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";
import { trackLabel } from "@/lib/tracks";
import CheckoutForm from "./CheckoutForm";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  // App Store Guideline 3.1.1 — no purchase flow inside the iOS app.
  if (await isIosApp()) notFound();

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?redirect=/pricing");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { plan } = await searchParams;
  const isValidPlan = (p: string | undefined): p is PlanTier =>
    !!p && (PLAN_TIERS as string[]).includes(p) && p !== "free";
  if (!isValidPlan(plan)) redirect("/pricing");

  // The track comes from the profile, matching what create-intent will stamp on
  // the payment — so the buyer sees exactly what they're about to unlock.
  const planDef = plansForTrack(profile.track).find((p) => p.tier === plan)!;
  const testMode = (process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY ?? "").startsWith("pk_test_");

  return (
    <main className="app-gradient min-h-screen px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="glass p-6">
          <p className="text-sm font-medium text-[var(--primary)]">
            {trackLabel(profile.track)} {planDef.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            ₱{planDef.price.toLocaleString()}
            <span className="text-base font-normal text-[var(--muted)]">/year</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            A full year of {trackLabel(profile.track)} access. No auto-charge — you
            renew once a year.
          </p>

          {testMode && (
            <div className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800">
              <strong>Test mode.</strong> This is a sandbox — no real money moves. GCash/QR Ph show
              a PayMongo test screen where you tap “Authorize”. Card test number:{" "}
              <span className="font-mono">4343 4343 4343 4345</span>, any future expiry, CVC 123.
            </div>
          )}

          <CheckoutForm plan={plan} email={user?.email ?? ""} name={profile.full_name ?? ""} />
        </div>
      </div>
    </main>
  );
}
