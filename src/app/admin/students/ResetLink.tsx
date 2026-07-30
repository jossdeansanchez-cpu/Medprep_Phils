"use client";

import { useState, useTransition } from "react";
import { createStudentResetLink } from "@/app/admin/actions";

/**
 * Generates a one-time password-reset link for a student and shows it for
 * copying. Useful when a student can't receive email — the admin sends the
 * link over Messenger or SMS instead, and never learns their password.
 */
export default function ResetLink({ userId, name }: { userId: string; name: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await createStudentResetLink(userId);
      if (res.error) setError(res.error);
      else setLink(res.link ?? null);
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The link is
      // on screen and selectable, so this is a convenience, not the only route.
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  if (link) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`One-time reset link for ${name}`}
          className="w-44 rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
        />
        <button
          onClick={copy}
          className="rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={() => setLink(null)}
          className="rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/[0.04]"
        >
          Done
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={generate}
        disabled={pending}
        title={`Create a one-time reset link for ${name} to open`}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:bg-black/[0.04] disabled:opacity-50"
      >
        {pending ? "Creating…" : "Reset link"}
      </button>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </span>
  );
}
