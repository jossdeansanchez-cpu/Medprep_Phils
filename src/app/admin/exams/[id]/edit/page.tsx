import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateTemplate } from "@/app/admin/actions";
import ExamForm from "../../ExamForm";
import type { ExamTemplate, Subject } from "@/lib/types";
import { buildCoverage, type CoverageRow } from "@/lib/exam-availability";

export default async function EditExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: template }, { data: subjectsData }, { data: coverageRows }] = await Promise.all([
    supabase.from("exam_templates").select("*").eq("id", id).single(),
    supabase.from("subjects").select("*").order("order"),
    supabase.rpc("admin_question_coverage"),
  ]);

  if (!template) notFound();
  const subjects = (subjectsData ?? []) as Subject[];
  const coverage = buildCoverage((coverageRows ?? []) as CoverageRow[]);

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/exams" className="text-sm text-[var(--muted)] hover:underline">
        ← Back to exams
      </Link>
      <h1 className="mb-3 mt-1 text-xl font-semibold">Edit exam</h1>
      <ExamForm
        action={updateTemplate.bind(null, id)}
        subjects={subjects}
        coverage={coverage}
        template={template as ExamTemplate}
        submitLabel="Save changes"
      />
    </div>
  );
}
