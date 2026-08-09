"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, hasAtLeast } from "@/lib/billing/entitlements";
import { planMessage } from "@/lib/plan-messages";
import {
  PRESET_MIN_QUESTIONS,
  PRESET_MAX_QUESTIONS,
  type PresetFormState,
} from "@/lib/presets";

type ParsedPreset = {
  title: string;
  category: string;
  totalQuestions: number;
  subjectIds: string[];
  timeLimit: number | null;
};

/**
 * Pull the five student-controlled fields out of the form.
 *
 * Everything else about a preset — owner_id, is_published, mode, the pass
 * thresholds — is pinned inside create_exam_preset, so there is deliberately
 * nothing here to forget. Mirrors parseQuestionCount in src/app/admin/actions.ts.
 */
function parsePreset(formData: FormData): ParsedPreset {
  const timeRaw = String(formData.get("time_limit_minutes") ?? "").trim();
  const rawCount = Number(formData.get("total_questions") ?? PRESET_MIN_QUESTIONS);
  return {
    title: String(formData.get("title") ?? "").trim(),
    category: String(formData.get("category") ?? "daily_practice"),
    totalQuestions: Math.min(
      PRESET_MAX_QUESTIONS,
      Math.max(PRESET_MIN_QUESTIONS, Number.isFinite(rawCount) ? Math.round(rawCount) : PRESET_MIN_QUESTIONS)
    ),
    subjectIds: formData.getAll("subjects").map(String).filter(Boolean),
    timeLimit: timeRaw ? Number(timeRaw) : null,
  };
}

/**
 * Fast client-side-ish guard. `assert_can_manage_presets()` in the database is
 * the authoritative gate — this only saves a round trip and gives a tidy
 * message when the nav item was reached by direct URL.
 */
async function guard(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "admin") return null;
  const { plan } = await getEntitlements();
  if (!hasAtLeast(plan, "pro")) {
    return "Building your own exams isn't included in your current plan.";
  }
  return null;
}

/**
 * Errors are returned, not thrown: Next.js masks thrown server-action errors in
 * production, and every message here is something the student can act on
 * ("only 34 questions available", "you already have 20 saved exams").
 *
 * planMessage() is mandatory on the error path — the plan gate raises "Upgrade
 * to build your own", which must never reach the iOS build (Guideline 3.1.1).
 */
export async function createPreset(
  _prev: PresetFormState,
  formData: FormData
): Promise<PresetFormState> {
  const denied = await guard();
  if (denied) return { error: denied };

  const p = parsePreset(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_exam_preset", {
    p_title: p.title,
    p_category: p.category,
    p_total_questions: p.totalQuestions,
    p_subject_ids: p.subjectIds.length > 0 ? p.subjectIds : null,
    p_time_limit_minutes: p.timeLimit,
  });
  if (error) return { error: planMessage(error.message) };

  revalidatePath("/exams/presets");
  revalidatePath("/exams");
  return { ok: true };
}

export async function updatePreset(
  id: string,
  _prev: PresetFormState,
  formData: FormData
): Promise<PresetFormState> {
  const denied = await guard();
  if (denied) return { error: denied };

  const p = parsePreset(formData);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_exam_preset", {
    p_id: id,
    p_title: p.title,
    p_category: p.category,
    p_total_questions: p.totalQuestions,
    p_subject_ids: p.subjectIds.length > 0 ? p.subjectIds : null,
    p_time_limit_minutes: p.timeLimit,
  });
  if (error) return { error: planMessage(error.message) };

  revalidatePath("/exams/presets");
  revalidatePath("/exams");
  return { ok: true };
}

/**
 * Not plan-gated, deliberately: a student who has downgraded must still be able
 * to clean up presets they can no longer run.
 *
 * `archived` comes back true when the preset had submitted attempts — the row
 * is soft-deleted rather than removed so their past results stay readable.
 */
export async function deletePreset(
  id: string
): Promise<{ ok?: boolean; archived?: boolean; error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_exam_preset", { p_id: id });
  if (error) return { error: planMessage(error.message) };

  revalidatePath("/exams/presets");
  revalidatePath("/exams");
  const row = data as { archived?: boolean } | null;
  return { ok: true, archived: !!row?.archived };
}
