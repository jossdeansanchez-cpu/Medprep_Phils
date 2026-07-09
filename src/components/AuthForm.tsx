"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";

export default function AuthForm({
  mode,
  redirectTo,
}: {
  mode: "login" | "signup";
  redirectTo?: string;
}) {
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="card space-y-4">
      <h1 className="text-xl font-semibold">
        {mode === "login" ? "Sign in" : "Create your account"}
      </h1>

      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="full_name">Full name</label>
          <input id="full_name" name="full_name" className="input" autoComplete="name" />
        </div>
      )}

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

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Password</label>
          {mode === "login" && (
            <Link href="/forgot-password" className="text-xs text-[var(--primary)] hover:underline">
              Forgot password?
            </Link>
          )}
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </div>

      {redirectTo && <input type="hidden" name="redirect" value={redirectTo} />}

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state?.message && <p className="text-sm text-[var(--primary)]">{state.message}</p>}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link href="/signup" className="text-[var(--primary)] underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href="/login" className="text-[var(--primary)] underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
