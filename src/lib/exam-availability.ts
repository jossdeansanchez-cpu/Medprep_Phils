import type { ExamCategory } from "@/lib/categories";

/** Active question count per category per subject — the pool start_attempt draws from. */
export type Coverage = Record<string, Record<string, number>>;

export type CoverageRow = {
  subject_id: string;
  category: ExamCategory;
  n: number | string; // RPC returns bigint as string
};

/** Build the nested {category:{subjectId:n}} map from admin_question_coverage() rows. */
export function buildCoverage(rows: CoverageRow[]): Coverage {
  const cov: Coverage = {};
  for (const r of rows) {
    (cov[r.category] ??= {})[r.subject_id] = Number(r.n);
  }
  return cov;
}

export type Availability = {
  available: number;
  shortfall: number;
  shortSubjects: { subjectId: string; have: number; need: number }[];
};

/**
 * How many questions can actually be drawn for an exam, given its category,
 * subject scope, and sizing mode — compared against what's requested.
 *
 * - total mode: available = sum across scoped subjects; shortfall vs requested.
 * - per_subject mode: each scoped subject needs `qps`; shortSubjects lists the
 *   ones that fall short, and `available` is the binding (minimum) subject count.
 */
export function computeAvailability(params: {
  mode: "total" | "per_subject";
  category: ExamCategory;
  requested: number;
  qps: number;
  scopedSubjectIds: string[];
  coverage: Coverage;
}): Availability {
  const byCat = params.coverage[params.category] ?? {};
  const counts = params.scopedSubjectIds.map((id) => ({ id, n: byCat[id] ?? 0 }));

  if (params.mode === "total") {
    const available = counts.reduce((sum, c) => sum + c.n, 0);
    return {
      available,
      shortfall: Math.max(0, params.requested - available),
      shortSubjects: [],
    };
  }

  // per_subject
  const shortSubjects = counts
    .filter((c) => c.n < params.qps)
    .map((c) => ({ subjectId: c.id, have: c.n, need: params.qps - c.n }));
  const available = counts.length ? Math.min(...counts.map((c) => c.n)) : 0;
  return {
    available,
    shortfall: shortSubjects.reduce((sum, s) => sum + s.need, 0),
    shortSubjects,
  };
}
