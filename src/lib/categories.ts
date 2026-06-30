export type ExamCategory = "daily_practice" | "weekly_practice" | "mock_exam";

export const CATEGORY_ORDER: ExamCategory[] = [
  "daily_practice",
  "weekly_practice",
  "mock_exam",
];

export const CATEGORY_LABELS: Record<ExamCategory, string> = {
  daily_practice: "Daily practice",
  weekly_practice: "Weekly practice",
  mock_exam: "Mock exam",
};

export const CATEGORY_BLURB: Record<ExamCategory, string> = {
  daily_practice: "Short timed sets for everyday review.",
  weekly_practice: "Longer timed sets to consolidate the week.",
  mock_exam: "Full timed board simulation, PLE-style scoring.",
};

export function categoryLabel(c: ExamCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}
