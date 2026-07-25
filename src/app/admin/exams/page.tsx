import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createTemplate, setTemplatePublished } from "@/app/admin/actions";
import ExamForm from "./ExamForm";
import DeleteExam from "./DeleteExam";
import type { ExamTemplate, Subject } from "@/lib/types";
import { categoryLabel } from "@/lib/categories";
import { buildCoverage, type CoverageRow } from "@/lib/exam-availability";

export default async function ExamsPage() {
  const supabase = await createClient();
  const [{ data }, { data: subjectsData }, { data: coverageRows }] = await Promise.all([
    supabase
      .from("exam_templates")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("subjects").select("*").order("order"),
    supabase.rpc("admin_question_coverage"),
  ]);
  const templates = (data ?? []) as ExamTemplate[];
  const subjects = (subjectsData ?? []) as Subject[];
  const coverage = buildCoverage((coverageRows ?? []) as CoverageRow[]);
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "subject";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* Create form */}
      <div>
        <h1 className="mb-3 text-xl font-semibold">New exam template</h1>
        <ExamForm
          action={createTemplate}
          subjects={subjects}
          coverage={coverage}
          submitLabel="Create exam"
        />
      </div>

      {/* List */}
      <div>
        <h2 className="mb-3 text-xl font-semibold">Existing templates</h2>
        {templates.length === 0 ? (
          <div className="card text-sm text-[var(--muted)]">None yet.</div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div key={t.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {t.title}
                      <span className="badge ml-2 bg-[var(--primary)]/10 text-[var(--primary)]">
                        {categoryLabel(t.category)}
                      </span>
                      {t.is_published ? (
                        <span className="badge ml-1 bg-[var(--primary)]/10 text-[var(--primary)]">
                          published
                        </span>
                      ) : (
                        <span className="badge ml-1 bg-black/[0.06]">draft</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {t.total_questions != null
                        ? `${t.total_questions} Q total`
                        : `${t.questions_per_subject} Q/subject`}{" "}
                      · {t.time_limit_minutes ? `${t.time_limit_minutes} min` : "untimed"} · pass{" "}
                      {t.pass_average}% / min {t.min_subject_score}%
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {!t.subject_ids || t.subject_ids.length === 0
                        ? "All subjects"
                        : t.subject_ids.length <= 3
                          ? t.subject_ids.map(subjectName).join(", ")
                          : `${t.subject_ids.length} subjects`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link href={`/admin/exams/${t.id}/edit`} className="btn-outline text-xs">
                    Edit
                  </Link>
                  <form action={setTemplatePublished.bind(null, t.id, !t.is_published)}>
                    <button className="btn-outline text-xs" type="submit">
                      {t.is_published ? "Unpublish" : "Publish"}
                    </button>
                  </form>
                  <DeleteExam id={t.id} title={t.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
