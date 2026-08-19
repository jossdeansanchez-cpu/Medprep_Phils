"use client";

import { useEffect, useRef, useState } from "react";
import { uploadQuestionImage } from "@/lib/images-client";

/**
 * One image attachment on a question — the stem figure, or one answer choice.
 *
 * The file goes straight to Supabase Storage the moment it's picked, and only
 * the resulting object path is submitted with the form. That's deliberate: a
 * question can carry six images and Next caps server action bodies at 1 MB, so
 * the files can't ride along with the form post.
 *
 * Because the upload happens immediately, abandoning the form leaves an orphaned
 * object in the bucket. That's a deliberate trade — a stray file costs a few KB,
 * whereas losing a figure the admin thought they'd attached costs real work.
 */
export default function ImageSlot({
  name,
  label,
  initialPath = null,
  initialUrl = null,
}: {
  /** Form field name that will carry the stored object path. */
  name: string;
  label: string;
  initialPath?: string | null;
  /** Signed URL for an already-saved image, minted server-side. */
  initialUrl?: string | null;
}) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracked so we can revoke it — object URLs leak until you do.
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);

    const result = await uploadQuestionImage(file);
    setUploading(false);
    // Let the same file be re-picked after a failure.
    if (inputRef.current) inputRef.current.value = "";

    if ("error" in result) {
      setError(result.error);
      return;
    }

    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    // Preview the local file rather than signing a URL for what we just sent —
    // it's instant, and shows the compressed result the student will get.
    objectUrl.current = URL.createObjectURL(file);
    setPreview(objectUrl.current);
    setPath(result.path);
  }

  function remove() {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setPath(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <input type="hidden" name={name} value={path ?? ""} />

      {preview ? (
        <div className="flex items-start gap-2">
          {/* Plain <img>, not next/image: these are signed URLs that change per
              attempt, so the optimiser could never cache them, and Vercel meters
              optimisations. They're already downscaled to WebP on upload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={`${label} preview`}
            className="max-h-28 rounded-lg border border-[var(--border)] bg-white object-contain"
          />
          <button
            type="button"
            onClick={remove}
            className="text-xs text-[var(--danger)] hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--primary)] hover:underline">
          {uploading ? "Uploading…" : `+ ${label}`}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={onPick}
          />
        </label>
      )}

      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
