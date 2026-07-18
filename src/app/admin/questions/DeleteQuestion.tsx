"use client";

import { useState, useTransition } from "react";
import { deleteQuestion } from "@/app/admin/actions";

export default function DeleteQuestion({ id }: { id: string }) {
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
        onClick={() => setArmed(true)}
        className="btn-ghost text-xs text-[var(--danger)]"
        type="button"
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
            const res = await deleteQuestion(id);
            if (res.error) {
              setError(res.error);
              setArmed(false);
            } else if (res.archived) {
              setNote("Archived (used in past exams)");
            }
            // On a clean delete the row disappears via revalidation.
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
