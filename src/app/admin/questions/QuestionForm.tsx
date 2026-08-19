"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  createQuestion,
  updateQuestion,
  checkDuplicateQuestions,
  type FormState,
  type DuplicateMatch,
} from "@/app/admin/actions";
import { CATEGORY_ORDER, CATEGORY_LABELS } from "@/lib/categories";
import ImageSlot from "@/app/admin/questions/ImageSlot";
import type { OptionLabel, Question, Subject } from "@/lib/types";

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

/** Signed preview URLs for images already saved on the question being edited. */
export type ImagePreviews = {
  stem?: string | null;
  options?: Partial<Record<OptionLabel, string | null>>;
};

/**
 * Create and edit share this form. `question` absent means create.
 *
 * Images upload on pick (see ImageSlot) and are carried through as object paths
 * in hidden fields, so the submitted FormData stays plain text.
 */
export default function QuestionForm({
  subjects,
  question,
  previews,
}: {
  subjects: Subject[];
  question?: Question;
  previews?: ImagePreviews;
}) {
  const isEdit = !!question;
  const action = isEdit ? updateQuestion.bind(null, question.id) : createQuestion;
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);

  const optionText = (label: OptionLabel) =>
    question?.options.find((o) => o.label === label)?.text ?? "";
  const optionImagePath = (label: OptionLabel) =>
    question?.options.find((o) => o.label === label)?.image_path ?? null;

  const [subjectId, setSubjectId] = useState(question?.subject_id ?? subjects[0]?.id ?? "");
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[]>([]);
  const [checkingDup, startDupCheck] = useTransition();

  function checkStemForDuplicates(stem: string) {
    if (!stem.trim()) {
      setDupMatches([]);
      return;
    }
    startDupCheck(async () => {
      const warnings = await checkDuplicateQuestions([{ rowIndex: 0, subjectId, stem }]);
      // On edit, the question always matches itself — that isn't a duplicate.
      const matches = (warnings[0]?.matches ?? []).filter((m) => m.id !== question?.id);
      setDupMatches(matches);
    });
  }

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
            defaultValue={question?.subject_id}
            onChange={(e) => setSubjectId(e.target.value)}
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
            defaultValue={question?.category ?? "daily_practice"}
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
          defaultValue={question?.stem ?? ""}
          onBlur={(e) => checkStemForDuplicates(e.target.value)}
        />
        <div className="mt-2">
          <ImageSlot
            name="stem_image_path"
            label="Add a figure to the stem"
            initialPath={question?.stem_image_path ?? null}
            initialUrl={previews?.stem ?? null}
          />
        </div>
        {checkingDup && (
          <p className="mt-1 text-xs text-[var(--muted)]">Checking for duplicates…</p>
        )}
        {!checkingDup && dupMatches.length > 0 && (
          <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
            ⚠ {Math.round(dupMatches[0].similarity * 100)}% similar to an existing question:
            “{dupMatches[0].stem.slice(0, 100)}
            {dupMatches[0].stem.length > 100 ? "…" : ""}”
            {dupMatches.length > 1 ? ` (+${dupMatches.length - 1} more match)` : ""}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label className="label">Options</label>
        <p className="-mt-1 mb-1 text-xs text-[var(--muted)]">
          Fill at least 2. Each option needs text, a figure, or both — Perceptual
          Acuity choices are usually a figure alone. Leave D/E empty if unused.
        </p>
        {OPTION_LABELS.map((label) => (
          <div key={label} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-sm font-semibold text-[var(--muted)]">
              {label}
            </span>
            <div className="flex-1 space-y-1">
              <input
                name={`option_${label.toLowerCase()}`}
                className="input"
                defaultValue={optionText(label)}
                placeholder={label === "D" || label === "E" ? "(optional)" : `Option ${label}`}
              />
              <ImageSlot
                name={`option_${label.toLowerCase()}_image_path`}
                label="Add a figure"
                initialPath={optionImagePath(label)}
                initialUrl={previews?.options?.[label] ?? null}
              />
            </div>
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
          defaultValue={question?.correct_label ?? "A"}
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
          defaultValue={question?.explanation ?? ""}
          placeholder="Shown to students after they answer or submit."
        />
      </div>

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state?.message && <p className="text-sm text-[var(--primary)]">{state.message}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create question"}
        </button>
        <Link href="/admin/questions" className="text-sm text-[var(--muted)] hover:underline">
          Back to questions
        </Link>
      </div>
    </form>
  );
}
