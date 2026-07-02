"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Topbar search: submits to the Exams catalog filtered by query. */
export default function ExamSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/exams?q=${encodeURIComponent(term)}` : "/exams");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        aria-label="Search exams"
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-full bg-white/60 text-[var(--muted)] transition-colors duration-200 hover:bg-white"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="pop-in flex items-center gap-1 rounded-full bg-white/80 pl-3 pr-1 shadow-sm">
      <svg className="h-4 w-4 text-[var(--muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => !q && setOpen(false)}
        placeholder="Search exams…"
        className="w-40 bg-transparent py-1.5 text-sm outline-none sm:w-56"
      />
      <button type="submit" className="rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white">
        Go
      </button>
    </form>
  );
}
