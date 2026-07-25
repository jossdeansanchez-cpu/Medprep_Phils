"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { validateRows, type RawRow, type ValidQuestion } from "@/lib/csv";
import { sendEmail, emailLayout, emailConfigured, getStudentEmails } from "@/lib/email";
import { CATEGORY_ORDER, type ExamCategory } from "@/lib/categories";
import type { OptionLabel, QuestionOption } from "@/lib/types";

export type FormState = { error?: string; message?: string } | undefined;

/** Admin: set a student's plan directly (comp, no PayMongo involvement). */
export async function setStudentPlan(userId: string, plan: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan", {
    p_user_id: userId,
    p_plan: plan,
    p_interval: "month",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/students");
}

/**
 * Permanently remove a student account (admin only). Cascades to their profile,
 * attempts, and subscription. Refuses to delete non-student accounts (admins).
 */
export async function deleteStudent(
  userId: string
): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // Guard: only students can be removed here, never an admin.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!profile) return { error: "Account not found." };
  if (profile.role !== "student") return { error: "Only students can be removed." };

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/students");
  return { ok: true };
}

/**
 * Admin: set a new password for a student (for "forgot password" when email
 * delivery isn't reliable). Refuses to touch non-student accounts.
 */
export async function setStudentPassword(
  userId: string,
  newPassword: string
): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (newPassword.length < 6) return { error: "Password must be at least 6 characters." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (!profile) return { error: "Account not found." };
  if (profile.role !== "student") return { error: "Only student passwords can be reset here." };

  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Create a pre-confirmed student account (admin only). */
export async function createStudent(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_student", {
    p_email: email,
    p_password: password,
    p_full_name: full_name,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/students");
  return { message: `Student ${email} created. They can sign in right away.` };
}

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
    category: q.category,
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

export type DuplicateMatch = { id: string; stem: string; similarity: number };
export type DuplicateWarning = { rowIndex: number; matches: DuplicateMatch[] };

/**
 * Flag questions that look like near-duplicates of ones already in the bank
 * (same subject, similar wording) so the admin is warned before importing —
 * without blocking the import, since some near-duplicates are legitimate.
 */
export async function checkDuplicateQuestions(
  items: { rowIndex: number; subjectId: string; stem: string }[]
): Promise<DuplicateWarning[]> {
  await requireAdmin();
  if (items.length === 0) return [];
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("find_similar_questions_batch", {
    p_subject_ids: items.map((i) => i.subjectId),
    p_stems: items.map((i) => i.stem),
    p_threshold: 0.45,
  });
  if (error || !data) return [];

  const byRow = new Map<number, DuplicateMatch[]>();
  for (const row of data as {
    row_index: number;
    question_id: string;
    existing_stem: string;
    similarity: number;
  }[]) {
    const rowIndex = items[row.row_index - 1]?.rowIndex;
    if (rowIndex === undefined) continue;
    const list = byRow.get(rowIndex) ?? [];
    list.push({ id: row.question_id, stem: row.existing_stem, similarity: row.similarity });
    byRow.set(rowIndex, list);
  }
  return Array.from(byRow, ([rowIndex, matches]) => ({ rowIndex, matches }));
}

export async function setQuestionActive(id: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  // Reactivating must also clear the deleted marker, otherwise the two flags
  // diverge (is_active = true + deleted_at set) and the question would be
  // hidden from the bank yet still eligible for exams.
  const patch = isActive
    ? { is_active: true, deleted_at: null }
    : { is_active: false };
  const { error } = await supabase.from("questions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/questions");
}

/**
 * Delete a question everywhere it can still be seen.
 *
 * A question already served in an attempt can't be hard-deleted (students' past
 * results read it through a foreign key), so it's marked deleted instead. Either
 * way the DB function also strips it out of any exam that is still in progress —
 * attempt_questions is a snapshot taken at start, so without that step a student
 * resuming an exam would keep seeing a question the admin already removed.
 * Submitted attempts are left untouched so history stays accurate.
 */
export async function deleteQuestion(
  id: string
): Promise<{ ok?: boolean; archived?: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_delete_question", { p_id: id });
  if (error) return { error: error.message };

  revalidatePath("/admin/questions");
  revalidatePath("/admin");
  const result = (data ?? {}) as { ok?: boolean; archived?: boolean };
  return { ok: true, archived: !!result.archived };
}

const OPTION_LABELS: OptionLabel[] = ["A", "B", "C", "D", "E"];

/**
 * Edit an existing question in place (subject, exam type, stem, options,
 * correct answer, explanation) so a fix no longer requires deleting and
 * re-uploading via CSV.
 */
export async function updateQuestion(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin();
  const supabase = await createClient();

  const subject_id = String(formData.get("subject_id") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const stem = String(formData.get("stem") ?? "").trim();
  const explanation = String(formData.get("explanation") ?? "").trim();
  const correct = String(formData.get("correct") ?? "").trim().toUpperCase();

  if (!subject_id) return { error: "Choose a subject." };
  if (!stem) return { error: "The question stem is required." };
  if (!(CATEGORY_ORDER as string[]).includes(category)) {
    return { error: "Choose a valid exam type (daily, weekly, or mock)." };
  }

  const options: QuestionOption[] = OPTION_LABELS.map((label) => ({
    label,
    text: String(formData.get(`option_${label.toLowerCase()}`) ?? "").trim(),
  })).filter((o) => o.text);
  if (options.length < 2) return { error: "At least 2 options are required." };
  if (!OPTION_LABELS.includes(correct as OptionLabel)) {
    return { error: "Correct answer must be A–E." };
  }
  if (!options.some((o) => o.label === correct)) {
    return { error: `Correct answer ${correct} has no matching option text.` };
  }

  const { error } = await supabase
    .from("questions")
    .update({
      subject_id,
      category: category as ExamCategory,
      stem,
      options,
      correct_label: correct,
      explanation: explanation || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/questions");
  revalidatePath(`/admin/questions/${id}/edit`);
  return { message: "Question updated." };
}

export async function createAnnouncement(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title) return;
  const { error } = await supabase
    .from("announcements")
    .insert({ title, body: body || null, created_by: profile.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");

  // Also email the announcement to every student (no-op if email not configured).
  if (emailConfigured()) {
    try {
      const recipients = await getStudentEmails();
      if (recipients.length) {
        const site = process.env.NEXT_PUBLIC_SITE_URL || "https://medprep-teal.vercel.app";
        const html = emailLayout({
          heading: title,
          body: (body || "").replace(/\n/g, "<br>") || "A new announcement from your MEDprep admin.",
          cta: { label: "Open MEDprep", href: `${site}/dashboard` },
        });
        // Send per-recipient so addresses aren't exposed to each other.
        await Promise.allSettled(
          recipients.map((to) => sendEmail({ to, subject: `📣 ${title}`, html }))
        );
      }
    } catch (e) {
      console.error("[announcement email] failed:", e);
    }
  }
}

export async function deleteAnnouncement(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}

export async function setQuestionCategory(id: string, category: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("questions")
    .update({ category })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/questions");
}

/**
 * Resolve the two question-count fields from the form. In "total" mode the
 * exam has one overall count (total_questions); questions_per_subject is kept
 * as a harmless placeholder since the column is NOT NULL. In "per_subject"
 * mode total_questions is null and the per-subject count applies.
 */
function parseQuestionCount(formData: FormData): {
  questions_per_subject: number;
  total_questions: number | null;
} {
  const mode = String(formData.get("count_mode") ?? "per_subject");
  if (mode === "total") {
    return {
      total_questions: Math.max(1, Number(formData.get("total_questions") ?? 20)),
      questions_per_subject: Number(formData.get("questions_per_subject") ?? 5) || 5,
    };
  }
  return {
    total_questions: null,
    questions_per_subject: Math.max(1, Number(formData.get("questions_per_subject") ?? 5)),
  };
}

export async function createTemplate(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const category = String(formData.get("category") ?? "mock_exam");
  const timeRaw = String(formData.get("time_limit_minutes") ?? "").trim();
  const subjectIds = formData.getAll("subjects").map(String).filter(Boolean);
  const count = parseQuestionCount(formData);

  // Every category is a timed, scored exam (mock engine).
  const { error } = await supabase.from("exam_templates").insert({
    title: String(formData.get("title") ?? "").trim(),
    mode: "mock",
    category,
    questions_per_subject: count.questions_per_subject,
    total_questions: count.total_questions,
    time_limit_minutes: timeRaw ? Number(timeRaw) : null,
    pass_average: Number(formData.get("pass_average") ?? 75),
    min_subject_score: Number(formData.get("min_subject_score") ?? 50),
    // null = all subjects
    subject_ids: subjectIds.length > 0 ? subjectIds : null,
    is_published: formData.get("is_published") === "on",
    created_by: profile.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exams");
  revalidatePath("/dashboard");
  revalidatePath("/practice");
}

export async function updateTemplate(id: string, formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();

  const category = String(formData.get("category") ?? "mock_exam");
  const timeRaw = String(formData.get("time_limit_minutes") ?? "").trim();
  const subjectIds = formData.getAll("subjects").map(String).filter(Boolean);
  const count = parseQuestionCount(formData);

  const { error } = await supabase
    .from("exam_templates")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      category,
      questions_per_subject: count.questions_per_subject,
      total_questions: count.total_questions,
      time_limit_minutes: timeRaw ? Number(timeRaw) : null,
      pass_average: Number(formData.get("pass_average") ?? 75),
      min_subject_score: Number(formData.get("min_subject_score") ?? 50),
      subject_ids: subjectIds.length > 0 ? subjectIds : null,
      is_published: formData.get("is_published") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exams");
  revalidatePath("/dashboard");
  revalidatePath("/practice");
  redirect("/admin/exams");
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

/**
 * Delete an exam. If students have already submitted results for it the row
 * can't be removed (their results page reads the title through a foreign key),
 * so it's marked deleted instead — gone from the admin list, the catalog and the
 * dashboard, while past results stay readable. Unfinished attempts of a deleted
 * exam are discarded, since there's no longer an exam to continue.
 */
export async function deleteTemplate(
  id: string
): Promise<{ ok?: boolean; archived?: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("admin_delete_template", { p_id: id });
  if (error) return { error: error.message };

  revalidatePath("/admin/exams");
  revalidatePath("/exams");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  const result = (data ?? {}) as { archived?: boolean };
  return { ok: true, archived: !!result.archived };
}

export type ExamSlot = {
  templateId: string;
  title: string;
  assigned: number;
  cap: number;
  isAssigned: boolean;
};

/**
 * Exams this question could be manually pinned into (same exam type, and the
 * exam either covers all subjects or explicitly includes this question's
 * subject), with each exam's current slot usage for that subject.
 */
export async function getEligibleTemplatesForQuestion(questionId: string): Promise<ExamSlot[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("id, subject_id, category")
    .eq("id", questionId)
    .single();
  if (!question) return [];

  const { data: templates } = await supabase
    .from("exam_templates")
    .select("id, title, questions_per_subject, subject_ids")
    .eq("category", question.category);

  const eligible = (templates ?? []).filter(
    (t) => !t.subject_ids || t.subject_ids.length === 0 || t.subject_ids.includes(question.subject_id)
  );
  if (eligible.length === 0) return [];

  const { data: assignments } = await supabase
    .from("exam_template_questions")
    .select("template_id, question_id")
    .in("template_id", eligible.map((t) => t.id))
    .eq("subject_id", question.subject_id);

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const a of assignments ?? []) {
    counts.set(a.template_id, (counts.get(a.template_id) ?? 0) + 1);
    if (a.question_id === questionId) mine.add(a.template_id);
  }

  return eligible.map((t) => ({
    templateId: t.id,
    title: t.title,
    assigned: counts.get(t.id) ?? 0,
    cap: t.questions_per_subject,
    isAssigned: mine.has(t.id),
  }));
}

/** Pin a question into a specific exam. Rejects if that exam is already full for the subject. */
export async function assignQuestionToTemplate(
  questionId: string,
  templateId: string
): Promise<{ error?: string; message?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("subject_id, category")
    .eq("id", questionId)
    .single();
  if (!question) return { error: "Question not found." };

  const { data: template } = await supabase
    .from("exam_templates")
    .select("title, category, questions_per_subject, subject_ids")
    .eq("id", templateId)
    .single();
  if (!template) return { error: "Exam not found." };

  if (template.category !== question.category) {
    return { error: `This question's type doesn't match "${template.title}"'s type.` };
  }
  if (
    template.subject_ids &&
    template.subject_ids.length > 0 &&
    !template.subject_ids.includes(question.subject_id)
  ) {
    return { error: `"${template.title}" doesn't include this question's subject.` };
  }

  const { count } = await supabase
    .from("exam_template_questions")
    .select("*", { count: "exact", head: true })
    .eq("template_id", templateId)
    .eq("subject_id", question.subject_id);

  if ((count ?? 0) >= template.questions_per_subject) {
    return {
      error: `"${template.title}" is already full for this subject (${count}/${template.questions_per_subject} questions).`,
    };
  }

  const { error } = await supabase.from("exam_template_questions").insert({
    template_id: templateId,
    question_id: questionId,
    subject_id: question.subject_id,
  });
  if (error) {
    if (error.code === "23505") return { error: "This question is already included in that exam." };
    return { error: error.message };
  }

  revalidatePath(`/admin/questions/${questionId}/edit`);
  return { message: `Added to "${template.title}".` };
}

export async function removeQuestionFromTemplate(questionId: string, templateId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("exam_template_questions")
    .delete()
    .eq("question_id", questionId)
    .eq("template_id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/questions/${questionId}/edit`);
}
