"use client";

import Link from "next/link";
import { useState } from "react";
import { startAttempt } from "@/lib/exam";
import { categoryLabel } from "@/lib/categories";
import PresetForm from "@/app/exams/presets/PresetForm";
import DeletePreset from "@/app/exams/presets/DeletePreset";
import { updatePreset } from "@/app/exams/presets/actions";
import type { Coverage } from "@/lib/exam-availability";
import type { ExamTemplate, Subject } from "@/lib/types";

/**
 * A start-able personal exam preset.
 *
 * Deliberately not a variant of ExamCard. All three of that component's
 * behaviours mis-fit here: its "New" badge would stamp an exam the student
 * created seconds ago, it has no slot for Edit/Delete, and its locked state is
 * quota-shaped (`remainingForKind <= 0`). The lock case for a preset is a plan
 * downgrade instead — and since the practice allowance is unlimited on every
 * paid tier, ExamCard would render an enabled Start that start_attempt then
 * rejects with a raw error.
 *
 * `locked` is computed on the server from the student's plan. `available` is
 * how many questions the pool can actually supply right now; when it is below
 * the preset's size the exam still runs, just shorter, so this is a note rather
 * than a block.
 *
 * Pass `manage` on the student's own presets page to get the edit/delete
 * controls; omit it where the card is only there to be started.
 */
export default function PresetCard({
  preset,
  iosApp,
  locked,
  available,
  manage,
}: {
  preset: ExamTemplate;
  iosApp: boolean;
  locked: boolean;
  available?: number;
  manage?: { subjects: Subject[]; coverage: Coverage };
}) {
  const [editing, setEditing] = useState(false);
  const size = preset.total_questions ?? 0;
  const short = available !== undefined && available < size;

  if (editing && manage) {
    return (
      <div className="glass p-4">
        <p className="mb-3 text-sm font-semibold">Edit “{preset.title}”</p>
        <PresetForm
          action={updatePreset.bind(null, preset.id)}
          subjects={manage.subjects}
          coverage={manage.coverage}
          preset={preset}
          submitLabel="Save changes"
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="glass lift flex flex-col justify-between gap-3 p-5">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
            {categoryLabel(preset.category)}
          </span>
          <span className="badge bg-black/[0.06]">Yours</span>
        </div>
        <h3 className="font-semibold">{preset.title}</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {size} question{size === 1 ? "" : "s"} ·{" "}
          {preset.time_limit_minutes ? `${preset.time_limit_minutes} min` : "untimed"}
        </p>
        {short && (
          <p className="mt-1 text-xs text-amber-700">
            Only {available} question{available === 1 ? "" : "s"} available right
            now — this exam will be shorter than {size}.
          </p>
        )}
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
          ✦ Unlock Quiz Maker
        </Link>
      ) : (
        <form action={startAttempt.bind(null, preset.id)}>
          <button type="submit" className="btn-primary w-full">
            Start
          </button>
        </form>
      )}

      {manage && (
        <div className="flex items-center gap-2 border-t border-[var(--border)] pt-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-ghost text-xs"
          >
            Edit
          </button>
          <DeletePreset id={preset.id} title={preset.title} />
        </div>
      )}
    </div>
  );
}
