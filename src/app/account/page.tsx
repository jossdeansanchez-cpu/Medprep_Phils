import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { planLabel } from "@/lib/billing/plans";
import ManageButton from "./ManageButton";

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const ent = await getEntitlements();
  const isPaid = ent.plan !== "free";

  return (
    <AppShell profile={profile} greeting="Your account" title="Account">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="glass p-6">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Current plan</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-2xl font-bold">{planLabel(ent.plan)}</span>
            <span
              className={`badge ${
                ent.entitled
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "bg-black/[0.06] text-[var(--muted)]"
              }`}
            >
              {ent.entitled ? ent.status : "free"}
            </span>
          </div>
          {ent.currentPeriodEnd && isPaid && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Renews / ends on{" "}
              {new Date(ent.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            {isPaid ? (
              <ManageButton />
            ) : (
              <Link href="/pricing" className="btn-primary">
                Upgrade
              </Link>
            )}
            <Link href="/pricing" className="btn-ghost">
              View plans
            </Link>
          </div>
        </section>

        <section className="glass p-6">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Profile</p>
          <p className="mt-1 font-medium">{profile.full_name || "—"}</p>
          <p className="text-sm text-[var(--muted)]">Role: {profile.role}</p>
        </section>
      </div>
    </AppShell>
  );
}
