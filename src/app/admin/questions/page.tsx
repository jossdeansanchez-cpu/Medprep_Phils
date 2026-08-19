import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { setQuestionActive } from "@/app/admin/actions";
import QuestionCategory from "./QuestionCategory";
import DeleteQuestion from "./DeleteQuestion";
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type ExamCategory,
} from "@/lib/categories";
import { TRACK_ORDER, TRACK_LABELS, coerceTrack } from "@/lib/tracks";
import type { QuestionOption, Subject } from "@/lib/types";

type QRow = {
  id: string;
  stem: string;
  options: QuestionOption[];
  correct_label: string;
  is_active: boolean;
  category: ExamCategory;
  created_at: string;
  subjects: { name: string } | null;
};

function isCategory(v: string | undefined): v is ExamCategory {
  return !!v && (CATEGORY_ORDER as string[]).includes(v);
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; category?: string; track?: string }>;
}) {
  const { subject, category, track } = await searchParams;
  const supabase = await createClient();

  // Each track has its own bank, so one is always selected rather than showing
  // both interleaved. PLE is the default because it's the older, larger bank.
  const activeTrack = coerceTrack(track);

  const { data: subjectsData } = await supabase.from("subjects").select("*").order("order");
  const subjects = (subjectsData ?? []) as Subject[];
  const trackSubjects = subjects.filter((s) => s.track === activeTrack);
  // Slugs are unique per track, not globally, so the track has to narrow this.
  const activeSubject = trackSubjects.find((s) => s.slug === subject);
  const activeCategory = isCategory(category) ? category : undefined;

  // Preserve the other filters when building a filter link.
  const linkWith = (next: { subject?: string; category?: string; track?: string }) => {
    const params = new URLSearchParams();
    // Switching track invalidates the subject filter — that subject belongs to
    // the track being left.
    const switchingTrack = next.track != null && next.track !== activeTrack;
    const sub = switchingTrack ? "" : (next.subject ?? activeSubject?.slug);
    const cat = next.category ?? activeCategory;
    const trk = next.track ?? activeTrack;
    if (sub) params.set("subject", sub);
    if (cat) params.set("category", cat);
    if (trk) params.set("track", trk);
    const qs = params.toString();
    return `/admin/questions${qs ? `?${qs}` : ""}`;
  };

  let query = supabase
    .from("questions")
    // !inner so the track filter on the joined row actually restricts the result.
    .select(
      "id, stem, options, correct_label, is_active, category, created_at, subjects!inner(name, track)"
    )
    .is("deleted_at", null) // hide deleted questions; their row is kept for history
    .eq("subjects.track", activeTrack)
    .order("created_at", { ascending: false })
    .limit(300);
  if (activeSubject) query = query.eq("subject_id", activeSubject.id);
  if (activeCategory) query = query.eq("category", activeCategory);

  const { data } = await query;
  const questions = (data ?? []) as unknown as QRow[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">
          Question Bank
          <span className="ml-2 badge bg-black/[0.06]">{TRACK_LABELS[activeTrack]}</span>
        </h1>
        <div className="flex items-center gap-2">
          {/* Track rides along so the create form opens on the bank you're
              already looking at, rather than defaulting back to PLE. */}
          <Link
            href={`/admin/questions/new?track=${activeTrack}`}
            className="btn-primary text-sm"
          >
            + New question
          </Link>
          <Link href="/admin/upload" className="btn-outline text-sm">
            Bulk upload CSV
          </Link>
        </div>
      </div>

      {/* The two authoring routes do different jobs, and which to use isn't
          guessable — CSV physically cannot carry a figure. */}
      <div className="rounded-xl border border-[var(--border)] bg-black/[0.02] px-4 py-3 text-sm">
        <p className="font-medium">Two ways to add questions</p>
        <ul className="mt-1 space-y-1 text-[var(--muted)]">
          <li>
            <strong className="text-[var(--fg)]">+ New question</strong> — one at a
            time, and the <strong className="text-[var(--fg)]">only way to attach
            images</strong>. Use this for NMAT Perceptual Acuity, where the stem and
            the answer choices are figures.
          </li>
          <li>
            <strong className="text-[var(--fg)]">Bulk upload CSV</strong> — many
            text-only questions at once. A spreadsheet can&apos;t carry images.
          </li>
        </ul>
      </div>

      {/* Track filter — each track is a separate bank */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Track
        </span>
        {TRACK_ORDER.map((t) => (
          <Link
            key={t}
            href={linkWith({ track: t })}
            className={`badge ${
              activeTrack === t ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"
            }`}
          >
            {TRACK_LABELS[t]}
          </Link>
        ))}
      </div>

      {/* Exam-type filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Type
        </span>
        <Link
          href={linkWith({ category: "" })}
          className={`badge ${!activeCategory ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"}`}
        >
          All
        </Link>
        {CATEGORY_ORDER.map((c) => (
          <Link
            key={c}
            href={linkWith({ category: c })}
            className={`badge ${
              activeCategory === c ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"
            }`}
          >
            {CATEGORY_LABELS[c]}
          </Link>
        ))}
      </div>

      {/* Subject filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Subject
        </span>
        <Link
          href={linkWith({ subject: "" })}
          className={`badge ${!activeSubject ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"}`}
        >
          All
        </Link>
        {trackSubjects.map((s) => (
          <Link
            key={s.id}
            href={linkWith({ subject: s.slug })}
            className={`badge ${
              activeSubject?.id === s.id ? "bg-[var(--primary)] text-white" : "bg-black/[0.05]"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)]">
        {questions.length} question{questions.length === 1 ? "" : "s"}. Set each question&apos;s
        exam type so it&apos;s drawn into the matching exams.
      </p>

      {questions.length === 0 ? (
        <div className="card text-sm">
          <p className="font-medium">
            No {TRACK_LABELS[activeTrack]} questions
            {activeSubject ? ` in ${activeSubject.name}` : ""} yet.
          </p>
          <p className="mt-1 text-[var(--muted)]">
            {activeTrack === "nmat"
              ? "Perceptual Acuity items need figures — build those one at a time. Verbal, Quantitative and the other text subjects can come from a spreadsheet."
              : "Add one by hand, or bring in a batch from a spreadsheet."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/admin/questions/new?track=${activeTrack}`}
              className="btn-primary text-sm"
            >
              + New question
            </Link>
            <Link href="/admin/upload" className="btn-outline text-sm">
              Bulk upload CSV
            </Link>
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-[var(--border)] p-0">
          {questions.map((q) => (
            <div key={q.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--muted)]">
                  {q.subjects?.name} · answer {q.correct_label} · uploaded{" "}
                  {new Date(q.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {!q.is_active && (
                    <span className="badge ml-2 bg-black/[0.06]">inactive</span>
                  )}
                </p>
                <p className="truncate text-sm font-medium">{q.stem}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <QuestionCategory id={q.id} category={q.category} />
                <Link href={`/admin/questions/${q.id}/edit`} className="btn-ghost text-xs">
                  Edit
                </Link>
                <form action={setQuestionActive.bind(null, q.id, !q.is_active)}>
                  <button className="btn-ghost text-xs" type="submit">
                    {q.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <DeleteQuestion id={q.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
