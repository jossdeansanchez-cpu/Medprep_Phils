import Link from "next/link";
import { startAttempt } from "@/lib/exam";
import { categoryLabel } from "@/lib/categories";
import { isIosApp } from "@/lib/platform/server";
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
export default async function ExamCard({
  t,
  remainingForKind,
}: {
  t: ExamTemplate;
  remainingForKind: number | null;
}) {
  const iosApp = await isIosApp();
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
      {locked && iosApp ? (
        // States the limit and stops. No CTA, no mention that a purchase
        // exists elsewhere — App Store Guideline 3.1.1.
        <button
          type="button"
          disabled
          className="btn-outline w-full whitespace-nowrap"
          title="Not included in your current plan"
        >
          Not available on your plan
        </button>
      ) : locked ? (
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
