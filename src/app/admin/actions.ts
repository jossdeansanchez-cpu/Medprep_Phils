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

/** Admin: set a student's plan directly (comp, no Stripe). */
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

export async function createTemplate(formData: FormData) {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const category = String(formData.get("category") ?? "mock_exam");
  const timeRaw = String(formData.get("time_limit_minutes") ?? "").trim();
  const subjectIds = formData.getAll("subjects").map(String).filter(Boolean);

  // Every category is a timed, scored exam (mock engine).
  const { error } = await supabase.from("exam_templates").insert({
    title: String(formData.get("title") ?? "").trim(),
    mode: "mock",
    category,
    questions_per_subject: Number(formData.get("questions_per_subject") ?? 5),
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

  const { error } = await supabase
    .from("exam_templates")
    .update({
      title: String(formData.get("title") ?? "").trim(),
      category,
      questions_per_subject: Number(formData.get("questions_per_subject") ?? 5),
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

export async function deleteTemplate(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("exam_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/exams");
}
