import { createClient } from "@/lib/supabase/server";
import {
  createTemplate,
  setTemplatePublished,
  deleteTemplate,
} from "@/app/admin/actions";
import type { ExamTemplate } from "@/lib/types";

export default async function ExamsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_templates")
    .select("*")
    .order("created_at", { ascending: false });
  const templates = (data ?? []) as ExamTemplate[];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      {/* Create form */}
      <div>
        <h1 className="mb-3 text-xl font-semibold">New exam template</h1>
        <form action={createTemplate} className="card space-y-3">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" required className="input" placeholder="PLE Mock Exam 1" />
          </div>

          <div>
            <label className="label" htmlFor="mode">Mode</label>
            <select id="mode" name="mode" className="input" defaultValue="mock">
              <option value="mock">Mock (timed, scored at end)</option>
              <option value="practice">Practice (untimed, instant feedback)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="questions_per_subject">Questions / subject</label>
              <input
                id="questions_per_subject"
                name="questions_per_subject"
                type="number"
                min={1}
                defaultValue={5}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="time_limit_minutes">Time limit (min)</label>
              <input
                id="time_limit_minutes"
                name="time_limit_minutes"
                type="number"
                min={1}
                placeholder="e.g. 60"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pass_average">Pass average (%)</label>
              <input
                id="pass_average"
                name="pass_average"
                type="number"
                min={0}
                max={100}
                defaultValue={75}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="min_subject_score">Min subject (%)</label>
              <input
                id="min_subject_score"
                name="min_subject_score"
                type="number"
                min={0}
                max={100}
                defaultValue={50}
                className="input"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_published" defaultChecked />
            Publish immediately
          </label>

          <button type="submit" className="btn-primary w-full">Create template</button>
          <p className="text-xs text-[var(--muted)]">
            Time limit applies to mock exams only. Defaults follow the PLE rule (≥75% average,
            no subject below 50%).
          </p>
        </form>
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
                      <span className="badge ml-2 bg-black/[0.05]">{t.mode}</span>
                      {t.is_published ? (
                        <span className="badge ml-1 bg-[var(--primary)]/10 text-[var(--primary)]">
                          published
                        </span>
                      ) : (
                        <span className="badge ml-1 bg-black/[0.06]">draft</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {t.questions_per_subject} Q/subject ·{" "}
                      {t.time_limit_minutes ? `${t.time_limit_minutes} min` : "untimed"} · pass{" "}
                      {t.pass_average}% / min {t.min_subject_score}%
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <form action={setTemplatePublished.bind(null, t.id, !t.is_published)}>
                    <button className="btn-outline text-xs" type="submit">
                      {t.is_published ? "Unpublish" : "Publish"}
                    </button>
                  </form>
                  <form action={deleteTemplate.bind(null, t.id)}>
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
    </div>
  );
}
