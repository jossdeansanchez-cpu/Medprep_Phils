import type { QuestionOption } from "@/lib/types";

/**
 * A correct option far longer than every wrong one gives the answer away:
 * students learn to pick the longest choice without reading the question.
 *
 * Mirrors public.has_long_correct_answer() and
 * public.correct_answer_length_ratio() from migration 0044. The database flag
 * drives the Question Bank filter; this drives the upload preview and the
 * question form. Change the thresholds in both places together.
 */
export const LONG_ANSWER_RATIO = 1.5;
export const LONG_ANSWER_MIN_GAP = 15;

export type AnswerLengthCheck = { long: boolean; ratio: number | null };

// Postgres length() counts characters; String#length counts UTF-16 units.
const chars = (s: string) => [...s].length;

export function checkAnswerLength(
  options: Pick<QuestionOption, "label" | "text">[],
  correctLabel: string
): AnswerLengthCheck {
  const correct = options.find((o) => o.label === correctLabel)?.text;
  const others = options
    .filter((o) => o.label !== correctLabel && o.text != null)
    .map((o) => chars(o.text!));
  // Image-only choices have nothing to compare; SQL's max() over no text is null.
  if (correct == null || others.length === 0) return { long: false, ratio: null };

  const c = chars(correct);
  const d = Math.max(...others);
  return {
    long: c >= LONG_ANSWER_RATIO * d && c - d >= LONG_ANSWER_MIN_GAP,
    ratio: c === 0 || d === 0 ? null : Math.round((c / d) * 100) / 100,
  };
}
