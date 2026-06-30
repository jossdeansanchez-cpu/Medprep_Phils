import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_ORDER, CATEGORY_LABELS, type ExamCategory } from "@/lib/categories";

type CoverageRow = {
  subject_id: string;
  subject_name: string;
  sort_order: number;
  category: ExamCategory;
  n: number;
};

export default async function AdminOverview() {
  const supabase = await createClient();

  const [
    { count: questionCount },
    { count: activeCount },
    { count: templateCount },
    { data: coverageData },
  ] = await Promise.all([
    supabase.from("questions").select("*", { count: "exact", head: true }),
    supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("exam_templates").select("*", { count: "exact", head: true }),
    supabase.rpc("admin_question_coverage"),
  ]);

  // Pivot the coverage rows into subject → { category: count }.
  const rows = (coverageData ?? []) as CoverageRow[];
  const bySubject = new Map<
    string,
    { name: string; order: number; counts: Record<ExamCategory, number> }
  >();
  for (const r of rows) {
    const entry =
      bySubject.get(r.subject_id) ??
      {
        name: r.subject_name,
        order: r.sort_order,
        counts: { daily_practice: 0, weekly_practice: 0, mock_exam: 0 },
      };
    entry.counts[r.category] = Number(r.n);
    bySubject.set(r.subject_id, entry);
  }
  const subjects = [...bySubject.values()].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total questions" value={questionCount ?? 0} />
        <Stat label="Active questions" value={activeCount ?? 0} />
        <Stat label="Exam templates" value={templateCount ?? 0} />
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-medium">Question coverage</h2>
          <span className="text-xs text-[var(--muted)]">active questions per subject × type</span>
        </div>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Cells in red have no questions for that exam type yet. Amber means thin coverage (1–2).
        </p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="py-2 pr-4 font-medium">Subject</th>
              {CATEGORY_ORDER.map((c) => (
                <th key={c} className="px-3 py-2 text-center font-medium">
                  {CATEGORY_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.name} className="border-t border-[var(--border)]">
                <td className="py-2 pr-4 font-medium whitespace-nowrap">{s.name}</td>
                {CATEGORY_ORDER.map((c) => (
                  <td key={c} className="px-3 py-2 text-center">
                    <CoverageCell n={s.counts[c]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/upload" className="btn-primary">Upload questions</Link>
        <Link href="/admin/exams" className="btn-outline">Manage exams</Link>
      </div>
    </div>
  );
}

function CoverageCell({ n }: { n: number }) {
  const tone =
    n === 0
      ? "bg-[var(--danger)]/12 text-[var(--danger)]"
      : n <= 2
        ? "bg-amber-100 text-amber-700"
        : "bg-[var(--primary)]/10 text-[var(--primary)]";
  return (
    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-sm font-semibold ${tone}`}>
      {n}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
