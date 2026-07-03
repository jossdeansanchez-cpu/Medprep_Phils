import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuestionForm from "./QuestionForm";
import type { Question, Subject } from "@/lib/types";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: question }, { data: subjectsData }] = await Promise.all([
    supabase.from("questions").select("*").eq("id", id).single(),
    supabase.from("subjects").select("*").order("order"),
  ]);

  if (!question) notFound();
  const subjects = (subjectsData ?? []) as Subject[];

  return (
    <div className="mx-auto max-w-xl">
      <Link href="/admin/questions" className="text-sm text-[var(--muted)] hover:underline">
        ← Back to questions
      </Link>
      <h1 className="mb-3 mt-1 text-xl font-semibold">Edit question</h1>
      <QuestionForm question={question as Question} subjects={subjects} />
    </div>
  );
}
