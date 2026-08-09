"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAnswer, submitAttempt, revealAnswer } from "@/lib/exam";
import ExpiredAttempt from "@/components/ExpiredAttempt";
import { categoryLabel, type ExamCategory } from "@/lib/categories";
import type { ExamMode, OptionLabel, QuestionOption } from "@/lib/types";

type RunnerQuestion = {
  attempt_question_id: string;
  subject_name: string;
  item_no: number;
  stem: string;
  options: QuestionOption[];
  selected_label: OptionLabel | null;
  /** Already revealed in an earlier sitting — stays locked across a resume. */
  revealed: boolean;
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
  category,
  deadlineMs,
  questions,
  isIosApp = false,
}: {
  attemptId: string;
  title: string;
  mode: ExamMode;
  category: ExamCategory;
  deadlineMs: number | null;
  questions: RunnerQuestion[];
  isIosApp?: boolean;
}) {
  const isPractice = mode === "practice";
  // "Show answer" is for study, not simulation — a mock exam behaves like the
  // real PLE and gives nothing away until it's submitted. Keyed off category
  // rather than `mode`, which is 'mock' on every template ever created.
  // reveal_answer enforces the same rule server-side; this only hides the UI.
  const canReveal = category !== "mock_exam";
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, OptionLabel>>(() =>
    Object.fromEntries(
      questions.filter((q) => q.selected_label).map((q) => [q.attempt_question_id, q.selected_label!])
    )
  );
  // Two pieces of state, because they can disagree after a resume: `locked`
  // is every item whose answer is frozen because it was revealed at some
  // point, while `reveals` only holds rationale actually fetched this session.
  // A resumed exam starts locked-but-unloaded, and tapping Show answer refills
  // it (reveal_answer is idempotent).
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [locked, setLocked] = useState<Set<string>>(
    () => new Set(questions.filter((q) => q.revealed).map((q) => q.attempt_question_id))
  );
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  // Both keyed by attempt_question_id rather than being plain booleans, so
  // paging to another question clears them without an effect to tidy up.
  const [confirmRevealFor, setConfirmRevealFor] = useState<string | null>(null);
  const [answerFirstFor, setAnswerFirstFor] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(
    deadlineMs ? deadlineMs - Date.now() : null
  );
  const [isSubmitting, startSubmit] = useTransition();
  const [capMessage, setCapMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submittedRef = useRef(false);
  const paletteToggleRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const q = questions[index];
  const answeredCount = Object.keys(answers).length;

  const doSubmit = useCallback(() => {
    if (submittedRef.current) return;
    // Guard against double-taps while a submit is in flight, but release it if
    // the submit fails — otherwise a dropped mobile connection would leave the
    // student permanently unable to retry (their answers are already saved).
    submittedRef.current = true;
    setSubmitError(null);
    startSubmit(async () => {
      try {
        const res = await submitAttempt(attemptId);
        // A successful submit redirects, so reaching here means it failed.
        if (res?.error) {
          submittedRef.current = false;
          setSubmitError(res.error);
        }
      } catch (err) {
        // redirect() signals via a thrown NEXT_REDIRECT — never treat it as a
        // failure or we'd block the navigation to the results page.
        const digest = (err as { digest?: string })?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        submittedRef.current = false;
        setSubmitError(
          "We couldn't submit your exam — this is usually a connection problem. Your answers are saved. Please check your internet and try again."
        );
      }
    });
  }, [attemptId]);

  // Countdown for timed mock exams; auto-submits at zero — but only if there is
  // something to grade. An exam that expired with no answers at all is offered
  // as a free restart instead, matching what /exam/[id] does server-side.
  useEffect(() => {
    if (deadlineMs == null) return;
    const tick = () => {
      const left = deadlineMs - Date.now();
      setRemaining(left);
      if (left <= 0 && answeredCount > 0) doSubmit();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineMs, doSubmit, answeredCount]);

  function rollback(id: string) {
    setAnswers((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
  }

  async function choose(label: OptionLabel) {
    if (!q) return;
    if (capMessage) return; // free daily cap hit — stop answering
    if (locked.has(q.attempt_question_id)) return; // answer frozen by a reveal
    const id = q.attempt_question_id;
    const previous = answers[id];
    setAnswerFirstFor(null); // they've just answered, so the nudge is stale
    setAnswers((a) => ({ ...a, [id]: label }));
    try {
      const res = await saveAnswer(id, label);
      if (res.error) {
        // Restore the prior choice rather than clearing it — changing an answer
        // that the server rejects shouldn't lose the one already recorded.
        if (previous) setAnswers((a) => ({ ...a, [id]: previous }));
        else rollback(id);
        setCapMessage(res.error);
      }
    } catch {
      if (previous) setAnswers((a) => ({ ...a, [id]: previous }));
      else rollback(id);
    }
  }

  /**
   * First tap of Show answer. Nudges them to answer if they haven't, otherwise
   * asks for confirmation — revealing is irreversible, so it shouldn't be one
   * stray tap away, especially on a phone.
   */
  function requestReveal() {
    if (!q) return;
    setRevealError(null);
    if (!answers[q.attempt_question_id]) {
      setAnswerFirstFor(q.attempt_question_id);
      return;
    }
    setAnswerFirstFor(null);
    setConfirmRevealFor(q.attempt_question_id);
  }

  /** Confirmed: fetch the correct option and rationale, and freeze the item. */
  async function showAnswer() {
    if (!q || revealing) return;
    const id = q.attempt_question_id;
    setRevealing(true);
    setRevealError(null);
    try {
      const res = await revealAnswer(id);
      if ("error" in res && res.error) {
        setRevealError(res.error);
        return;
      }
      const r = res as Reveal;
      setReveals((prev) => ({ ...prev, [id]: r }));
      setLocked((prev) => new Set(prev).add(id));
      setConfirmRevealFor(null);
    } catch {
      setRevealError("Couldn't load the answer — check your connection and try again.");
    } finally {
      setRevealing(false);
    }
  }

  const reveal = q ? reveals[q.attempt_question_id] : undefined;
  const isLocked = q ? locked.has(q.attempt_question_id) : false;
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

  // Question numbers (1-based) the student hasn't answered yet.
  const unanswered = useMemo(
    () => palette.filter((p) => !p.answered).map((p) => p.i + 1),
    [palette]
  );
  const allAnswered = unanswered.length === 0;

  /** Jump to the first unanswered question, closing the palette. */
  const goToFirstUnanswered = useCallback(() => {
    const first = palette.find((p) => !p.answered);
    if (!first) return;
    setIndex(first.i);
    setPaletteOpen(false);
    setConfirmSubmit(false);
  }, [palette]);

  /** Mock exams: warn before submitting with blanks. Practice can just finish. */
  const requestSubmit = useCallback(() => {
    if (!isPractice && unanswered.length > 0) {
      setConfirmSubmit(true);
      return;
    }
    doSubmit();
  }, [isPractice, unanswered.length, doSubmit]);

  if (!q) {
    return (
      <main className="app-gradient min-h-screen px-4 py-10">
        <p className="mx-auto max-w-2xl">This exam has no questions.</p>
      </main>
    );
  }

  // Timer ran out (typically while the student was away — the clock is
  // wall-clock and doesn't pause). The countdown effect auto-submits; explain
  // that instead of silently bouncing them to the results page.
  if (deadlineMs != null && remaining != null && remaining <= 0) {
    // Ran out without a single answer — nothing to grade, so offer the restart
    // rather than recording a 0% for an exam they never really sat.
    if (answeredCount === 0) {
      return <ExpiredAttempt attemptId={attemptId} title={title} />;
    }
    return (
      <main className="app-gradient grid min-h-[100dvh] place-items-center px-4">
        <div className="glass max-w-sm p-6 text-center">
          <p className="font-semibold">Time&apos;s up</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {submitError
              ? "The clock ran out, but we couldn't submit your answers."
              : "The clock ran out. Submitting your answers…"}
          </p>
          {submitError && (
            <button onClick={doSubmit} disabled={isSubmitting} className="btn-primary mt-3">
              {isSubmitting ? "Submitting…" : "Try again"}
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="app-gradient min-h-screen px-4 py-6">
      <div className="mx-auto max-w-3xl">
      {/* Header: exit · title · timer */}
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setConfirmExit((v) => !v)}
          aria-label="Save and exit exam"
          aria-expanded={confirmExit}
          className="btn-ghost -ml-2 h-11 min-w-11 shrink-0 px-2 text-sm"
        >
          <span aria-hidden="true">←</span>
          <span className="hidden sm:inline">Exit</span>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold leading-tight">{title}</h1>
          <p className="text-xs text-[var(--muted)]">
            {/* Was mode-driven, which labelled every exam "Mock exam" — `mode`
                is 'mock' on all of them. Category is what students recognise. */}
            {categoryLabel(category)} · {answeredCount}/{questions.length} answered
          </p>
        </div>

        {remaining != null && (
          <div
            // Don't let a screen reader announce every tick; the label carries
            // a coarse, human-friendly reading instead.
            aria-live="off"
            aria-label={`Time remaining: ${Math.max(0, Math.ceil(remaining / 60000))} minutes`}
            className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-sm font-medium tabular-nums ${
              lowTime ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-black/[0.04]"
            }`}
          >
            {formatTime(remaining)}
          </div>
        )}
      </div>

      {/* Exit confirmation — answers are already saved on every tap, so leaving
          is just navigation. Timed exams keep counting down while away. */}
      {confirmExit && (
        <div className="glass pop-in mb-4 p-4">
          <p className="text-sm font-medium">Leave this exam?</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {deadlineMs != null
              ? "Your answers are saved and you can resume from the dashboard — but the timer keeps running while you're away."
              : "Your answers are saved. You can resume anytime from the dashboard."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="btn-primary text-sm"
            >
              Save &amp; exit
            </button>
            <button
              type="button"
              onClick={() => setConfirmExit(false)}
              className="btn-outline text-sm"
            >
              Keep going
            </button>
          </div>
        </div>
      )}

      {capMessage && (
        <div className="mb-4 rounded-2xl border border-[var(--primary)]/40 bg-[var(--primary)]/[0.08] p-4 text-center">
          <p className="font-semibold">{capMessage}</p>
          {/* No route to a purchase inside the iOS app — Guideline 3.1.1. */}
          {!isIosApp && (
            <a href="/pricing" className="btn-primary mt-2 inline-flex">
              See plans
            </a>
          )}
        </div>
      )}

      {/* Progress — collapsed by default so the question stays above the fold.
          The full grid is one tap away via "Jump to". */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">
            Question {index + 1}{" "}
            <span className="font-normal text-[var(--muted)]">of {questions.length}</span>
            {!isPractice && unanswered.length > 0 && (
              <span className="ml-2 font-normal text-[var(--muted)]">
                · {unanswered.length} unanswered
              </span>
            )}
          </p>
          <button
            type="button"
            ref={paletteToggleRef}
            onClick={() => setPaletteOpen((v) => !v)}
            aria-expanded={paletteOpen}
            aria-controls="question-palette"
            className="btn-ghost h-9 px-2 text-xs"
          >
            {paletteOpen ? "Hide" : "Jump to"}
            <span aria-hidden="true" className="text-[10px]">
              {paletteOpen ? "▲" : "▼"}
            </span>
          </button>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-label={`${answeredCount} of ${questions.length} questions answered`}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>

        {paletteOpen && (
          <div
            id="question-palette"
            className="pop-in mt-3 grid max-h-56 grid-cols-8 gap-1 overflow-y-auto rounded-xl bg-white/40 p-2 sm:grid-cols-10"
          >
            {palette.map((p) => (
              <button
                key={p.i}
                onClick={() => {
                  setIndex(p.i);
                  setPaletteOpen(false);
                  paletteToggleRef.current?.focus();
                }}
                aria-current={p.i === index ? "true" : undefined}
                aria-label={`Question ${p.i + 1}${p.answered ? ", answered" : ""}`}
                className={`h-9 rounded-lg text-xs transition-colors ${
                  p.i === index ? "ring-2 ring-[var(--primary)]" : ""
                } ${
                  p.correct === true
                    ? "bg-[var(--primary)] font-medium text-white"
                    : p.correct === false
                      ? "bg-[var(--danger)] font-medium text-white"
                      : p.answered
                        ? "bg-[var(--primary)]/12 font-medium text-[var(--foreground)]"
                        : "text-[var(--muted)] hover:bg-black/[0.04]"
                }`}
              >
                {p.i + 1}
              </button>
            ))}
          </div>
        )}

        {paletteOpen && !isPractice && unanswered.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--muted)]">
              {unanswered.length} unanswered
            </p>
            <button
              type="button"
              onClick={goToFirstUnanswered}
              className="btn-ghost h-8 px-2 text-xs text-[var(--primary)]"
            >
              Go to first unanswered →
            </button>
          </div>
        )}
      </div>

      {/* Question card */}
      <div className="glass p-5">
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
                disabled={isLocked}
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

        {/* Show answer — practice only, and only once they've committed to an
            answer. Two taps on purpose: revealing locks the item for good, and
            an accidental brush on a phone shouldn't cost them the question. */}
        {canReveal && !reveal && (
          <div className="mt-4">
            {confirmRevealFor === q.attempt_question_id ? (
              <div className="pop-in rounded-lg border border-[var(--border)] bg-black/[0.02] p-4">
                <p className="text-sm font-medium">Show the answer for this question?</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Your answer is locked in as soon as you see it — you won&apos;t be
                  able to change it afterwards.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={showAnswer}
                    disabled={revealing}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {revealing ? "Loading…" : "Yes, show the answer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevealFor(null)}
                    disabled={revealing}
                    className="btn-outline text-sm"
                  >
                    No, keep going
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Deliberately not disabled when unanswered: a dead grey button
                    explains nothing. Tapping it says what to do instead. */}
                <button
                  type="button"
                  onClick={requestReveal}
                  className="btn-outline w-full text-sm"
                >
                  Show answer
                </button>
                {answerFirstFor === q.attempt_question_id && (
                  <p className="pop-in mt-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
                    Choose your answer first — then you can see the rationale.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {revealError && (
          <p className="mt-2 text-center text-sm text-[var(--danger)]">{revealError}</p>
        )}

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
            {reveal.explanation ? (
              <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                {reveal.explanation}
              </p>
            ) : (
              <p className="mt-1 text-[var(--muted)]">
                No rationale has been written for this question yet.
              </p>
            )}
          </div>
        )}
      </div>

      {submitError && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p>{submitError}</p>
          <button onClick={doSubmit} disabled={isSubmitting} className="btn-primary mt-2 text-xs">
            {isSubmitting ? "Submitting…" : "Try again"}
          </button>
        </div>
      )}

      {/* Submitting with blanks — list exactly which questions are missing so
          the student can go back to them instead of guessing. */}
      {confirmSubmit && (
        <div className="glass pop-in mt-4 p-4">
          <p className="text-sm font-medium">
            {unanswered.length} question{unanswered.length === 1 ? "" : "s"} still unanswered
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Unanswered questions are marked wrong. You can go back and finish them, or submit
            as is.
          </p>
          <p className="mt-2 max-h-20 overflow-y-auto text-sm font-medium">
            {unanswered.slice(0, 40).join(", ")}
            {unanswered.length > 40 ? `, +${unanswered.length - 40} more` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={goToFirstUnanswered} className="btn-primary text-sm">
              Go to first unanswered
            </button>
            <button
              type="button"
              onClick={doSubmit}
              disabled={isSubmitting}
              className="btn-outline text-sm"
            >
              {isSubmitting ? "Submitting…" : "Submit anyway"}
            </button>
          </div>
        </div>
      )}

      {/* Footer nav — sticky so it stays under the thumb on a phone. Safe to
          pin: InstallPrompt is suppressed on /exam routes, so nothing else
          occupies the bottom edge. */}
      <div
        className="glass-soft sticky bottom-0 z-10 mt-4 flex items-center justify-between gap-3 rounded-2xl px-3 py-3"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          className="btn-outline"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Previous
        </button>

        <div className="flex items-center gap-2">
          {index < questions.length - 1 && (
            <button
              className={allAnswered ? "btn-outline" : "btn-primary"}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next →
            </button>
          )}
          {/* Submit is reachable from anywhere once everything is answered —
              no need to navigate back to the last question. */}
          {(allAnswered || index === questions.length - 1) && (
            <button className="btn-primary" onClick={requestSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Submitting…" : isPractice ? "Finish & see results" : "Submit exam"}
            </button>
          )}
        </div>
      </div>

      {!isPractice && (allAnswered || index === questions.length - 1) && (
        <p className="mt-3 text-center text-xs text-[var(--muted)]">
          {allAnswered
            ? "All questions answered. Use “Jump to” to review before submitting."
            : "Use “Jump to” above to review your answers before submitting."}
        </p>
      )}
      </div>
    </main>
  );
}
