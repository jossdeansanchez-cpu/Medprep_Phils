"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { validateRows, type RawRow, type ValidQuestion } from "@/lib/csv";
import type { ExamMode } from "@/lib/types";

/**
 * Re-validate the submitted rows server-side (never trust the client preview),
 * then insert the valid questions. Returns how many were inserted/skipped.
 */
export async function importQuestions(
  rows: RawRow[]
): Promise<{ inserted: number; skipped: number; error?: string }> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { data: subjects } = await supabase.from("subjects").select("*");
  const { valid, errors } = validateRows(rows, subjects ?? []);

  if (valid.length === 0) {
    return { inserted: 0, skipped: errors.length, error: "No valid rows to import." };
  }

  const payload = (valid as ValidQuestion[]).map((q) => ({
    subject_id: q.subject_id,
    stem: q.stem,
    options: q.options,
    correct_label: q.correct_label,
    explanation: q.explanation,
    created_by: profile.id,
  }));

  const { error } = await supabase.from("questions").insert(payload);
  if (error) return { inserted: 0, skipped: errors.length, error: error.message };

  revalidatePath("/admin/questions");
  revalidatePath("/admin");
  return { inserted: valid.length, skipped: errors.length };
}

export async function setQuestionActive(id: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("questions")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/questions");
}

export async function deleteQuestion(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/questions");
}

export async function createTemplate(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const mode = String(formData.get("mode")) as ExamMode;
  const timeRaw = String(formData.get("time_limit_minutes") ?? "").trim();

  const { error } = await supabase.from("exam_templates").insert({
    title: String(formData.get("title") ?? "").trim(),
    mode,
    questions_per_subject: Number(formData.get("questions_per_subject") ?? 5),
    time_limit_minutes: mode === "mock" && timeRaw ? Number(timeRaw) : null,
    pass_average: Number(formData.get("pass_average") ?? 75),
    min_subject_score: Number(formData.get("min_subject_score") ?? 50),
    is_published: formData.get("is_published") === "on",
    created_by: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exams");
}

export async function setTemplatePublished(id: string, published: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_templates")
    .update({ is_published: published })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exams");
}

export async function deleteTemplate(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("exam_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exams");
}
