import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, hasAtLeast } from "@/lib/billing/entitlements";
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

export default async function ExamsCatalog() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_templates")
    .select("*")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  const { plan } = await getEntitlements();
  const canMock = hasAtLeast(plan, "pro");

  const templates = (data ?? []) as ExamTemplate[];
  const newest = templates.slice(0, 3);
  const byCategory = (c: ExamCategory) => templates.filter((t) => t.category === c);

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {newest.map((t) => (
                <ExamCard key={t.id} t={t} canMock={canMock} />
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
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((t) => (
                      <ExamCard key={t.id} t={t} canMock={canMock} />
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
