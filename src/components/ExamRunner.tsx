"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveAnswer, submitAttempt } from "@/lib/exam";
import type { ExamMode, OptionLabel, QuestionOption } from "@/lib/types";

type RunnerQuestion = {
  attempt_question_id: string;
  subject_name: string;
  item_no: number;
  stem: string;
  options: QuestionOption[];
  selected_label: OptionLabel | null;
};

type Reveal = {
  is_correct: boolean;
  correct_label: OptionLabel;
  explanation: string | null;
};

function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function ExamRunner({
  attemptId,
  title,
  mode,
  deadlineMs,
  questions,
}: {
  attemptId: string;
  title: string;
  mode: ExamMode;
  deadlineMs: number | null;
  questions: RunnerQuestion[];
}) {
  const isPractice = mode === "practice";
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionLabel>>(() =>
    Object.fromEntries(
      questions.filter((q) => q.selected_label).map((q) => [q.attempt_question_id, q.selected_label!])
    )
  );
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [remaining, setRemaining] = useState<number | null>(
    deadlineMs ? deadlineMs - Date.now() : null
  );
  const [isSubmitting, startSubmit] = useTransition();
  const submittedRef = useRef(false);

  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  const doSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    startSubmit(() => {
      submitAttempt(attemptId);
    });
  }, [attemptId]);

  // Countdown for timed mock exams; auto-submits at zero.
  useEffect(() => {
    if (deadlineMs == null) return;
    const tick = () => {
      const left = deadlineMs - Date.now();
      setRemaining(left);
      if (left <= 0) doSubmit();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineMs, doSubmit]);

  async function choose(label: OptionLabel) {
    if (!q) return;
    if (isPractice && reveals[q.attempt_question_id]) return; // locked after reveal
    setAnswers((a) => ({ ...a, [q.attempt_question_id]: label }));
    try {
      const res = await saveAnswer(q.attempt_question_id, label);
      if (res.revealed) {
        setReveals((r) => ({
          ...r,
          [q.attempt_question_id]: {
            is_correct: !!res.is_correct,
            correct_label: res.correct_label as OptionLabel,
            explanation: res.explanation ?? null,
          },
        }));
      }
    } catch {
      // Roll back the optimistic selection on failure.
      setAnswers((a) => {
        const next = { ...a };
        delete next[q.attempt_question_id];
        return next;
      });
    }
  }

  const reveal = q ? reveals[q.attempt_question_id] : undefined;
  const selected = q ? answers[q.attempt_question_id] : undefined;
  const lowTime = remaining != null && remaining < 60_000;

  const palette = useMemo(
    () =>
      questions.map((qq, i) => ({
        i,
        answered: !!answers[qq.attempt_question_id],
        correct: reveals[qq.attempt_question_id]?.is_correct,
      })),
    [questions, answers, reveals]
  );

  if (!q) {
    return <main className="mx-auto max-w-2xl px-4 py-10">This exam has no questions.</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">{title}</h1>
          <p className="text-xs text-[var(--muted)]">
            {isPractice ? "Study mode" : "Mock exam"} · {answeredCount}/{questions.length} answered
          </p>
        </div>
        {remaining != null && (
          <div
            className={`rounded-lg px-3 py-1.5 font-mono text-sm font-medium ${
              lowTime
                ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                : "bg-black/[0.04]"
            }`}
          >
            {formatTime(remaining)}
          </div>
        )}
      </div>

      {/* Question palette */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {palette.map((p) => (
          <button
            key={p.i}
            onClick={() => setIndex(p.i)}
            className={`h-7 w-7 rounded text-xs font-medium transition-colors ${
              p.i === index
                ? "ring-2 ring-[var(--primary)] ring-offset-1"
                : ""
            } ${
              p.correct === true
                ? "bg-[var(--primary)] text-white"
                : p.correct === false
                  ? "bg-[var(--danger)] text-white"
                  : p.answered
                    ? "bg-[var(--primary)]/20 text-[var(--foreground)]"
                    : "bg-black/[0.05] text-[var(--muted)]"
            }`}
          >
            {p.i + 1}
          </button>
        ))}
      </div>

      {/* Question card */}
      <div className="card">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Q{index + 1} · {q.subject_name}
        </p>
        <p className="whitespace-pre-wrap text-[15px] font-medium">{q.stem}</p>

        <div className="mt-4 space-y-2">
          {q.options.map((opt) => {
            const isSelected = selected === opt.label;
            const isCorrect = reveal && reveal.correct_label === opt.label;
            const isWrongPick = reveal && isSelected && !reveal.is_correct;
            return (
              <button
                key={opt.label}
                onClick={() => choose(opt.label)}
                disabled={!!reveal}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${
                  isCorrect
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : isWrongPick
                      ? "border-[var(--danger)] bg-[var(--danger)]/10"
                      : isSelected
                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-[var(--border)] hover:bg-black/[0.02]"
                }`}
              >
                <span className="font-semibold">{opt.label}.</span>
                <span>{opt.text}</span>
              </button>
            );
          })}
        </div>

        {reveal && (
          <div className="mt-4 rounded-lg bg-black/[0.03] p-3 text-sm">
            <p className="font-medium">
              {reveal.is_correct ? (
                <span className="text-[var(--primary)]">Correct</span>
              ) : (
                <span className="text-[var(--danger)]">
                  Incorrect — answer is {reveal.correct_label}
                </span>
              )}
            </p>
            {reveal.explanation && (
              <p className="mt-1 text-[var(--muted)]">{reveal.explanation}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="mt-4 flex items-center justify-between">
        <button
          className="btn-outline"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Previous
        </button>

        {index < questions.length - 1 ? (
          <button className="btn-primary" onClick={() => setIndex((i) => i + 1)}>
            Next →
          </button>
        ) : (
          <button className="btn-primary" onClick={doSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Submitting…" : isPractice ? "Finish & see results" : "Submit exam"}
          </button>
        )}
      </div>

      {!isPractice && index === questions.length - 1 && (
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          You can review answers using the grid above before submitting.
        </p>
      )}
    </main>
  );
}
