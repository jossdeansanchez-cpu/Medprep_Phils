"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";
import {
  TRACK_ORDER,
  TRACK_LABELS,
  TRACK_FULL_NAMES,
  TRACK_BLURB,
  DEFAULT_TRACK,
  type ExamTrack,
} from "@/lib/tracks";

export default function AuthForm({
  mode,
  redirectTo,
  defaultTrack = DEFAULT_TRACK,
}: {
  mode: "login" | "signup";
  redirectTo?: string;
  /** Preselected when arriving from a track-specific call to action. */
  defaultTrack?: ExamTrack;
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

      {mode === "signup" && (
        <fieldset>
          <legend className="label">Which exam are you preparing for?</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {TRACK_ORDER.map((t) => (
              <label
                key={t}
                className="flex cursor-pointer gap-2 rounded-lg border border-[var(--border)] p-3 hover:border-[var(--primary)] has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[var(--primary)]/5"
              >
                <input
                  type="radio"
                  name="track"
                  value={t}
                  defaultChecked={t === defaultTrack}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{TRACK_LABELS[t]}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {TRACK_FULL_NAMES[t]}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {TRACK_BLURB[t]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            You can change this later in your account settings.
          </p>
        </fieldset>
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
