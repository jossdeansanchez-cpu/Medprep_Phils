import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PLANS, PLAN_TIERS, type PlanTier } from "@/lib/billing/plans";
import CheckoutForm from "./CheckoutForm";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
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

  const planDef = PLANS.find((p) => p.tier === plan)!;

  return (
    <main className="app-gradient min-h-screen px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="glass p-6">
          <p className="text-sm font-medium text-[var(--primary)]">{planDef.name}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            ₱{planDef.monthly.toLocaleString()}
            <span className="text-base font-normal text-[var(--muted)]">/mo</span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Billed monthly via card or Maya. Cancel anytime from your account.
          </p>

          <CheckoutForm plan={plan} email={user?.email ?? ""} name={profile.full_name ?? ""} />
        </div>
      </div>
    </main>
  );
}
