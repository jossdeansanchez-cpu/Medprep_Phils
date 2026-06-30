"use client";

import { useTransition } from "react";
import { setQuestionCategory } from "@/app/admin/actions";
import { CATEGORY_ORDER, CATEGORY_LABELS, type ExamCategory } from "@/lib/categories";

export default function QuestionCategory({
  id,
  category,
}: {
  id: string;
  category: ExamCategory;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      defaultValue={category}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => setQuestionCategory(id, value));
      }}
      className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--primary)]"
      title="Exam type this question belongs to"
    >
      {CATEGORY_ORDER.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS[c]}
        </option>
      ))}
    </select>
  );
}
