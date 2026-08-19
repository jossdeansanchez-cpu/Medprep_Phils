import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEligibleTemplatesForQuestion } from "@/app/admin/actions";
import QuestionForm, { type ImagePreviews } from "@/app/admin/questions/QuestionForm";
import ExamAssignment from "./ExamAssignment";
import { signImagePaths } from "@/lib/images";
import type { OptionLabel, Question, Subject } from "@/lib/types";

/** An editing session is long; an hour outlasts one without leaving links around. */
const PREVIEW_TTL_SECONDS = 60 * 60;

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: questionData }, { data: subjectsData }, slots] = await Promise.all([
    supabase.from("questions").select("*").eq("id", id).single(),
    supabase.from("subjects").select("*").order("order"),
    getEligibleTemplatesForQuestion(id),
  ]);

  if (!questionData) notFound();
  const question = questionData as Question;
  const subjects = (subjectsData ?? []) as Subject[];

  // The bucket is private, so saved figures need signing before they can be
  // previewed. Freshly uploaded ones preview from a local object URL instead.
  const paths = [
    question.stem_image_path,
    ...question.options.map((o) => o.image_path),
  ].filter((p): p is string => !!p);
  const signed = await signImagePaths(paths, PREVIEW_TTL_SECONDS);

  const previews: ImagePreviews = {
    stem: question.stem_image_path ? (signed.get(question.stem_image_path) ?? null) : null,
    options: Object.fromEntries(
      question.options
        .filter((o) => o.image_path)
        .map((o) => [o.label, signed.get(o.image_path!) ?? null])
    ) as Partial<Record<OptionLabel, string | null>>,
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link href="/admin/questions" className="text-sm text-[var(--muted)] hover:underline">
          ← Back to questions
        </Link>
        <h1 className="mb-3 mt-1 text-xl font-semibold">Edit question</h1>
        <QuestionForm question={question} subjects={subjects} previews={previews} />
      </div>
      <ExamAssignment questionId={id} slots={slots} />
    </div>
  );
}
