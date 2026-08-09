import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import UpgradeGate from "@/components/UpgradeGate";
import PresetCard from "@/components/PresetCard";
import PresetForm from "./PresetForm";
import { createPreset } from "./actions";
import { PRESET_MAX_PER_STUDENT } from "@/lib/presets";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, hasAtLeast } from "@/lib/billing/entitlements";
import { isIosApp } from "@/lib/platform/server";
import {
  buildCoverage,
  computeAvailability,
  type CoverageRow,
} from "@/lib/exam-availability";
import type { ExamTemplate, Subject } from "@/lib/types";

/**
 * Where a Pro or Max Pro student builds and keeps their own short practice
 * exams. The admin's daily/weekly sets run long; this is the escape hatch for
 * students who can't sit 100 items in one go.
 */
export default async function PresetsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { plan } = await getEntitlements();
  const entitled = hasAtLeast(plan, "pro") || profile.role === "admin";

  // Reachable by direct URL even though the nav item is hidden below Pro.
  if (!entitled) {
    return (
      <AppShell profile={profile} greeting="Build your own exams" title="Quiz Maker">
        <UpgradeGate
          web={{
            title: "Quiz Maker is a Pro feature",
            body: "Upgrade to Pro to build your own daily and weekly exams — you pick how many questions, and which subjects they come from.",
          }}
          ios={{
            title: "Quiz Maker isn't included in your plan",
            body: "Building your own daily and weekly exams, with your own question count, comes with the Pro and Max Pro plans.",
          }}
        />
      </AppShell>
    );
  }

  const supabase = await createClient();
  const [{ data: presetData }, { data: subjectData }, { data: coverageRows }, iosApp] =
    await Promise.all([
      supabase
        .from("exam_templates")
        .select("*")
        .eq("owner_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("subjects").select("*").order("order"),
      // The student-callable twin of admin_question_coverage — public.questions
      // is admin-only RLS, so without this the form has no idea how big the
      // pool is.
      supabase.rpc("my_question_coverage"),
      isIosApp(),
    ]);

  const presets = (presetData ?? []) as ExamTemplate[];
  const subjects = (subjectData ?? []) as Subject[];
  const coverage = buildCoverage((coverageRows ?? []) as CoverageRow[]);
  const atCap = presets.length >= PRESET_MAX_PER_STUDENT;

  // How many questions each preset can actually draw today. The pool can shrink
  // after a preset is saved (an admin retires questions), and a short exam is
  // worth flagging on the card.
  const availableFor = (p: ExamTemplate) =>
    computeAvailability({
      mode: "total",
      category: p.category,
      requested: p.total_questions ?? 0,
      qps: 1,
      scopedSubjectIds:
        p.subject_ids && p.subject_ids.length > 0
          ? p.subject_ids
          : subjects.map((s) => s.id),
      coverage,
    }).available;

  return (
    <AppShell profile={profile} greeting="Exams you built" title="Quiz Maker">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="mb-3 text-lg font-semibold">New custom exam</h2>
          {atCap ? (
            <div className="glass p-5 text-sm text-[var(--muted)]">
              You have {PRESET_MAX_PER_STUDENT} saved exams, which is the maximum.
              Delete one to make room for another.
            </div>
          ) : (
            <PresetForm
              action={createPreset}
              subjects={subjects}
              coverage={coverage}
              submitLabel="Save exam"
            />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Saved exams
            <span className="ml-2 text-sm font-normal text-[var(--muted)]">
              {presets.length}/{PRESET_MAX_PER_STUDENT}
            </span>
          </h2>
          {presets.length === 0 ? (
            <div className="glass p-5 text-sm text-[var(--muted)]">
              Nothing saved yet. Build a short set on the left — 10 or 20 questions
              is a good place to start — and it will show up here, ready to take
              again whenever you want.
            </div>
          ) : (
            <div className="stagger grid gap-4 sm:grid-cols-2">
              {presets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  iosApp={iosApp}
                  locked={false}
                  available={availableFor(p)}
                  manage={{ subjects, coverage }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
