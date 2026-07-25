import type { OptionLabel, QuestionOption, Subject } from "@/lib/types";
import type { ExamCategory } from "@/lib/categories";

/** Expected column headers in the upload template (case-insensitive). */
export const CSV_HEADERS = [
  "subject",
  "category",
  "stem",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "option_e",
  "correct",
  "explanation",
] as const;

export type RawRow = Record<string, string | undefined>;

export interface ValidQuestion {
  subject_id: string;
  subject_name: string;
  category: ExamCategory;
  stem: string;
  options: QuestionOption[];
  correct_label: OptionLabel;
  explanation: string | null;
}

/** Map a free-text category cell to an exam category. Blank defaults to daily. */
export function parseCategory(raw: string): ExamCategory | null {
  const v = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (v === "") return "daily_practice";
  if (["daily", "dailypractice"].includes(v)) return "daily_practice";
  if (["weekly", "weeklypractice"].includes(v)) return "weekly_practice";
  if (["mock", "mockexam", "mockexams"].includes(v)) return "mock_exam";
  return null;
}

export interface RowError {
  row: number; // 1-based data row (excludes header)
  message: string;
}

export interface ValidationResult {
  valid: ValidQuestion[];
  errors: RowError[];
  total: number;
}

const LABELS: OptionLabel[] = ["A", "B", "C", "D", "E"];

/**
 * Question banks scanned out of PDF handouts drag page furniture along with the
 * text — a page break followed by the review centre's header/footer gets glued
 * onto whatever field was last on the page (usually the final option), turning
 * a 3-word answer into a 700-character blob. Cut everything from the first such
 * marker onward.
 */
const BOILERPLATE = /\s*(={2,}\s*PAGE BREAK\s*={2,}|TOPNOTCH MEDICAL BOARD PREP|For inquiries visit)[\s\S]*$/i;

export function stripBoilerplate(s: string): string {
  return s.replace(BOILERPLATE, "").trim();
}

function norm(s: string | undefined): string {
  return stripBoilerplate((s ?? "").trim());
}

/** Validate parsed rows against the known subject list. Pure — runs anywhere. */
export function validateRows(rows: RawRow[], subjects: Subject[]): ValidationResult {
  const byName = new Map<string, Subject>();
  for (const s of subjects) {
    byName.set(s.name.toLowerCase(), s);
    byName.set(s.slug.toLowerCase(), s);
  }

  const valid: ValidQuestion[] = [];
  const errors: RowError[] = [];

  rows.forEach((raw, i) => {
    const rowNum = i + 1;
    // Lowercase all keys so header casing/spacing doesn't matter.
    const r: RawRow = {};
    for (const [k, v] of Object.entries(raw)) r[k.trim().toLowerCase()] = v;

    const subjectName = norm(r.subject);
    const stem = norm(r.stem);
    const correct = norm(r.correct).toUpperCase();

    const rowErrors: string[] = [];

    const subject = byName.get(subjectName.toLowerCase());
    if (!subjectName) rowErrors.push("missing subject");
    else if (!subject) rowErrors.push(`unknown subject "${subjectName}"`);

    if (!stem) rowErrors.push("missing stem");

    const options: QuestionOption[] = [];
    for (const label of LABELS) {
      const text = norm(r[`option_${label.toLowerCase()}`]);
      if (text) options.push({ label, text });
    }
    if (options.length < 2) rowErrors.push("at least 2 options required");

    if (!correct) rowErrors.push("missing correct answer");
    else if (!LABELS.includes(correct as OptionLabel))
      rowErrors.push(`correct must be one of A–E (got "${correct}")`);
    else if (!options.some((o) => o.label === correct))
      rowErrors.push(`correct answer ${correct} has no matching option`);

    const category = parseCategory(norm(r.category));
    if (category === null)
      rowErrors.push(`category must be daily, weekly, or mock (got "${norm(r.category)}")`);

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join("; ") });
      return;
    }

    valid.push({
      subject_id: subject!.id,
      subject_name: subject!.name,
      category: category!,
      stem,
      options,
      correct_label: correct as OptionLabel,
      explanation: norm(r.explanation) || null,
    });
  });

  return { valid, errors, total: rows.length };
}
