"use client";

import { useActionState, useEffect, useRef } from "react";
import { createStudent, type FormState } from "@/app/admin/actions";

export default function StudentForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createStudent,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful creation.
  useEffect(() => {
    if (state?.message) formRef.current?.reset();
  }, [state?.message]);

  return (
    <form ref={formRef} action={action} className="glass space-y-3 p-5">
      <h2 className="font-semibold">Add a student</h2>
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="password">Temporary password</label>
        <input
          id="password"
          name="password"
          type="text"
          required
          minLength={6}
          className="input"
          placeholder="min 6 characters"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Share this with the student — they can change it later.
        </p>
      </div>

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state?.message && <p className="text-sm text-[var(--primary)]">{state.message}</p>}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Creating…" : "Create student"}
      </button>
    </form>
  );
}
