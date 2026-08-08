"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { planMessage } from "@/lib/plan-messages";
import type { OptionLabel } from "@/lib/types";

/** Build a fresh attempt from a template, then send the user into the runner. */
export async function startAttempt(templateId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_attempt", {
    p_template_id: templateId,
  });
  // Same rewrite as saveAnswer — the quota gates live in start_attempt and
  // raise plan-marketing wording that must not reach the iOS app.
  if (error) throw new Error(planMessage(error.message));
  redirect(`/exam/${data as string}`);
}

/**
 * Throw away a timed attempt whose clock ran out before the student answered
 * anything, then start the same exam fresh.
 *
 * The deadline is wall-clock, so it keeps running while the student is away —
 * an interruption could otherwise cost them a mock exam from their plan quota
 * and leave a 0% on their record for an exam they never sat. Deleting the dead
 * row is what refunds the quota, since the gate in start_attempt counts rows.
 *
 * Every precondition (ownership, timed exam, actually expired, nothing
 * answered) is re-checked in discard_expired_attempt — the client clock is not
 * trusted, or a student could wipe an exam they were doing badly at.
 */
export async function retakeExpiredAttempt(
  attemptId: string
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const { data: templateId, error } = await supabase.rpc("discard_expired_attempt", {
    p_attempt_id: attemptId,
  });
  if (error) return { error: error.message };

  const { data: fresh, error: startError } = await supabase.rpc("start_attempt", {
    p_template_id: templateId as string,
  });
  if (startError) return { error: startError.message };

  // Outside any try/catch: redirect() works by throwing NEXT_REDIRECT.
  redirect(`/exam/${fresh as string}`);
}

export type SaveAnswerResult = {
  revealed: boolean;
  is_correct?: boolean;
  correct_label?: OptionLabel;
  explanation?: string | null;
  error?: string;
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
  // Return the message (not throw) so gates like the free daily cap reach the
  // client even in production, where Next.js masks thrown server-action errors.
  // planMessage() strips the plan-marketing wording the DB raises.
  if (error) return { revealed: false, error: planMessage(error.message) };
  return data as SaveAnswerResult;
}

/**
 * Grade the attempt and go to the results page.
 *
 * Returns `{ error }` rather than throwing so a failure (flaky mobile
 * connection is the common one) surfaces as a retryable message instead of a
 * crash — Next.js masks thrown server-action errors in production anyway.
 *
 * Submitting is idempotent from the caller's point of view: if the attempt was
 * already submitted (e.g. the first request succeeded but the phone dropped
 * before the response arrived, and the student retried) that's the desired end
 * state, so we go to the results instead of reporting an error.
 */
export async function submitAttempt(attemptId: string): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_attempt", {
    p_attempt_id: attemptId,
  });
  if (error && !/already submitted/i.test(error.message)) {
    return { error: error.message };
  }
  // Must stay outside any try/catch: redirect() works by throwing NEXT_REDIRECT.
  redirect(`/results/${attemptId}`);
}
