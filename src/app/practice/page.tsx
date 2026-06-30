import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startAttempt } from "@/lib/exam";
import Link from "next/link";
import type { ExamTemplate } from "@/lib/types";

export default async function PracticePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_templates")
    .select("*")
    .eq("mode", "practice")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as ExamTemplate[];

  return (
    <AppShell profile={profile} greeting="Practice at your own pace" title="Study mode">
      <p className="mb-5 -mt-3 text-[var(--muted)]">
        Untimed practice — see the correct answer and rationale right after you answer.
      </p>

      {templates.length === 0 ? (
        <div className="glass p-5 text-sm text-[var(--muted)]">
          No practice sets published yet.
          {profile.role === "admin" && (
            <>
              {" "}
              <Link href="/admin/exams" className="text-[var(--primary)] underline">
                Create one in the admin area.
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="glass flex flex-col justify-between gap-3 p-5">
              <div>
                <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary)]/10 text-xl">
                  📚
                </div>
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {t.questions_per_subject} questions / subject · untimed
                </p>
              </div>
              <form action={startAttempt.bind(null, t.id)}>
                <button type="submit" className="btn-primary w-full">
                  Start practice
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
