/**
 * A figure attached to a question — the stem illustration, or one answer choice.
 *
 * Plain <img> rather than next/image on purpose. These are signed URLs that
 * differ per attempt, so the optimiser could never get a cache hit, and Vercel
 * meters optimisations per plan. The file is already downscaled and re-encoded
 * to WebP at upload time, and Supabase serves it from its own CDN.
 *
 * Renders nothing when there's no URL, so a question that lost its image (or an
 * expired signature) degrades to text instead of showing a broken frame.
 */
export default function QuestionFigure({
  url,
  variant,
  alt = "",
}: {
  url: string | null | undefined;
  /** "stem" sits above the question; "option" sits inside a choice button. */
  variant: "stem" | "option";
  alt?: string;
}) {
  if (!url) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={
        variant === "stem"
          ? "mt-3 max-h-80 w-auto max-w-full rounded-lg border border-[var(--border)] bg-white object-contain"
          : "max-h-40 w-auto max-w-full rounded-md bg-white object-contain"
      }
    />
  );
}
