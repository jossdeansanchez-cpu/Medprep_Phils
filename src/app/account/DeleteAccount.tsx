"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "./actions";

/**
 * Self-serve account deletion, required by App Store Guideline 5.1.1(v).
 *
 * Two-step with a typed confirmation: the action is irreversible and takes the
 * student's exam history with it, so a single mis-tap must not be enough.
 */
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await deleteMyAccount(confirmation);
        if (res?.error) setError(res.error);
      } catch (err) {
        // A successful delete redirects, which throws NEXT_REDIRECT — rethrow
        // so the navigation isn't swallowed as a failure.
        const digest = (err as { digest?: string })?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        setError("We couldn't delete your account. Please try again.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost text-sm text-[var(--danger)]"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/[0.06] p-4">
      <p className="text-sm font-semibold">Delete your account permanently?</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        This removes your profile, every exam you&apos;ve taken and your results. It can&apos;t
        be undone, and any remaining time on your plan is lost.
      </p>

      <label className="label mt-3 block" htmlFor="delete-confirm">
        Type <strong>DELETE</strong> to confirm
      </label>
      <input
        id="delete-confirm"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        disabled={pending}
        autoComplete="off"
        className="input"
        placeholder="DELETE"
      />

      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={submit}
          disabled={pending || confirmation.trim().toUpperCase() !== "DELETE"}
          className="btn-primary bg-[var(--danger)] text-sm"
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setConfirmation("");
            setError(null);
          }}
          disabled={pending}
          className="btn-ghost text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
