"use client";

import { useState, useTransition } from "react";
import { deletePreset } from "./actions";

/** Arm-then-confirm delete, mirroring the admin's DeleteExam. */
export default function DeletePreset({ id, title }: { id: string; title: string }) {
  const [armed, setArmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (note) {
    return <span className="text-xs text-[var(--muted)]">{note}</span>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="btn-ghost text-xs text-[var(--danger)]"
        title={`Delete ${title}`}
      >
        Delete
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await deletePreset(id);
            if (res.error) {
              setError(res.error);
              setArmed(false);
            } else if (res.archived) {
              // Had submitted attempts, so the row was kept to preserve the
              // student's own results — say so rather than looking broken.
              setNote("Removed (past results kept)");
            }
            // A clean delete makes the card disappear via revalidation.
          })
        }
        className="rounded-lg bg-[var(--danger)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/[0.04]"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </span>
  );
}
