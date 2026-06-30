import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import Nav from "@/components/Nav";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { OptionLabel, QuestionOption } from "@/lib/types";

type ReviewRow = {
  item_no: number;
  subject_id: string;
  subject_name: string;
  stem: string;
  options: QuestionOption[];
  selected_label: OptionLabel | null;
  correct_label: OptionLabel;
  is_correct: boolean | null;
  explanation: string | null;
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("id, status, general_average, passed, submitted_at, exam_templates(title, pass_average, min_subject_score)")
    .eq("id", id)
    .single();

  if (!attempt) notFound();
  if (attempt.status !== "submitted") redirect(`/exam/${id}`);

  const template = attempt.exam_templates as unknown as {
    title: string;
    pass_average: number;
    min_subject_score: number;
  };

  const { data: review, error } = await supabase.rpc("get_attempt_review", {
    p_attempt_id: id,
  });
  if (error) throw new Error(error.message);
  const rows = (review ?? []) as ReviewRow[];

  // Per-subject aggregation for the breakdown.
  const bySubject = new Map<string, { name: string; correct: number; total: number }>();
  for (const r of rows) {
    const s = bySubject.get(r.subject_id) ?? { name: r.subject_name, correct: 0, total: 0 };
    s.total += 1;
    if (r.is_correct) s.correct += 1;
    bySubject.set(r.subject_id, s);
  }
  const subjects = [...bySubject.values()].map((s) => ({
    ...s,
    pct: s.total ? Math.round((100 * s.correct) / s.total) : 0,
  }));
  const totalCorrect = rows.filter((r) => r.is_correct).length;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <Link href="/dashboard" className="text-sm text-[var(--muted)] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{template.title} — Results</h1>
        </div>

        {/* Score summary */}
        <div className="card flex flex-col items-center gap-2 text-center">
          <div
            className={`badge text-sm ${
              attempt.passed
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "bg-[var(--danger)]/10 text-[var(--danger)]"
            }`}
          >
            {attempt.passed ? "PASSED" : "FAILED"}
          </div>
          <div className="text-5xl font-bold">{attempt.general_average}%</div>
          <p className="text-sm text-[var(--muted)]">
            General average · {totalCorrect}/{rows.length} correct
          </p>
          <p className="text-xs text-[var(--muted)]">
            Passing: average ≥ {template.pass_average}% and no subject below{" "}
            {template.min_subject_score}%
          </p>
        </div>

        {/* Per-subject breakdown */}
        <section className="card">
          <h2 className="mb-3 font-medium">Per-subject scores</h2>
          <div className="space-y-2.5">
            {subjects.map((s) => {
              const below = s.pct < template.min_subject_score;
              return (
                <div key={s.name}>
                  <div className="flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span className={below ? "text-[var(--danger)] font-medium" : ""}>
                      {s.correct}/{s.total} · {s.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div
                      className={`h-full rounded-full ${
                        below ? "bg-[var(--danger)]" : "bg-[var(--primary)]"
                      }`}
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Question review */}
        <section className="space-y-3">
          <h2 className="font-medium">Review</h2>
          {rows.map((r) => (
            <div key={r.item_no} className="card">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Q{r.item_no} · {r.subject_name} ·{" "}
                <span className={r.is_correct ? "text-[var(--primary)]" : "text-[var(--danger)]"}>
                  {r.is_correct ? "Correct" : "Incorrect"}
                </span>
              </p>
              <p className="whitespace-pre-wrap text-sm font-medium">{r.stem}</p>
              <div className="mt-2 space-y-1">
                {r.options.map((opt) => {
                  const isCorrect = opt.label === r.correct_label;
                  const isPicked = opt.label === r.selected_label;
                  return (
                    <div
                      key={opt.label}
                      className={`flex gap-2 rounded-md px-2 py-1 text-sm ${
                        isCorrect
                          ? "bg-[var(--primary)]/10"
                          : isPicked
                            ? "bg-[var(--danger)]/10"
                            : ""
                      }`}
                    >
                      <span className="font-semibold">{opt.label}.</span>
                      <span>{opt.text}</span>
                      {isCorrect && <span className="ml-auto text-xs text-[var(--primary)]">correct</span>}
                      {isPicked && !isCorrect && (
                        <span className="ml-auto text-xs text-[var(--danger)]">your answer</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {r.selected_label == null && (
                <p className="mt-1 text-xs text-[var(--muted)]">Not answered.</p>
              )}
              {r.explanation && (
                <p className="mt-2 rounded-md bg-black/[0.03] p-2 text-sm text-[var(--muted)]">
                  {r.explanation}
                </p>
              )}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
