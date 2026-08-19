"use client";

import { useMemo, useState } from "react";
import { CATEGORY_ORDER, CATEGORY_LABELS, type ExamCategory } from "@/lib/categories";
import { TRACK_ORDER, TRACK_LABELS, DEFAULT_TRACK, type ExamTrack } from "@/lib/tracks";
import { computeAvailability, type Coverage } from "@/lib/exam-availability";
import type { ExamTemplate, Subject } from "@/lib/types";

/**
 * Shared exam template form for create and edit. `action` is a server action
 * taking FormData. `template` (when editing) pre-fills the fields. `coverage`
 * is the active-question count per category per subject, used to warn the admin
 * live when the requested question count exceeds the available pool.
 */
export default function ExamForm({
  action,
  subjects,
  coverage,
  template,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  subjects: Subject[];
  coverage: Coverage;
  template?: ExamTemplate;
  submitLabel: string;
}) {
  const [countMode, setCountMode] = useState<"total" | "per_subject">(
    template ? (template.total_questions != null ? "total" : "per_subject") : "total"
  );
  const [category, setCategory] = useState<ExamCategory>(
    template?.category ?? "daily_practice"
  );
  const [track, setTrack] = useState<ExamTrack>(template?.track ?? DEFAULT_TRACK);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(template?.subject_ids ?? [])
  );

  // An exam draws only from its own track's subjects (start_attempt enforces the
  // same), so the picker below shows just those.
  const trackSubjects = useMemo(
    () => subjects.filter((s) => s.track === track),
    [subjects, track]
  );

  function changeTrack(next: ExamTrack) {
    setTrack(next);
    // Any subject ticked from the previous track is meaningless now, and leaving
    // it selected would silently narrow the exam to nothing.
    setSelected(new Set());
  }
  const [totalQ, setTotalQ] = useState<number>(template?.total_questions ?? 20);
  const [perSubjectQ, setPerSubjectQ] = useState<number>(
    template?.questions_per_subject ?? 5
  );

  function toggleSubject(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Scope = checked subjects, or every subject ON THIS TRACK when none checked
  // (matches start_attempt, which filters the pool by the template's track).
  const scopedSubjectIds = useMemo(
    () => (selected.size > 0 ? [...selected] : trackSubjects.map((s) => s.id)),
    [selected, trackSubjects]
  );

  const availability = useMemo(
    () =>
      computeAvailability({
        mode: countMode,
        category,
        requested: totalQ,
        qps: perSubjectQ,
        scopedSubjectIds,
        coverage,
      }),
    [countMode, category, totalQ, perSubjectQ, scopedSubjectIds, coverage]
  );

  const catLabel = CATEGORY_LABELS[category].toLowerCase();
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "subject";
  const isShort =
    countMode === "total"
      ? availability.shortfall > 0
      : availability.shortSubjects.length > 0;

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
        <label className="label" htmlFor="track">Exam track</label>
        <select
          id="track"
          name="track"
          className="input"
          value={track}
          onChange={(e) => changeTrack(e.target.value as ExamTrack)}
        >
          {TRACK_ORDER.map((t) => (
            <option key={t} value={t}>
              {TRACK_LABELS[t]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Only students on this track will see the exam, and it draws only from
          this track&apos;s question bank.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="category">Category</label>
        <select
          id="category"
          name="category"
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value as ExamCategory)}
        >
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {/* How many questions this exam contains */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="count_mode">Number of questions</label>
          <select
            id="count_mode"
            name="count_mode"
            className="input"
            value={countMode}
            onChange={(e) => setCountMode(e.target.value as "total" | "per_subject")}
          >
            <option value="total">Total for the exam</option>
            <option value="per_subject">Per subject</option>
          </select>
        </div>
        {countMode === "total" ? (
          <div>
            <label className="label" htmlFor="total_questions">Total questions</label>
            <input
              id="total_questions"
              name="total_questions"
              type="number"
              min={1}
              value={totalQ}
              onChange={(e) => setTotalQ(Number(e.target.value))}
              className="input"
            />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="questions_per_subject">Questions / subject</label>
            <input
              id="questions_per_subject"
              name="questions_per_subject"
              type="number"
              min={1}
              value={perSubjectQ}
              onChange={(e) => setPerSubjectQ(Number(e.target.value))}
              className="input"
            />
          </div>
        )}
      </div>

      {/* Live availability against the question pool */}
      {isShort ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {countMode === "total" ? (
            <>
              ⚠ Only <strong>{availability.available}</strong> {catLabel} question
              {availability.available === 1 ? "" : "s"} available across the selected
              subjects — you need <strong>{availability.shortfall} more</strong> for a{" "}
              {totalQ}-question exam. Add more in the Question Bank, or lower the total.
            </>
          ) : (
            <>
              ⚠ Some subjects don&apos;t have {perSubjectQ} {catLabel} question
              {perSubjectQ === 1 ? "" : "s"} yet:
              <ul className="mt-1 list-disc pl-5">
                {availability.shortSubjects.map((s) => (
                  <li key={s.subjectId}>
                    {subjectName(s.subjectId)} — has {s.have}, needs {s.need} more
                  </li>
                ))}
              </ul>
              Add more in the Question Bank, or lower the per-subject count.
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {countMode === "total"
            ? `${availability.available} ${catLabel} question${availability.available === 1 ? "" : "s"} available across the selected subjects.`
            : `Every selected subject has at least ${perSubjectQ} ${catLabel} question${perSubjectQ === 1 ? "" : "s"}.`}
        </p>
      )}

      <div>
        <label className="label" htmlFor="time_limit_minutes">Time limit (min)</label>
        <input
          id="time_limit_minutes"
          name="time_limit_minutes"
          type="number"
          min={1}
          placeholder="e.g. 60 — leave blank for untimed"
          defaultValue={template?.time_limit_minutes ?? ""}
          className="input"
        />
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
          Pick which subjects this exam covers. Leave all unchecked to include
          every {TRACK_LABELS[track]} subject.
        </p>
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2 sm:grid-cols-2">
          {trackSubjects.map((s) => (
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
        Choose <strong>Total for the exam</strong> to set one overall question count (drawn
        across the chosen subjects), or <strong>Per subject</strong> to draw a fixed number from
        each subject. All categories are timed and scored; leave the time limit blank for
        untimed. Mock exams require a Pro plan; daily and weekly practice are open to all.
      </p>
    </form>
  );
}
