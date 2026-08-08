/**
 * Neutral wording for the plan-quota errors raised by the database.
 *
 * `start_attempt` and `save_answer` raise their gate messages as Postgres
 * exceptions, and ExamRunner renders `res.error` verbatim. Those strings say
 * things like "Upgrade to unlock them" — which is plan marketing in an error
 * toast on the web, and on iOS is exactly the steering App Store Guideline
 * 3.1.1 prohibits. The text originates in SQL, so it cannot be varied at the
 * source per platform.
 *
 * Rewriting here, for every platform, keeps the database free of UI copy and
 * means a new call site can't reintroduce the wording by accident.
 */

type Rule = { match: RegExp; text: string };

const RULES: Rule[] = [
  {
    // 'Mock exams need a paid plan. Upgrade to unlock them.'
    match: /mock exams need a paid plan/i,
    text: "Mock exams aren't included in your current plan.",
  },
  {
    // 'You have used all N mock exams on your plan this period. Upgrade for more.'
    match: /used all .* mock exams/i,
    text: "You've used all the mock exams included in your plan this month. They reset on the 1st.",
  },
  {
    // 'The free plan includes N exam per month. Upgrade to keep practising.'
    match: /free plan includes/i,
    text: "You've used the exams included in your plan this month. They reset on the 1st.",
  },
];

/**
 * Map a database error to student-facing copy. Unrecognised messages pass
 * through unchanged — better a raw message than a wrong one — except that any
 * stray "Upgrade"/"Subscribe" wording is stripped as a backstop, since an
 * unmapped gate message reaching the iOS app is a compliance problem.
 */
export function planMessage(dbMessage: string): string {
  for (const rule of RULES) {
    if (rule.match.test(dbMessage)) return rule.text;
  }
  if (/\b(upgrade|subscribe)\b/i.test(dbMessage)) {
    return "That isn't included in your current plan.";
  }
  return dbMessage;
}
