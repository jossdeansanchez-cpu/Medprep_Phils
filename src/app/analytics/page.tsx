import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import UpgradeGate from "@/components/UpgradeGate";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, hasAtLeast } from "@/lib/billing/entitlements";

type MasteryRow = { subject_name: string; answered: number; pct: number };
type AttemptRow = { submitted_at: string; general_average: number | null };

export default async function AnalyticsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { plan } = await getEntitlements();

  if (!hasAtLeast(plan, "max_pro")) {
    return (
      <AppShell profile={profile} greeting="Performance insights" title="Analytics">
        <div className="mx-auto max-w-xl">
          <UpgradeGate
            web={{
              title: "Analytics is a Max Pro feature",
              body: "Upgrade to Max Pro to track your scores over time and spot weak subjects.",
            }}
            ios={{
              title: "Analytics isn't included in your plan",
              body: "Tracking scores over time and weak-subject insights come with the Max Pro plan.",
            }}
          />
        </div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [{ data: attemptsData }, { data: masteryData }] = await Promise.all([
    supabase
      .from("exam_attempts")
      // !inner so the track filter restricts the rows — the score trend should
      // match the mastery table below, which my_subject_mastery scopes the same way.
      .select("submitted_at, general_average, exam_templates!inner(track)")
      .eq("status", "submitted")
      .eq("exam_templates.track", profile.track)
      .order("submitted_at", { ascending: true }),
    supabase.rpc("my_subject_mastery"),
  ]);

  const attempts = (attemptsData ?? []) as AttemptRow[];
  const mastery = (masteryData ?? []) as MasteryRow[];
  const weakest = mastery.slice(0, 3);

  return (
    <AppShell profile={profile} greeting="Performance insights" title="Analytics">
      <div className="space-y-4">
        {/* Score trend */}
        <section className="glass p-5">
          <h2 className="mb-4 font-semibold">Score trend</h2>
          {attempts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Take a mock exam to start tracking your scores.
            </p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {attempts.map((a, i) => {
                const v = a.general_average ?? 0;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-[var(--primary)]"
                      style={{ height: `${Math.max(2, v)}%` }}
                      title={`${v}%`}
                    />
                    <span className="text-[10px] text-[var(--muted)]">{Math.round(v)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Per-subject mastery */}
          <section className="glass p-5 lg:col-span-2">
            <h2 className="mb-3 font-semibold">Subject mastery</h2>
            {mastery.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No graded answers yet.</p>
            ) : (
              <div className="space-y-2.5">
                {mastery.map((m) => {
                  const low = m.pct < 50;
                  return (
                    <div key={m.subject_name}>
                      <div className="flex justify-between text-sm">
                        <span>{m.subject_name}</span>
                        <span className={low ? "font-medium text-[var(--danger)]" : ""}>
                          {m.pct ?? 0}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                        <div
                          className={`h-full rounded-full ${low ? "bg-[var(--danger)]" : "bg-[var(--primary)]"}`}
                          style={{ width: `${m.pct ?? 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Focus areas */}
          <section className="glass p-5">
            <h2 className="mb-3 font-semibold">Focus next on</h2>
            {weakest.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">—</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {weakest.map((m) => (
                  <li key={m.subject_name} className="flex justify-between">
                    <span>{m.subject_name}</span>
                    <span className="text-[var(--muted)]">{m.pct ?? 0}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
