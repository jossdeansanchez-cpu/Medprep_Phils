import Link from "next/link";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startAttempt } from "@/lib/exam";
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
    <>
      <Nav />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Study mode</h1>
          <p className="text-[var(--muted)]">
            Untimed practice — see the correct answer and rationale right after you answer.
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="card text-sm text-[var(--muted)]">
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
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <div key={t.id} className="card flex flex-col justify-between gap-3">
                <div>
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
      </main>
    </>
  );
}
