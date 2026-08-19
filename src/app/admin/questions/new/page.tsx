import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import QuestionForm from "@/app/admin/questions/QuestionForm";
import { TRACK_ORDER, TRACK_LABELS, TRACK_FULL_NAMES, coerceTrack } from "@/lib/tracks";
import type { Subject } from "@/lib/types";

/** Subjects whose questions are normally figures rather than sentences. */
const FIGURE_SUBJECTS = ["perceptual-acuity"];

/**
 * Write one question by hand — the only route that can attach images.
 *
 * CSV import stays the fast path for text-only banks, but a spreadsheet cannot
 * carry a figure, and an NMAT Perceptual Acuity item is mostly figures.
 */
export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  const { track } = await searchParams;
  const activeTrack = coerceTrack(track);

  const supabase = await createClient();
  const { data } = await supabase.from("subjects").select("*").order("order");
  const all = (data ?? []) as Subject[];
  // Show one track's subjects at a time. A single mixed dropdown makes it far
  // too easy to file an NMAT question under a PLE subject by mistake.
  const subjects = all.filter((s) => s.track === activeTrack);

  const figureSubjects = subjects.filter((s) => FIGURE_SUBJECTS.includes(s.slug));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link href="/admin/questions" className="text-sm text-[var(--muted)] hover:underline">
          ← Back to Question Bank
        </Link>
        <h1 className="mb-1 mt-1 text-xl font-semibold">New question</h1>
        <p className="text-sm text-[var(--muted)]">
          Add one question, with optional figures on the stem and on each answer
          choice. For lots of text-only questions,{" "}
          <Link href="/admin/upload" className="text-[var(--primary)] underline">
            bulk upload a CSV
          </Link>{" "}
          instead.
        </p>
      </div>

      {/* Exam first, subjects second — the subject is what puts a question on a
          track, so choosing it blind is the easiest mistake to make here. */}
      <div>
        <p className="label">Which exam is this question for?</p>
        <div className="mt-1 flex gap-2">
          {TRACK_ORDER.map((t) => (
            <Link
              key={t}
              href={`/admin/questions/new?track=${t}`}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                t === activeTrack
                  ? "border-[var(--primary)] bg-[var(--primary)]/5 font-semibold"
                  : "border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              {TRACK_LABELS[t]}
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                {TRACK_FULL_NAMES[t]}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {figureSubjects.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-black/[0.02] px-4 py-3 text-sm">
          <p className="font-medium">Adding a figure-based question?</p>
          <p className="mt-1 text-[var(--muted)]">
            For{" "}
            {figureSubjects.map((s) => s.name).join(", ")}, attach a figure to the
            stem and one to each answer choice, and leave the option text boxes
            empty. Images shrink automatically — students only ever get a private,
            expiring link.
          </p>
        </div>
      )}

      {subjects.length === 0 ? (
        <div className="card text-sm text-[var(--muted)]">
          No {TRACK_LABELS[activeTrack]} subjects exist yet.
        </div>
      ) : (
        <QuestionForm subjects={subjects} />
      )}
    </div>
  );
}
