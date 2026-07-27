"use client";

import { useActionState, useEffect, useRef } from "react";
import { createResource, type FormState } from "@/app/admin/actions";

export default function ResourceForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createResource,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the fields after a successful add so the next one is quick.
  useEffect(() => {
    if (state?.message) formRef.current?.reset();
  }, [state?.message]);

  return (
    <form ref={formRef} action={action} className="glass space-y-3 p-5">
      <h2 className="font-semibold">Add a resource</h2>

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          required
          className="input"
          placeholder="Harrison's Principles of Internal Medicine"
        />
      </div>

      <div>
        <label className="label" htmlFor="kind">Type</label>
        <select id="kind" name="kind" className="input" defaultValue="book">
          <option value="book">Book</option>
          <option value="pdf">PDF reference</option>
          <option value="review">Review exam</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="url">Link</label>
        <input
          id="url"
          name="url"
          type="url"
          required
          className="input"
          placeholder="https://drive.google.com/..."
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          Any public link — Google Drive, Dropbox, a website, or a direct PDF.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="description">Description (optional)</label>
        <textarea
          id="description"
          name="description"
          rows={2}
          className="input"
          placeholder="What this covers and when to use it."
        />
      </div>

      <div>
        <label className="label" htmlFor="sort_order">Sort order</label>
        <input
          id="sort_order"
          name="sort_order"
          type="number"
          className="input"
          defaultValue={0}
        />
        <p className="mt-1 text-xs text-[var(--muted)]">Lower numbers appear first.</p>
      </div>

      {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state?.message && <p className="text-sm text-[var(--primary)]">{state.message}</p>}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Adding…" : "Add resource"}
      </button>
    </form>
  );
}
