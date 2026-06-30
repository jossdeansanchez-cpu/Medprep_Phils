import { redirect } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startAttempt } from "@/lib/exam";
import { CATEGORY_BLURB, type ExamCategory } from "@/lib/categories";
import type { ExamTemplate } from "@/lib/types";

const SECTIONS: { category: ExamCategory; title: string; icon: string }[] = [
  { category: "daily_practice", title: "Daily practice", icon: "📅" },
  { category: "weekly_practice", title: "Weekly practice", icon: "🗓️" },
];

export default async function PracticePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_templates")
    .select("*")
    .in("category", ["daily_practice", "weekly_practice"])
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as ExamTemplate[];
  const byCategory = (c: ExamCategory) => templates.filter((t) => t.category === c);

  return (
    <AppShell profile={profile} greeting="Stay sharp between mock exams" title="Practice">
      <p className="mb-6 -mt-3 text-[var(--muted)]">
        Timed, scored practice sets across all 12 subjects. Open to every student.
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
        <div className="space-y-8">
          {SECTIONS.map((sec) => {
            const items = byCategory(sec.category);
            if (items.length === 0) return null;
            return (
              <section key={sec.category}>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold">
                    {sec.icon} {sec.title}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">{CATEGORY_BLURB[sec.category]}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((t) => (
                    <div key={t.id} className="glass flex flex-col justify-between gap-3 p-5">
                      <div>
                        <h3 className="font-semibold">{t.title}</h3>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {t.questions_per_subject} questions / subject ·{" "}
                          {t.time_limit_minutes ? `${t.time_limit_minutes} min` : "untimed"}
                        </p>
                      </div>
                      <form action={startAttempt.bind(null, t.id)}>
                        <button type="submit" className="btn-primary w-full">
                          Start
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
