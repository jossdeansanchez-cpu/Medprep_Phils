import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { planLabel } from "@/lib/billing/plans";
import { listMyDevices, deviceLabel, DEVICE_LIMITS } from "@/lib/devices";
import { removeDevice } from "./actions";
import ManageButton from "./ManageButton";

export default async function AccountPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const ent = await getEntitlements();
  const isPaid = ent.plan !== "free";
  const devices = await listMyDevices();
  const maxDevices = profile.role === "admin" ? null : DEVICE_LIMITS[ent.plan];

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
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Devices</p>
            <span className="text-xs text-[var(--muted)]">
              {devices.length}
              {maxDevices ? ` / ${maxDevices}` : ""} used
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {maxDevices
              ? `Your ${planLabel(ent.plan)} plan allows ${maxDevices} device${maxDevices === 1 ? "" : "s"}. Remove one to sign in somewhere new.`
              : "Admins are not device-limited."}
          </p>

          {devices.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">No devices recorded yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {devices.map((d, i) => {
                const over = maxDevices != null && i >= maxDevices;
                return (
                  <div key={d.device_id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {deviceLabel(d.user_agent)}
                        {over && (
                          <span className="badge ml-2 bg-amber-100 text-amber-700">over limit</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        Last used {new Date(d.last_seen).toLocaleString()}
                      </p>
                    </div>
                    <form action={removeDevice.bind(null, d.device_id)}>
                      <button className="btn-ghost text-xs text-[var(--danger)]" type="submit">
                        Remove
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
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
