"use client";

import { useState, useTransition } from "react";
import {
  assignQuestionToTemplate,
  removeQuestionFromTemplate,
  type ExamSlot,
} from "@/app/admin/actions";

export default function ExamAssignment({
  questionId,
  slots: initialSlots,
}: {
  questionId: string;
  slots: ExamSlot[];
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const assigned = slots.filter((s) => s.isAssigned);
  const available = slots.filter((s) => !s.isAssigned);

  function add() {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await assignQuestionToTemplate(questionId, selected);
      setFeedback(res);
      if (!res.error) {
        setSlots((prev) =>
          prev.map((s) =>
            s.templateId === selected ? { ...s, isAssigned: true, assigned: s.assigned + 1 } : s
          )
        );
        setSelected("");
      }
    });
  }

  function remove(templateId: string) {
    setFeedback(null);
    startTransition(async () => {
      await removeQuestionFromTemplate(questionId, templateId);
      setSlots((prev) =>
        prev.map((s) =>
          s.templateId === templateId
            ? { ...s, isAssigned: false, assigned: Math.max(0, s.assigned - 1) }
            : s
        )
      );
    });
  }

  if (slots.length === 0) {
    return (
      <div className="card">
        <h2 className="font-semibold">Include in exam</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          No exams match this question&apos;s type and subject yet. Save the subject/type above
          first, or create a matching exam in Manage exams.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Include in exam</h2>
        <p className="text-xs text-[var(--muted)]">
          Pin this question into a specific exam, up to its per-subject question limit.
        </p>
      </div>

      {assigned.length > 0 && (
        <ul className="space-y-1.5">
          {assigned.map((s) => (
            <li
              key={s.templateId}
              className="flex items-center justify-between rounded-lg bg-[var(--primary)]/10 px-3 py-1.5 text-sm"
            >
              <span>
                {s.title}{" "}
                <span className="text-xs text-[var(--muted)]">
                  ({s.assigned}/{s.cap})
                </span>
              </span>
              <button
                onClick={() => remove(s.templateId)}
                disabled={pending}
                className="text-xs text-[var(--danger)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="input"
          disabled={pending || available.length === 0}
        >
          <option value="">
            {available.length === 0 ? "No more exams available" : "Choose an exam…"}
          </option>
          {available.map((s) => (
            <option key={s.templateId} value={s.templateId} disabled={s.assigned >= s.cap}>
              {s.title} {s.assigned >= s.cap ? `— Full (${s.assigned}/${s.cap})` : `(${s.assigned}/${s.cap})`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={pending || !selected}
          className="btn-primary shrink-0"
        >
          Add
        </button>
      </div>

      {feedback?.error && <p className="text-sm text-[var(--danger)]">{feedback.error}</p>}
      {feedback?.message && <p className="text-sm text-[var(--primary)]">{feedback.message}</p>}
    </div>
  );
}
