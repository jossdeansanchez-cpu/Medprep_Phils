"use client";

import { useState, useTransition } from "react";
import { setMyTrack } from "./actions";
import {
  TRACK_ORDER,
  TRACK_LABELS,
  TRACK_FULL_NAMES,
  type ExamTrack,
} from "@/lib/tracks";

/**
 * Switch which exam the student is preparing for.
 *
 * A plan is bought against one track, so switching while on a paid plan drops
 * the student to the free tier until they buy on the new track. That is
 * recoverable — switching back restores the original plan for whatever time is
 * left — but it is surprising enough to confirm first.
 */
export default function TrackSwitcher({
  current,
  paidPlanLabel,
}: {
  current: ExamTrack;
  /** Plan name if they hold a live paid plan on `current`, else null. */
  paidPlanLabel: string | null;
}) {
  const [target, setTarget] = useState<ExamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ExamTrack) {
    if (next === current) return;
    setError(null);
    if (paidPlanLabel) {
      setTarget(next);
      return;
    }
    commit(next);
  }

  function commit(next: ExamTrack) {
    startTransition(async () => {
      const res = await setMyTrack(next);
      if (res?.error) setError(res.error);
      setTarget(null);
    });
  }

  return (
    <div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {TRACK_ORDER.map((t) => {
          const active = t === current;
          return (
            <button
              key={t}
              onClick={() => choose(t)}
              disabled={pending || active}
              className={`rounded-xl border p-3 text-left transition ${
                active
                  ? "border-[var(--primary)] bg-[var(--primary)]/5"
                  : "border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold">{TRACK_LABELS[t]}</span>
                {active && (
                  <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
                    current
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {TRACK_FULL_NAMES[t]}
              </span>
            </button>
          );
        })}
      </div>

      {target && paidPlanLabel && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold">
            Switch to {TRACK_LABELS[target]}?
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Your {paidPlanLabel} plan was bought for {TRACK_LABELS[current]} and
            doesn&apos;t carry over, so you&apos;ll be on the free tier for{" "}
            {TRACK_LABELS[target]} until you subscribe there. Nothing is lost —
            switching back restores your {TRACK_LABELS[current]} plan for the
            time still left on it.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => commit(target)}
              disabled={pending}
              className="btn-primary text-sm"
            >
              {pending ? "Switching…" : `Switch to ${TRACK_LABELS[target]}`}
            </button>
            <button
              onClick={() => setTarget(null)}
              disabled={pending}
              className="btn-ghost text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
