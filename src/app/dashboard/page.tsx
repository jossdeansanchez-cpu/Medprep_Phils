import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, hasAtLeast } from "@/lib/billing/entitlements";
import ExamCard from "@/components/ExamCard";
import UpgradeGate from "@/components/UpgradeGate";
import { categoryLabel, type ExamCategory } from "@/lib/categories";
import type { ExamTemplate } from "@/lib/types";

type AttemptRow = {
  id: string;
  status: string;
  started_at: string;
  general_average: number | null;
  passed: boolean | null;
  exam_templates: { title: string; category: string } | null;
};

export default async function Dashboard() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: publishedTemplates } = await supabase
    .from("exam_templates")
    .select("*")
    .is("deleted_at", null)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const { data: attempts } = await supabase
    .from("exam_attempts")
    .select("id, status, started_at, general_average, passed, exam_templates(title, category)")
    .order("started_at", { ascending: false });

  const { plan } = await getEntitlements();
  const canMock = hasAtLeast(plan, "pro");
  const canHistory = hasAtLeast(plan, "basic");

  const templates = (publishedTemplates ?? []) as ExamTemplate[];
  const history = (attempts ?? []) as unknown as AttemptRow[];
  const newest = templates.slice(0, 3);

  const submitted = history.filter((a) => a.status === "submitted");
  const inProgress = history.filter((a) => a.status !== "submitted").length;
  const passed = submitted.filter((a) => a.passed).length;
  const failed = submitted.filter((a) => !a.passed).length;
  const total = history.length;
  const avgScore =
    submitted.length > 0
      ? Math.round(
          (submitted.reduce((s, a) => s + (a.general_average ?? 0), 0) / submitted.length) * 10
        ) / 10
      : 0;
  const bestScore = submitted.reduce((m, a) => Math.max(m, a.general_average ?? 0), 0);
  const passRate = submitted.length > 0 ? Math.round((100 * passed) / submitted.length) : 0;
  const seg = (n: number) => (total > 0 ? (100 * n) / total : 0);

  return (
    <AppShell
      profile={profile}
      greeting={`Welcome back, ${(profile.full_name || "there").split(" ")[0]} 👋`}
      title="Dashboard"
    >
      {/* Available exams (categorized via card badges, newest first) */}
      <section className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Available exams</h2>
          <Link href="/exams" className="text-sm font-medium text-[var(--primary)]">
            All exams →
          </Link>
        </div>
        {newest.length === 0 ? (
          <div className="glass p-5 text-sm text-[var(--muted)]">
            No exams published yet.
            {profile.role === "admin" && (
              <>
                {" "}
                <Link href="/admin/exams" className="text-[var(--primary)] underline">
                  Create one.
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {newest.map((t) => (
              <ExamCard key={t.id} t={t} canMock={canMock} />
            ))}
          </div>
        )}
      </section>

      {/* Exam statistics */}
      <section className="glass mb-4 p-5">
        <h2 className="mb-4 font-semibold">Exam statistics</h2>
        <div className="bar-grow mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
          <div className="h-full bg-[var(--primary)]" style={{ width: `${seg(passed)}%` }} />
          <div className="h-full bg-amber-400" style={{ width: `${seg(inProgress)}%` }} />
          <div className="h-full bg-[var(--danger)]" style={{ width: `${seg(failed)}%` }} />
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat tiny label="Taken" value={total} />
          <Stat tiny label="Passed" value={passed} />
          <Stat tiny label="Active" value={inProgress} />
          <Stat tiny label="Failed" value={failed} />
        </div>
      </section>

      {/* Row 2: Recent attempts table + stat tiles & promo */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="glass p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent attempts</h2>
          </div>
          {!canHistory ? (
            <UpgradeGate
              title="Saved history is a Basic feature"
              body="Upgrade to keep a record of your attempts and scores."
            />
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">No attempts yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="py-2 font-medium">#</th>
                  <th className="py-2 font-medium">Exam</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 text-right font-medium">Score</th>
                  <th className="py-2 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 6).map((a, i) => (
                  <tr key={a.id} className="border-t border-white/50">
                    <td className="py-2.5 text-[var(--muted)]">{i + 1}</td>
                    <td className="py-2.5 font-medium">
                      {a.exam_templates?.title ?? "Exam"}
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {a.exam_templates?.category
                          ? categoryLabel(a.exam_templates.category as ExamCategory)
                          : ""}
                      </span>
                    </td>
                    <td className="py-2.5 text-[var(--muted)]">
                      {new Date(a.started_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-right font-medium">
                      {a.status === "submitted" && a.general_average != null
                        ? `${a.general_average}%`
                        : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      {a.status === "submitted" ? (
                        <Link
                          href={`/results/${a.id}`}
                          className={`badge ${
                            a.passed
                              ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                              : "bg-[var(--danger)]/10 text-[var(--danger)]"
                          }`}
                        >
                          {a.passed ? "PASS" : "FAIL"}
                        </Link>
                      ) : (
                        <Link href={`/exam/${a.id}`} className="badge bg-amber-100 text-amber-700">
                          Resume
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="grid gap-4">
          <div className="stagger grid grid-cols-2 gap-4">
            <Tile color="violet" label="Pass rate" value={`${passRate}%`} icon="◎" />
            <Tile color="pink" label="Exams taken" value={`${total}`} icon="✎" />
            <Tile color="amber" label="Avg score" value={`${avgScore}`} icon="☆" />
            <Tile color="teal" label="Best score" value={`${bestScore}%`} icon="▲" />
          </div>

          <div className="overflow-hidden rounded-2xl bg-[var(--primary)] p-5 text-white">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              Don&apos;t forget
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug">
              Set up your next mock exam
            </p>
            <Link
              href={profile.role === "admin" ? "/admin/exams" : "/exams"}
              className="mt-3 inline-flex rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-white"
            >
              {profile.role === "admin" ? "Go to exam center" : "Browse exams"}
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tiny }: { label: string; value: number; tiny?: boolean }) {
  return (
    <div>
      <p className={`font-bold ${tiny ? "text-xl" : "text-3xl"}`}>{value}</p>
      <p className="text-xs text-[var(--muted)]">{label}</p>
    </div>
  );
}

const tileColors: Record<string, string> = {
  violet: "bg-violet-200/70 text-violet-700",
  pink: "bg-pink-200/70 text-pink-700",
  amber: "bg-amber-200/70 text-amber-700",
  teal: "bg-teal-200/70 text-teal-700",
};

function Tile({
  color,
  label,
  value,
  icon,
}: {
  color: string;
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="glass p-4">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-full ${tileColors[color]}`}>
        {icon}
      </div>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">{value}</p>
    </div>
  );
}
