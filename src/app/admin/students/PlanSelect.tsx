"use client";

import { useState, useTransition } from "react";
import { setStudentPlan } from "@/app/admin/actions";
import { PLAN_TIERS, planLabel, type PlanTier } from "@/lib/billing/plans";

/** Preset validity windows, in months. `null` = never expires. */
const VALIDITY: { value: string; label: string; months: number | null }[] = [
  { value: "1", label: "1 month", months: 1 },
  { value: "3", label: "3 months", months: 3 },
  { value: "6", label: "6 months", months: 6 },
  { value: "12", label: "1 year", months: 12 },
  { value: "24", label: "2 years", months: 24 },
  { value: "never", label: "No expiry", months: null },
];

/** Months from today, as an ISO timestamp. */
function monthsFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/**
 * Sets a student's plan and how long it lasts, for students who pay outside
 * PayMongo. Choosing "Free" clears the plan, so the validity control is hidden
 * there — there's no period left to grant.
 */
export default function PlanSelect({
  userId,
  plan,
}: {
  userId: string;
  plan: PlanTier;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<PlanTier>(plan);
  const [validity, setValidity] = useState("12");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply(nextPlan: PlanTier, nextValidity: string, customDate = custom) {
    setError(null);

    let ends: string | null = null;
    if (nextPlan !== "free") {
      if (nextValidity === "custom") {
        if (!customDate) return; // wait for a date before saving
        ends = new Date(`${customDate}T23:59:59`).toISOString();
      } else {
        const preset = VALIDITY.find((v) => v.value === nextValidity);
        ends = preset?.months == null ? null : monthsFromNow(preset.months);
      }
    }

    startTransition(async () => {
      const res = await setStudentPlan(userId, nextPlan, ends);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as PlanTier;
          setSelected(next);
          apply(next, validity);
        }}
        aria-label="Plan"
        className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--primary)]"
      >
        {PLAN_TIERS.map((t) => (
          <option key={t} value={t}>
            {planLabel(t)}
          </option>
        ))}
      </select>

      {selected !== "free" && (
        <>
          <select
            value={validity}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value;
              setValidity(next);
              if (next !== "custom") apply(selected, next);
            }}
            aria-label="Valid for"
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--primary)]"
          >
            {VALIDITY.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
            <option value="custom">Until date…</option>
          </select>

          {validity === "custom" && (
            <input
              type="date"
              value={custom}
              disabled={pending}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setCustom(e.target.value);
                if (e.target.value) apply(selected, "custom", e.target.value);
              }}
              aria-label="Valid until"
              className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs outline-none focus:border-[var(--primary)]"
            />
          )}
        </>
      )}

      {pending && <span className="text-xs text-[var(--muted)]">Saving…</span>}
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </span>
  );
}
