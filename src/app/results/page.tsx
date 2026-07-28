import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ResultsHistory, { type AttemptSummary } from "@/components/ResultsHistory";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ExamCategory } from "@/lib/categories";

type Row = {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  general_average: number | null;
  passed: boolean | null;
  exam_templates: { title: string; category: string } | null;
};

export default async function ResultsHistoryPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // Filter by user_id explicitly: RLS also lets admins read every attempt, and
  // this page is "my results" — an admin should see their own, not everyone's.
  const { data } = await supabase
    .from("exam_attempts")
    .select(
      "id, status, started_at, submitted_at, general_average, passed, exam_templates(title, category)"
    )
    .eq("user_id", profile.id)
    .order("started_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];
  const attempts: AttemptSummary[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    generalAverage: r.general_average,
    passed: r.passed,
    // The template is null when the exam was later deleted — the attempt and its
    // review still belong to the student, so fall back rather than hiding it.
    title: r.exam_templates?.title ?? "Exam",
    category: (r.exam_templates?.category as ExamCategory | undefined) ?? null,
  }));

  const submitted = attempts.filter((a) => a.status === "submitted");
  const passed = submitted.filter((a) => a.passed).length;
  const avg =
    submitted.length > 0
      ? Math.round(
          (submitted.reduce((s, a) => s + (a.generalAverage ?? 0), 0) / submitted.length) * 10
        ) / 10
      : 0;

  return (
    <AppShell
      profile={profile}
      greeting="Every exam you've taken, with the answers and rationales"
      title="My results"
    >
      <div className="space-y-4">
        {submitted.length > 0 && (
          <div className="stagger grid grid-cols-3 gap-3">
            <Stat label="Completed" value={`${submitted.length}`} />
            <Stat label="Passed" value={`${passed}`} />
            <Stat label="Average" value={`${avg}%`} />
          </div>
        )}
        <ResultsHistory attempts={attempts} />
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
    </div>
  );
}
