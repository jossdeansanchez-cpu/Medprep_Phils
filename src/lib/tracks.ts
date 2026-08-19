// Which exam a student is preparing for.
//
// A student is on exactly one track at a time, stored on profiles.track. A
// subscription is bought against a track too, and public.effective_plan()
// reports 'free' whenever the two disagree — so buying NMAT Pro does not unlock
// PLE. See supabase/migrations/0037_exam_tracks.sql.

export type ExamTrack = "ple" | "nmat";

export const TRACK_ORDER: ExamTrack[] = ["ple", "nmat"];

export const DEFAULT_TRACK: ExamTrack = "ple";

export const TRACK_LABELS: Record<ExamTrack, string> = {
  ple: "PLE",
  nmat: "NMAT",
};

/** Spelled out, for headings and marketing copy. */
export const TRACK_FULL_NAMES: Record<ExamTrack, string> = {
  ple: "Physician Licensure Exam",
  nmat: "National Medical Admission Test",
};

export const TRACK_BLURB: Record<ExamTrack, string> = {
  ple: "The PRC board exam taken after medical school.",
  nmat: "The entrance exam taken before medical school.",
};

/** How many subjects each track covers — used in plan features and fact strips. */
export const TRACK_SUBJECT_COUNT: Record<ExamTrack, number> = {
  ple: 12,
  nmat: 8,
};

export function trackLabel(t: ExamTrack): string {
  return TRACK_LABELS[t] ?? t;
}

export function trackFullName(t: ExamTrack): string {
  return TRACK_FULL_NAMES[t] ?? t;
}

/** Narrow untrusted input (form fields, query strings) to a track. */
export function parseTrack(value: unknown): ExamTrack | null {
  return value === "ple" || value === "nmat" ? value : null;
}

/** Same, but never fails — for places where a missing value should mean PLE. */
export function coerceTrack(value: unknown): ExamTrack {
  return parseTrack(value) ?? DEFAULT_TRACK;
}
