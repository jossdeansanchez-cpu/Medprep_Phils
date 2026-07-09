"use client";

import { useState, useTransition } from "react";
import { setStudentPassword } from "@/app/admin/actions";

export default function ResetPassword({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return <span className="text-xs text-[var(--primary)]">Password updated</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:bg-black/[0.04]"
        title={`Set a new password for ${name}`}
      >
        Reset password
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New temp password"
        className="w-36 rounded-lg border border-[var(--border)] px-2 py-1 text-xs outline-none focus:border-[var(--primary)]"
      />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await setStudentPassword(userId, value);
            if (res.error) setError(res.error);
            else setDone(true);
          })
        }
        className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setValue("");
          setError(null);
        }}
        disabled={pending}
        className="rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/[0.04]"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </span>
  );
}
