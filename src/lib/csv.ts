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

/**
 * The answer section bleeding into the last option. "DISCUSSION ..." has
 * printed a full answer key inside a wrong choice. Case-sensitive on purpose:
 * options that talk about "the rationale for X" are real content.
 */
const RATIONALE_BLEED = /\s+(RATIONALE\s*$|DISCUSSION\b[\s\S]*$)/;

export function stripRationaleBleed(s: string): string {
  return s.replace(RATIONALE_BLEED, "").trim();
}

/**
 * Writers tend to clarify only the right answer — "The spleen (within the
 * splenorenal ligament)" — so a bracketed gloss marks the correct choice.
 * Mirrors public.strip_option_gloss() from migration 0042. A bracket survives
 * when it follows no space or an operator, is followed by an operator or
 * another bracket, or holds [ ] ^ =, which keeps (2x − 6)(x + 3), t(9;22) and
 * ([SO2]^2 [O2]).
 */
const OPTION_GLOSS = /(?<=[^\s(\/^*×+−=])\s+\([^()[\]^=]*\)(?!\s*[(\/^*×+−=])/g;

export function stripOptionGloss(s: string): string {
  if (!s.includes("(")) return s;
  return s.replace(OPTION_GLOSS, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Strip glosses across a question's options, or leave them all alone: skipped
 * when it would empty an option, touch nested brackets, or make two options
 * identical, as in "every four (6) hours" vs "every four (4) hours".
 */
export function stripOptionGlosses(options: QuestionOption[]): QuestionOption[] {
  const stripped = options.map((o) => (o.text ? { ...o, text: stripOptionGloss(o.text) } : o));
  const before = options.flatMap((o) => (o.text != null ? [o.text] : []));
  const after = stripped.flatMap((o) => (o.text != null ? [o.text] : []));
  const unsafe =
    after.some((t) => t === "") ||
    before.some((t) => /\([^()]*\(/.test(t)) ||
    new Set(after).size < new Set(before).size;
  return unsafe ? options : stripped;
}

/** A cell the spreadsheet evaluated as a formula and failed on: "+120 kJ" → #ERROR!. */
const SPREADSHEET_ERROR = /^#(ERROR!|REF!|VALUE!|NAME\?|N\/A|DIV\/0!|NUM!|NULL!)$/;

/** What a mis-decoded ’ – ° ö β turns into. Once it's in the text the original is gone. */
const REPLACEMENT_CHAR = "�";

// sheet_to_json hands numeric cells back as numbers, not strings.
function cellText(s: string | number | undefined): string {
  return String(s ?? "").trim();
}

function norm(s: string | number | undefined): string {
  return stripBoilerplate(cellText(s));
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

    const rowErrors: string[] = [];

    // Before any cleaning, so the message quotes the cell as the file has it.
    // Both faults destroy the original text, so the row is refused rather than
    // imported with a broken option.
    for (const col of CSV_HEADERS) {
      const cell = cellText(r[col]);
      if (SPREADSHEET_ERROR.test(cell)) {
        rowErrors.push(
          `${col} is a spreadsheet error (${cell}) — format the column as text so values like +120 kJ aren't read as formulas`
        );
      } else if (cell.includes(REPLACEMENT_CHAR)) {
        rowErrors.push(`${col} has unreadable characters (${REPLACEMENT_CHAR}) — re-save the file as "CSV UTF-8"`);
      }
    }

    const subjectName = norm(r.subject);
    const stem = norm(r.stem);
    const correct = norm(r.correct).toUpperCase();

    const subject = byName.get(subjectName.toLowerCase());
    if (!subjectName) rowErrors.push("missing subject");
    else if (!subject) rowErrors.push(`unknown subject "${subjectName}"`);

    if (!stem) rowErrors.push("missing stem");

    const parsedOptions: QuestionOption[] = [];
    for (const label of LABELS) {
      const text = stripRationaleBleed(norm(r[`option_${label.toLowerCase()}`]));
      if (text) parsedOptions.push({ label, text });
    }
    const options = stripOptionGlosses(parsedOptions);
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
