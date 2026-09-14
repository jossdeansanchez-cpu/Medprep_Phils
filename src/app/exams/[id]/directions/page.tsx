import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startAttempt } from "@/lib/exam";
import { categoryLabel } from "@/lib/categories";
import { nmatDirectionsFor } from "@/lib/nmat-directions";
import ExamDirections from "@/components/ExamDirections";
import type { ExamTemplate, Subject } from "@/lib/types";

/**
 * Directions before an NMAT exam starts.
 *
 * Start used to create the attempt immediately, and the clock runs from that
 * moment — so reading directions inside the exam would cost exam time. Here the
 * attempt isn't created until Begin, so reading is free.
 */
export default async function ExamDirectionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("exam_templates")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) notFound();
  const t = data as ExamTemplate;

  if (t.track !== profile.track && profile.role !== "admin") redirect("/exams");

  // Empty subject_ids means "every subject on the track", same as start_attempt.
  let query = supabase.from("subjects").select("*").eq("track", t.track);
  if (t.subject_ids && t.subject_ids.length > 0) query = query.in("id", t.subject_ids);
  const { data: subjectRows } = await query;
  const parts = nmatDirectionsFor((subjectRows ?? []) as Subject[]);

  const begin = startAttempt.bind(null, t.id);

  return (
    <main className="app-gradient min-h-screen px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/exams" className="text-sm text-[var(--muted)] hover:underline">
          ← Back to exams
        </Link>

        <div className="glass p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--primary)]">
            {categoryLabel(t.category)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {t.total_questions != null
              ? `${t.total_questions} questions`
              : `${t.questions_per_subject} questions per subject`}{" "}
            · {t.time_limit_minutes ? `${t.time_limit_minutes} minutes` : "untimed"}
          </p>
          <p className="mt-3 text-sm">
            {t.time_limit_minutes
              ? "Take your time here. The timer only starts when you press Begin exam."
              : "Read through the directions, then press Begin exam."}
          </p>
        </div>

        <div className="glass p-6">
          {parts ? (
            <ExamDirections parts={parts} />
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Every item is multiple choice. Pick the one best answer.
            </p>
          )}
        </div>

        <form action={begin} className="flex items-center gap-3">
          <button type="submit" className="btn-primary px-6 py-2.5 text-base">
            Begin exam
          </button>
          <Link href="/exams" className="btn-ghost text-sm">
            Not yet
          </Link>
        </form>
      </div>
    </main>
  );
}
