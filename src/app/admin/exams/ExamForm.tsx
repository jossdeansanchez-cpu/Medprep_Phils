import { CATEGORY_ORDER, CATEGORY_LABELS } from "@/lib/categories";
import type { ExamTemplate, Subject } from "@/lib/types";

/**
 * Shared exam template form for create and edit. `action` is a server action
 * taking FormData. `template` (when editing) pre-fills the fields.
 */
export default function ExamForm({
  action,
  subjects,
  template,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  subjects: Subject[];
  template?: ExamTemplate;
  submitLabel: string;
}) {
  const selected = new Set(template?.subject_ids ?? []);

  return (
    <form action={action} className="card space-y-3">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          required
          className="input"
          placeholder="PLE Mock Exam 1"
          defaultValue={template?.title ?? ""}
        />
      </div>

      <div>
        <label className="label" htmlFor="category">Category</label>
        <select
          id="category"
          name="category"
          className="input"
          defaultValue={template?.category ?? "daily_practice"}
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
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
            defaultValue={template?.questions_per_subject ?? 5}
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
            defaultValue={template?.time_limit_minutes ?? ""}
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
            defaultValue={template?.pass_average ?? 75}
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
            defaultValue={template?.min_subject_score ?? 50}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label">Subjects</label>
        <p className="-mt-0.5 mb-2 text-xs text-[var(--muted)]">
          Pick which subjects this exam covers. Leave all unchecked to include every subject.
        </p>
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2 sm:grid-cols-2">
          {subjects.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-black/[0.03]"
            >
              <input
                type="checkbox"
                name="subjects"
                value={s.id}
                defaultChecked={selected.has(s.id)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={template ? template.is_published : true}
        />
        Published
      </label>

      <button type="submit" className="btn-primary w-full">{submitLabel}</button>
      <p className="text-xs text-[var(--muted)]">
        All categories are timed and scored. Leave the time limit blank for an untimed but
        still-scored set. Defaults follow the PLE rule (75% average, no subject below 50%).
        Mock exams require a Pro plan; daily and weekly practice are open to all students.
      </p>
    </form>
  );
}
