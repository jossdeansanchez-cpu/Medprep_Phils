import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { QuestionOption, SignedQuestionOption } from "@/lib/types";

export const QUESTION_IMAGE_BUCKET = "question-images";

/** Untimed exams still need a bound; two hours outlasts any realistic sitting. */
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;
/** Clock skew, a slow first render, and the student reading the last question. */
const TTL_BUFFER_SECONDS = 15 * 60;

/**
 * How long an exam's image URLs should stay valid.
 *
 * Tied to the exam's own time limit so a link dies at roughly the same time the
 * attempt does — the images are the paid product, and a URL that outlives the
 * exam is a URL that can be shared.
 */
export function examImageTtl(timeLimitMinutes: number | null): number {
  if (!timeLimitMinutes || timeLimitMinutes <= 0) return DEFAULT_TTL_SECONDS;
  return timeLimitMinutes * 60 + TTL_BUFFER_SECONDS;
}

/**
 * Mint signed URLs for a batch of object paths.
 *
 * Uses the service-role client deliberately. The bucket's RLS only admits
 * admins, so a student's own session could never sign these — but by the time we
 * get here the caller has already proven, via get_attempt_questions /
 * get_attempt_review, that the attempt belongs to them. The elevated client is
 * what turns "you may sit this exam" into "you may see these figures".
 *
 * Only ever pass paths that came out of one of those RPCs.
 */
export async function signImagePaths(
  paths: string[],
  ttlSeconds: number
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const signed = new Map<string, string>();
  if (unique.length === 0) return signed;

  // One round trip for the whole exam rather than one per figure — a 60-item PA
  // paper can carry 300 images.
  const { data, error } = await createAdminClient()
    .storage.from(QUESTION_IMAGE_BUCKET)
    .createSignedUrls(unique, ttlSeconds);

  if (error || !data) return signed;

  for (const row of data) {
    // Per-object errors are reported in-band; skip those and let the UI fall
    // back to text rather than failing the whole exam over one missing figure.
    if (row.signedUrl && row.path) signed.set(row.path, row.signedUrl);
  }
  return signed;
}

/** Every image path referenced by a set of rows, stem and options alike. */
function collectPaths(
  rows: { stem_image_path?: string | null; options?: QuestionOption[] }[]
): string[] {
  const paths: string[] = [];
  for (const row of rows) {
    if (row.stem_image_path) paths.push(row.stem_image_path);
    for (const opt of row.options ?? []) {
      if (opt.image_path) paths.push(opt.image_path);
    }
  }
  return paths;
}

/**
 * Replace every stored path in a question set with a signed URL.
 *
 * Returns rows shaped for the client: `stem_image_url` and `options[].image_url`
 * are added, and the raw paths are dropped so they never cross the wire.
 */
export async function withSignedImages<
  T extends { stem_image_path?: string | null; options?: QuestionOption[] },
>(
  rows: T[],
  ttlSeconds: number
): Promise<(Omit<T, "stem_image_path"> & {
  stem_image_url: string | null;
  options: SignedQuestionOption[];
})[]> {
  const signed = await signImagePaths(collectPaths(rows), ttlSeconds);

  return rows.map((row) => {
    const { stem_image_path, ...rest } = row;
    return {
      ...(rest as Omit<T, "stem_image_path">),
      stem_image_url: stem_image_path ? (signed.get(stem_image_path) ?? null) : null,
      options: (row.options ?? []).map(({ image_path, ...opt }) => ({
        ...opt,
        image_url: image_path ? (signed.get(image_path) ?? null) : null,
      })),
    };
  });
}
