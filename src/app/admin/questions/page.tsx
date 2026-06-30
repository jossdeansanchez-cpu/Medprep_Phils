import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { setQuestionActive, deleteQuestion } from "@/app/admin/actions";
import type { QuestionOption, Subject } from "@/lib/types";

type QRow = {
  id: string;
  stem: string;
  options: QuestionOption[];
  correct_label: string;
  is_active: boolean;
  subjects: { name: string } | null;
};

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  const supabase = await createClient();

  const { data: subjectsData } = await supabase.from("subjects").select("*").order("order");
  const subjects = (subjectsData ?? []) as Subject[];
  const activeSubject = subjects.find((s) => s.slug === subject);

  let query = supabase
    .from("questions")
    .select("id, stem, options, correct_label, is_active, subjects(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (activeSubject) query = query.eq("subject_id", activeSubject.id);

  const { data } = await query;
  const questions = (data ?? []) as unknown as QRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Questions</h1>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/questions"
          className={`badge ${!activeSubject ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"}`}
        >
          All
        </Link>
        {subjects.map((s) => (
          <Link
            key={s.id}
            href={`/admin/questions?subject=${s.slug}`}
            className={`badge ${
              activeSubject?.id === s.id ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      {questions.length === 0 ? (
        <div className="card text-sm text-[var(--muted)]">
          No questions yet.{" "}
          <Link href="/admin/upload" className="text-[var(--primary)] underline">
            Upload some.
          </Link>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border)] p-0">
          {questions.map((q) => (
            <div key={q.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--muted)]">
                  {q.subjects?.name} · answer {q.correct_label}
                  {!q.is_active && (
                    <span className="badge ml-2 bg-black/[0.06]">inactive</span>
                  )}
                </p>
                <p className="truncate text-sm font-medium">{q.stem}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <form action={setQuestionActive.bind(null, q.id, !q.is_active)}>
                  <button className="btn-ghost text-xs" type="submit">
                    {q.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteQuestion.bind(null, q.id)}>
                  <button className="btn-ghost text-xs text-[var(--danger)]" type="submit">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
