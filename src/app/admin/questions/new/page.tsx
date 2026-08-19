import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import QuestionForm from "@/app/admin/questions/QuestionForm";
import { TRACK_LABELS } from "@/lib/tracks";
import type { Subject } from "@/lib/types";

/**
 * Write one question by hand.
 *
 * CSV import remains the fast path for text-only banks, but it can't carry
 * figures — and a Perceptual Acuity item is mostly figures.
 */
export default async function NewQuestionPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("subjects").select("*").order("track").order("order");
  const subjects = (data ?? []) as Subject[];

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/questions" className="text-sm text-[var(--muted)] hover:underline">
        ← Back to questions
      </Link>
      <h1 className="mb-1 mt-1 text-xl font-semibold">New question</h1>
      <p className="mb-3 text-sm text-[var(--muted)]">
        The subject decides the track. For bulk text-only questions,{" "}
        <Link href="/admin/upload" className="text-[var(--primary)] underline">
          upload a CSV
        </Link>{" "}
        instead.
      </p>
      <QuestionForm
        subjects={subjects.map((s) => ({
          ...s,
          // Both tracks' subjects are listed here, so the label has to say which.
          name: `${TRACK_LABELS[s.track]} — ${s.name}`,
        }))}
      />
    </div>
  );
}
