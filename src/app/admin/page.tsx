import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AdminOverview() {
  const supabase = await createClient();

  const [{ count: questionCount }, { count: activeCount }, { count: templateCount }, { data: bySubject }] =
    await Promise.all([
      supabase.from("questions").select("*", { count: "exact", head: true }),
      supabase.from("questions").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("exam_templates").select("*", { count: "exact", head: true }),
      supabase.from("subjects").select("id, name, questions(count)").order("order"),
    ]);

  const subjects = (bySubject ?? []) as unknown as {
    id: string;
    name: string;
    questions: { count: number }[];
  }[];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total questions" value={questionCount ?? 0} />
        <Stat label="Active questions" value={activeCount ?? 0} />
        <Stat label="Exam templates" value={templateCount ?? 0} />
      </div>

      <div className="card">
        <h2 className="mb-3 font-medium">Questions per subject</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {subjects.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>{s.name}</span>
              <span className="text-[var(--muted)]">{s.questions?.[0]?.count ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/upload" className="btn-primary">Upload questions</Link>
        <Link href="/admin/exams" className="btn-outline">Manage exams</Link>
      </div>
    </div>
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
