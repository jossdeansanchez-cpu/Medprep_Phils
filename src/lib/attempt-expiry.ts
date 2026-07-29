/**
 * Deadline maths for timed exams, in one place.
 *
 * A timed mock exam's deadline is wall-clock — `started_at + time_limit_minutes`
 * — so it keeps running while the student is away. That means an attempt can
 * expire without the student ever watching the timer reach zero, and any screen
 * that offers to "resume" one has to know that.
 *
 * `isAttemptExpired` reads the clock, which is why it lives here rather than
 * inline in a component: these callers are Server Components that render once
 * per request, but reading `Date.now()` directly in a render body trips the
 * purity lint (a fair rule for client components, which may re-render freely).
 */

export type AttemptTiming = {
  status: string;
  startedAt: string;
  mode: string | null | undefined;
  timeLimitMinutes: number | null | undefined;
};

/** Absolute deadline for a timed attempt, or null when the exam is untimed. */
export function attemptDeadlineMs(a: AttemptTiming): number | null {
  if (a.mode !== "mock" || a.timeLimitMinutes == null) return null;
  return new Date(a.startedAt).getTime() + a.timeLimitMinutes * 60_000;
}

/** True when an unfinished attempt's clock has already run out. */
export function isAttemptExpired(a: AttemptTiming): boolean {
  if (a.status === "submitted") return false;
  const deadline = attemptDeadlineMs(a);
  return deadline != null && Date.now() >= deadline;
}
