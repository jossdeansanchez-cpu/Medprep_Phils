"use client";

import { useState, useTransition } from "react";
import { deleteStudent } from "@/app/admin/actions";

export default function RemoveStudent({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10"
        title={`Remove ${name}`}
      >
        Remove
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await deleteStudent(userId);
            if (res.error) {
              setError(res.error);
              setArmed(false);
            }
          })
        }
        className="rounded-lg bg-[var(--danger)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button
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
