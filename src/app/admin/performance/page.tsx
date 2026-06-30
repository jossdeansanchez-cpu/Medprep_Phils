import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, CATEGORY_BLURB, type ExamCategory } from "@/lib/categories";

type Row = {
  category: ExamCategory;
  attempts: number;
  students: number;
  avg_score: number | null;
  pass_rate: number | null;
};

export default async function PerformancePage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_category_performance");
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Performance by category</h1>
        <p className="text-sm text-[var(--muted)]">
          How students are doing across each exam category. Counts cover submitted attempts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {rows.map((r) => (
          <div key={r.category} className="glass p-5">
            <h2 className="font-semibold">{CATEGORY_LABELS[r.category]}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{CATEGORY_BLURB[r.category]}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Attempts" value={`${r.attempts ?? 0}`} />
              <Metric label="Students" value={`${r.students ?? 0}`} />
              <Metric
                label="Avg score"
                value={r.avg_score != null ? `${r.avg_score}%` : "—"}
              />
              <Metric
                label="Pass rate"
                value={r.pass_rate != null ? `${r.pass_rate}%` : "—"}
                tone={
                  r.pass_rate == null
                    ? undefined
                    : r.pass_rate >= 50
                      ? "good"
                      : "bad"
                }
              />
            </div>

            {(!r.attempts || r.attempts === 0) && (
              <p className="mt-3 text-xs text-[var(--muted)]">No attempts yet.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-[var(--primary)]"
      : tone === "bad"
        ? "text-[var(--danger)]"
        : "text-[var(--foreground)]";
  return (
    <div className="rounded-xl bg-black/[0.03] px-3 py-2.5">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}
