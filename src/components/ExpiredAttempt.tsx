"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { retakeExpiredAttempt } from "@/lib/exam";

/**
 * Shown when a student opens a timed exam whose clock ran out before they
 * answered anything — almost always because they were interrupted and the
 * wall-clock deadline kept running while they were away.
 *
 * Nothing was answered, so there is no score worth keeping: offer a clean
 * restart rather than a dead end. The retake is free (the dead attempt is
 * deleted, which releases the quota it consumed).
 */
export default function ExpiredAttempt({
  attemptId,
  title,
}: {
  attemptId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retake() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await retakeExpiredAttempt(attemptId);
        // A successful retake redirects, so reaching here means it failed.
        if (res?.error) setError(res.error);
      } catch (err) {
        // redirect() signals via a thrown NEXT_REDIRECT — rethrow so the
        // navigation isn't swallowed as a failure.
        const digest = (err as { digest?: string })?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        setError(
          "We couldn't restart the exam — this is usually a connection problem. Please check your internet and try again."
        );
      }
    });
  }

  return (
    <main className="app-gradient safe-area grid min-h-[100dvh] place-items-center px-4">
      <div className="glass pop-in w-full max-w-sm p-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          ⏳
        </p>
        <h1 className="mt-2 text-lg font-semibold">Time ran out</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The clock on <strong>{title}</strong> finished while you were away, and you hadn&apos;t
          answered anything yet. Nothing was scored — you can start it again from the beginning.
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-[var(--danger)]/10 p-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <button onClick={retake} disabled={pending} className="btn-primary mt-4 w-full">
          {pending ? "Starting…" : "Start this exam again"}
        </button>
        <Link href="/exams" className="btn-ghost mt-2 w-full">
          Back to exams
        </Link>
      </div>
    </main>
  );
}
