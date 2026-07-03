"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateQuestion, type FormState } from "@/app/admin/actions";
import { CATEGORY_ORDER, CATEGORY_LABELS } from "@/lib/categories";
import type { Question, Subject } from "@/lib/types";

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

export default function QuestionForm({
  question,
  subjects,
}: {
  question: Question;
  subjects: Subject[];
}) {
  const action = updateQuestion.bind(null, question.id);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const optionText = (label: (typeof OPTION_LABELS)[number]) =>
    question.options.find((o) => o.label === label)?.text ?? "";

  return (
    <form action={formAction} className="card space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="subject_id">Subject</label>
          <select
            id="subject_id"
            name="subject_id"
            required
            className="input"
            defaultValue={question.subject_id}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="category">Exam type</label>
          <select
            id="category"
            name="category"
            required
            className="input"
            defaultValue={question.category}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="stem">Question stem</label>
        <textarea
          id="stem"
          name="stem"
          required
          rows={3}
          className="input"
          defaultValue={question.stem}
        />
      </div>

      <div className="space-y-2">
        <label className="label">Options</label>
        <p className="-mt-1 mb-1 text-xs text-[var(--muted)]">
          Fill at least 2. Leave D/E blank if unused.
        </p>
        {OPTION_LABELS.map((label) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-sm font-semibold text-[var(--muted)]">
              {label}
            </span>
            <input
              name={`option_${label.toLowerCase()}`}
              className="input"
              defaultValue={optionText(label)}
              placeholder={label === "D" || label === "E" ? "(optional)" : `Option ${label}`}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="correct">Correct answer</label>
        <select
          id="correct"
          name="correct"
          required
          className="input"
          defaultValue={question.correct_label}
        >
          {OPTION_LABELS.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="explanation">Explanation (optional)</label>
        <textarea
          id="explanation"
          name="explanation"
          rows={2}
          className="input"
          defaultValue={question.explanation ?? ""}
          placeholder="Shown to students after they answer or submit."
        />
      </div>

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state?.message && <p className="text-sm text-[var(--primary)]">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/admin/questions" className="text-sm text-[var(--muted)] hover:underline">
          Back to questions
        </Link>
      </div>
    </form>
  );
}
