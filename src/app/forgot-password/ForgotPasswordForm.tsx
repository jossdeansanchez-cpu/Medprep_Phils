"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/auth/actions";

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    undefined
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="input"
          autoComplete="email"
        />
      </div>

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state?.message && <p className="text-sm text-[var(--primary)]">{state.message}</p>}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
