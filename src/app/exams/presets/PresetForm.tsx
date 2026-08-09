"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS, type ExamCategory } from "@/lib/categories";
import { computeAvailability, type Coverage } from "@/lib/exam-availability";
import {
  PRESET_MIN_QUESTIONS,
  PRESET_MAX_QUESTIONS,
  type PresetFormState,
} from "@/lib/presets";
import type { ExamTemplate, Subject } from "@/lib/types";

/** Students build practice sets only — mock exams stay admin-authored. */
const PRESET_CATEGORIES: ExamCategory[] = ["daily_practice", "weekly_practice"];

/**
 * Create/edit form for a personal exam preset.
 *
 * A trimmed sibling of the admin's ExamForm: same subject grid and same live
 * availability warning, but the sizing mode is always "total" and the pass
 * thresholds, publish flag and per-subject count are all pinned server-side, so
 * the student only ever sees the five fields that are theirs to choose.
 */
export default function PresetForm({
  action,
  subjects,
  coverage,
  preset,
  submitLabel,
  onDone,
}: {
  action: (state: PresetFormState, formData: FormData) => Promise<PresetFormState>;
  subjects: Subject[];
  coverage: Coverage;
  preset?: ExamTemplate;
  submitLabel: string;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [category, setCategory] = useState<ExamCategory>(
    preset?.category ?? "daily_practice"
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(preset?.subject_ids ?? [])
  );
  const [totalQ, setTotalQ] = useState<number>(preset?.total_questions ?? 20);

  // Collapse the inline editor (or clear the create form) once the save lands.
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  function toggleSubject(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // No subjects checked == every subject, matching start_attempt's convention.
  const scopedSubjectIds = useMemo(
    () => (selected.size > 0 ? [...selected] : subjects.map((s) => s.id)),
    [selected, subjects]
  );

  const availability = useMemo(
    () =>
      computeAvailability({
        mode: "total",
        category,
        requested: totalQ,
        qps: 1,
        scopedSubjectIds,
        coverage,
      }),
    [category, totalQ, scopedSubjectIds, coverage]
  );

  const catLabel = CATEGORY_LABELS[category].toLowerCase();
  const isShort = availability.shortfall > 0;
  const perSubject = totalQ / Math.max(1, scopedSubjectIds.length);
  const thinlySpread = scopedSubjectIds.length > 1 && perSubject < 2;

  return (
    <form action={formAction} className="card space-y-3">
      <div>
        <label className="label" htmlFor="title">Name</label>
        <input
          id="title"
          name="title"
          required
          maxLength={80}
          className="input"
          placeholder="Morning 20"
          defaultValue={preset?.title ?? ""}
        />
      </div>

      <div>
        <label className="label" htmlFor="category">Type</label>
        <select
          id="category"
          name="category"
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value as ExamCategory)}
        >
          {PRESET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="total_questions">
          How many questions
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={PRESET_MIN_QUESTIONS}
            max={PRESET_MAX_QUESTIONS}
            value={totalQ}
            onChange={(e) => setTotalQ(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
            aria-label="How many questions"
          />
          <input
            id="total_questions"
            name="total_questions"
            type="number"
            min={PRESET_MIN_QUESTIONS}
            max={PRESET_MAX_QUESTIONS}
            value={totalQ}
            onChange={(e) => setTotalQ(Number(e.target.value))}
            className="input w-20 text-center"
          />
        </div>
      </div>

      {/* Live check against the question pool, using the same helper the admin
          form uses — fed by my_question_coverage() rather than the admin RPC. */}
      {isShort ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ Only <strong>{availability.available}</strong> {catLabel} question
          {availability.available === 1 ? "" : "s"} available in the subjects you
          picked — that&apos;s <strong>{availability.shortfall} short</strong> of{" "}
          {totalQ}. Lower the number, or add more subjects.
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {availability.available} {catLabel} question
          {availability.available === 1 ? "" : "s"} available in the subjects you picked.
          {thinlySpread && (
            <>
              {" "}
              That&apos;s about {perSubject.toFixed(1)} per subject — pick fewer
              subjects if you want more depth in each.
            </>
          )}
        </p>
      )}

      <div>
        <label className="label" htmlFor="time_limit_minutes">Time limit (min)</label>
        <input
          id="time_limit_minutes"
          name="time_limit_minutes"
          type="number"
          min={1}
          max={300}
          placeholder="Leave blank for untimed"
          defaultValue={preset?.time_limit_minutes ?? ""}
          className="input"
        />
      </div>

      <div>
        <label className="label">Subjects</label>
        <p className="-mt-0.5 mb-2 text-xs text-[var(--muted)]">
          Leave all unchecked to draw from every subject.
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
                checked={selected.has(s.id)}
                onChange={(e) => toggleSubject(s.id, e.target.checked)}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-50">
          {pending ? "Saving…" : submitLabel}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="btn-outline whitespace-nowrap"
          >
            Cancel
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Your exam is scored on your overall average, so a short set won&apos;t be
        marked down for a subject that only came up once. It uses one of your
        practice exams, the same as any other daily or weekly set.
      </p>
    </form>
  );
}
