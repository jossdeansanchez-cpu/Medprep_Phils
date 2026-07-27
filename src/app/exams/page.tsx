import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, getExamUsage, hasAtLeast, remaining } from "@/lib/billing/entitlements";
import ExamCard from "@/components/ExamCard";
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  CATEGORY_BLURB,
  type ExamCategory,
} from "@/lib/categories";
import type { ExamTemplate } from "@/lib/types";

const ICONS: Record<ExamCategory, string> = {
  daily_practice: "📅",
  weekly_practice: "🗓️",
  mock_exam: "🩺",
};

export default async function ExamsCatalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_templates")
    .select("*")
    .is("deleted_at", null)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const [{ plan }, usage] = await Promise.all([getEntitlements(), getExamUsage()]);
  // Exams left this period, per kind — drives the card CTA.
  const leftMock = remaining(usage, true);
  const leftOther = remaining(usage, false);

  const templates = (data ?? []) as ExamTemplate[];
  const newest = templates.slice(0, 3);
  const byCategory = (c: ExamCategory) => templates.filter((t) => t.category === c);

  // Search view: flat list of exams whose title (or category) matches the query.
  if (query) {
    const ql = query.toLowerCase();
    const results = templates.filter(
      (t) =>
        t.title.toLowerCase().includes(ql) ||
        CATEGORY_LABELS[t.category].toLowerCase().includes(ql)
    );
    return (
      <AppShell profile={profile} greeting="Search results" title="Exams">
        <div className="mb-4 flex items-center gap-2 text-sm text-[var(--muted)]">
          <span>
            {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
          </span>
          <Link href="/exams" className="text-[var(--primary)]">
            Clear
          </Link>
        </div>
        {results.length === 0 ? (
          <div className="glass p-5 text-sm text-[var(--muted)]">
            No exams match “{query}”.
          </div>
        ) : (
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((t) => (
              <ExamCard
                  key={t.id}
                  t={t}
                  remainingForKind={t.category === "mock_exam" ? leftMock : leftOther}
                />
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell profile={profile} greeting="Pick an exam to take" title="Exams">
      {templates.length === 0 ? (
        <div className="glass p-5 text-sm text-[var(--muted)]">
          No exams published yet.
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
        <div className="space-y-9">
          {/* Recently added */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">Recently added</h2>
            <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {newest.map((t) => (
                <ExamCard
                  key={t.id}
                  t={t}
                  remainingForKind={t.category === "mock_exam" ? leftMock : leftOther}
                />
              ))}
            </div>
          </section>

          {/* By category */}
          {CATEGORY_ORDER.map((c) => {
            const items = byCategory(c);
            return (
              <section key={c}>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold">
                    {ICONS[c]} {CATEGORY_LABELS[c]}
                    <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                      ({items.length})
                    </span>
                  </h2>
                  <p className="text-sm text-[var(--muted)]">{CATEGORY_BLURB[c]}</p>
                </div>
                {items.length === 0 ? (
                  <p className="glass p-4 text-sm text-[var(--muted)]">No exams here yet.</p>
                ) : (
                  <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((t) => (
                      <ExamCard
                  key={t.id}
                  t={t}
                  remainingForKind={t.category === "mock_exam" ? leftMock : leftOther}
                />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
