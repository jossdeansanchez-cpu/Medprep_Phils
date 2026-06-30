"use client";

import { useTransition } from "react";
import { setStudentPlan } from "@/app/admin/actions";
import { PLAN_TIERS, planLabel, type PlanTier } from "@/lib/billing/plans";

export default function PlanSelect({ userId, plan }: { userId: string; plan: PlanTier }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      defaultValue={plan}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => setStudentPlan(userId, value));
      }}
      className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--primary)]"
    >
      {PLAN_TIERS.map((t) => (
        <option key={t} value={t}>
          {planLabel(t)}
        </option>
      ))}
    </select>
  );
}
