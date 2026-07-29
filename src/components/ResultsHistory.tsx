"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABELS, type ExamCategory } from "@/lib/categories";

export type AttemptSummary = {
  id: string;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  generalAverage: number | null;
  passed: boolean | null;
  title: string;
  category: ExamCategory | null;
};

type Outcome = "all" | "passed" | "failed" | "in_progress";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "all", label: "All" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "in_progress", label: "In progress" },
];

/**
 * Filterable list of the student's own attempts. Filtering is client-side on an
 * already-fetched list — a student has tens of attempts, not thousands, so this
 * avoids a round trip per keystroke.
 */
export default function ResultsHistory({ attempts }: { attempts: AttemptSummary[] }) {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [category, setCategory] = useState<ExamCategory | "all">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attempts.filter((a) => {
      if (q && !a.title.toLowerCase().includes(q)) return false;
      if (category !== "all" && a.category !== category) return false;
      if (outcome === "in_progress") return a.status !== "submitted";
      if (outcome === "passed") return a.status === "submitted" && a.passed === true;
      if (outcome === "failed") return a.status === "submitted" && a.passed === false;
      return true;
    });
  }, [attempts, query, outcome, category]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          type="search"
          className="input sm:flex-1"
          placeholder="Search by exam title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search your attempts by exam title"
        />
        <div className="flex gap-3">
          <select
            className="input"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as Outcome)}
            aria-label="Filter by result"
          >
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExamCategory | "all")}
            aria-label="Filter by exam type"
          >
            <option value="all">All types</option>
            {(Object.keys(CATEGORY_LABELS) as ExamCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="glass p-5 text-sm text-[var(--muted)]">
          {attempts.length === 0
            ? "You haven't taken an exam yet. Once you finish one, it stays here so you can review your answers and the rationales anytime."
            : "No attempts match these filters."}
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--muted)]">
            Showing {shown.length} of {attempts.length} attempt
            {attempts.length === 1 ? "" : "s"}
          </p>
          <div className="stagger space-y-3">
            {shown.map((a) => (
              <AttemptRow key={a.id} a={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AttemptRow({ a }: { a: AttemptSummary }) {
  const done = a.status === "submitted";
  const when = new Date(a.submittedAt ?? a.startedAt);

  return (
    <div className="glass lift flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{a.title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {a.category ? CATEGORY_LABELS[a.category] : "Exam"} ·{" "}
          {when.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>

      {done ? (
        <>
          <div className="text-right">
            <p className="text-2xl font-bold leading-none">{a.generalAverage ?? 0}%</p>
            <span
              className={`badge mt-1 ${
                a.passed
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : "bg-[var(--danger)]/10 text-[var(--danger)]"
              }`}
            >
              {a.passed ? "PASSED" : "FAILED"}
            </span>
          </div>
          <Link
            href={`/results/${a.id}`}
            className="btn-primary w-full sm:w-auto"
            aria-label={`Review your answers for ${a.title}`}
          >
            Review answers
            <span aria-hidden="true">→</span>
          </Link>
        </>
      ) : (
        <>
          <span className="badge bg-amber-100 text-amber-700">In progress</span>
          <Link
            href={`/exam/${a.id}`}
            className="btn-outline w-full sm:w-auto"
            aria-label={`Resume ${a.title}`}
          >
            Resume
          </Link>
        </>
      )}
    </div>
  );
}
