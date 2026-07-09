"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/auth/actions";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    updatePassword,
    undefined
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter a new password for your account.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="input"
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />
      </div>

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
