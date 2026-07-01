import { redirect, notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ExamRunner from "@/components/ExamRunner";
import DeviceLimitBlock from "@/components/DeviceLimitBlock";
import { checkDevice } from "@/lib/devices";
import type { ExamMode, OptionLabel, QuestionOption } from "@/lib/types";

type RpcQuestion = {
  attempt_question_id: string;
  question_id: string;
  subject_id: string;
  subject_name: string;
  item_no: number;
  stem: string;
  options: QuestionOption[];
  selected_label: OptionLabel | null;
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
    .select("id, status, started_at, template_id, exam_templates(title, mode, time_limit_minutes)")
    .eq("id", id)
    .single();

  if (!attempt) notFound();

  // Already finished — go straight to results.
  if (attempt.status === "submitted") redirect(`/results/${id}`);

  const template = attempt.exam_templates as unknown as {
    title: string;
    mode: ExamMode;
    time_limit_minutes: number | null;
  };

  const { data: questions, error } = await supabase.rpc("get_attempt_questions", {
    p_attempt_id: id,
  });
  if (error) throw new Error(error.message);

  // Compute remaining seconds for timed mock exams.
  let deadlineMs: number | null = null;
  if (template.mode === "mock" && template.time_limit_minutes) {
    deadlineMs =
      new Date(attempt.started_at).getTime() + template.time_limit_minutes * 60_000;
  }

  return (
    <ExamRunner
      attemptId={id}
      title={template.title}
      mode={template.mode}
      deadlineMs={deadlineMs}
      questions={(questions ?? []) as RpcQuestion[]}
    />
  );
}
