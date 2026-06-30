"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OptionLabel } from "@/lib/types";

/** Build a fresh attempt from a template, then send the user into the runner. */
export async function startAttempt(templateId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", {
    p_template_id: templateId,
  });
  if (error) throw new Error(error.message);
  redirect(`/exam/${data as string}`);
}

export type SaveAnswerResult = {
  revealed: boolean;
  is_correct?: boolean;
  correct_label?: OptionLabel;
  explanation?: string | null;
};

/** Record a selection. In practice mode the response reveals the answer. */
export async function saveAnswer(
  attemptQuestionId: string,
  selected: OptionLabel
): Promise<SaveAnswerResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_answer", {
    p_attempt_question_id: attemptQuestionId,
    p_selected: selected,
  });
  if (error) throw new Error(error.message);
  return data as SaveAnswerResult;
}

/** Grade the attempt and go to the results page. */
export async function submitAttempt(attemptId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_attempt", {
    p_attempt_id: attemptId,
  });
  if (error) throw new Error(error.message);
  redirect(`/results/${attemptId}`);
}
