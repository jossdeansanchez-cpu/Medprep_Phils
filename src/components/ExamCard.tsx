import Link from "next/link";
import { startAttempt } from "@/lib/exam";
import { categoryLabel } from "@/lib/categories";
import type { ExamTemplate } from "@/lib/types";

export function isRecent(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

/**
 * A start-able exam card. `remainingForKind` is how many exams of this kind the
 * student has left this period (null = unlimited); when it hits 0 the card
 * shows an upgrade CTA instead of Start, matching the server-side quota in
 * start_attempt so they never get a raw error.
 */
export default function ExamCard({
  t,
  remainingForKind,
}: {
  t: ExamTemplate;
  remainingForKind: number | null;
}) {
  const isMock = t.category === "mock_exam";
  const locked = remainingForKind !== null && remainingForKind <= 0;
  const showCount = remainingForKind !== null && remainingForKind > 0 && remainingForKind <= 3;

  return (
    <div className="glass lift flex flex-col justify-between gap-3 p-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
            {categoryLabel(t.category)}
          </span>
          {isRecent(t.created_at) && (
            <span className="badge bg-amber-100 text-amber-700">New</span>
          )}
          {showCount && (
            <span className="badge bg-amber-100 text-amber-700">
              {remainingForKind} left
            </span>
          )}
        </div>
        <h3 className="font-semibold">{t.title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {t.total_questions != null
            ? `${t.total_questions} questions`
            : `${t.questions_per_subject} questions / subject`}{" "}
          · {t.time_limit_minutes ? `${t.time_limit_minutes} min` : "untimed"}
        </p>
      </div>
      {locked ? (
        <Link href="/pricing" className="btn-primary w-full whitespace-nowrap">
          ✦ {isMock ? "Unlock mock exams" : "Upgrade to continue"}
        </Link>
      ) : (
        <form action={startAttempt.bind(null, t.id)}>
          <button type="submit" className="btn-primary w-full">
            Start
          </button>
        </form>
      )}
    </div>
  );
}
