import { redirect, notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ExamRunner from "@/components/ExamRunner";
import ExpiredAttempt from "@/components/ExpiredAttempt";
import DeviceLimitBlock from "@/components/DeviceLimitBlock";
import { checkDevice } from "@/lib/devices";
import { attemptDeadlineMs, isAttemptExpired } from "@/lib/attempt-expiry";
import { isIosApp } from "@/lib/platform/server";
import type { ExamMode, OptionLabel, QuestionOption } from "@/lib/types";
import type { ExamCategory } from "@/lib/categories";

type RpcQuestion = {
  attempt_question_id: string;
  question_id: string;
  subject_id: string;
  subject_name: string;
  item_no: number;
  stem: string;
  options: QuestionOption[];
  selected_label: OptionLabel | null;
  /** Already used "Show answer" — the item stays locked across a resume. */
  revealed: boolean;
};

export default async function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const device = await checkDevice();
  if (!device.allowed) {
    return <DeviceLimitBlock maxDevices={device.maxDevices} currentDeviceId={device.deviceId} />;
  }

  const { id } = await params;
  const supabase = await createClient();

  // Attempt (owner-scoped via RLS) + its template settings.
  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select(
      "id, status, started_at, template_id, exam_templates(title, mode, category, time_limit_minutes)"
    )
    .eq("id", id)
    .single();

  if (!attempt) notFound();

  // Already finished — go straight to results.
  if (attempt.status === "submitted") redirect(`/results/${id}`);

  const template = attempt.exam_templates as unknown as {
    title: string;
    mode: ExamMode;
    category: ExamCategory;
    time_limit_minutes: number | null;
  };

  const { data: questions, error } = await supabase.rpc("get_attempt_questions", {
    p_attempt_id: id,
  });
  if (error) throw new Error(error.message);

  // Compute the deadline for timed mock exams.
  const timing = {
    status: attempt.status,
    startedAt: attempt.started_at,
    mode: template.mode,
    timeLimitMinutes: template.time_limit_minutes,
  };
  const deadlineMs = attemptDeadlineMs(timing);

  const rows = (questions ?? []) as RpcQuestion[];

  // The deadline is wall-clock, so it keeps running while the student is away.
  // Decide what an expired attempt does here rather than letting the runner
  // mount into a dead end.
  if (isAttemptExpired(timing)) {
    const answered = rows.filter((r) => r.selected_label != null).length;

    if (answered > 0) {
      // A real sitting: grade what they managed and show the result. Doing this
      // server-side is more reliable than the runner's auto-submit, which needs
      // the tab to stay open long enough to fire.
      await supabase.rpc("submit_attempt", { p_attempt_id: id });
      redirect(`/results/${id}`);
    }

    // Nothing answered — no score worth keeping. Offer a free restart.
    return <ExpiredAttempt attemptId={id} title={template.title} />;
  }

  return (
    <ExamRunner
      attemptId={id}
      title={template.title}
      mode={template.mode}
      category={template.category}
      deadlineMs={deadlineMs}
      questions={rows}
      isIosApp={await isIosApp()}
    />
  );
}
