import { createClient } from "@/lib/supabase/client";

export const QUESTION_IMAGE_BUCKET = "question-images";

/**
 * Longest edge after downscaling. Perceptual Acuity figures are line art shown
 * in a narrow column; beyond this the extra pixels cost bandwidth and buy
 * nothing on screen.
 */
const MAX_EDGE = 1200;
const WEBP_QUALITY = 0.85;
/** Matches the bucket's file_size_limit in migration 0038. */
const MAX_BYTES = 2 * 1024 * 1024;

export type UploadResult = { path: string } | { error: string };

/**
 * Shrink and re-encode to WebP in the browser.
 *
 * This project's Supabase plan has no image transformation, so if we don't do
 * this here nothing else will: a 4 MB phone photo of a figure would be served
 * at 4 MB to every student who sits the exam. Egress, not storage, is the
 * binding constraint on the free tier.
 *
 * GIFs are passed through untouched — drawing one to a canvas would flatten it
 * to its first frame.
 */
async function toWebp(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // Figures are usually black-on-white; without this they get transparent
  // edges once encoded, which looks broken in dark mode.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
  );
  // Fall back to the original if the browser can't encode WebP.
  return blob ?? file;
}

/**
 * Upload one question figure and return its storage path.
 *
 * Goes straight from the browser to Supabase Storage rather than through a
 * server action: Next caps server action bodies at 1 MB, and a question can
 * carry six images. The bucket's RLS policy (admins only) is what authorises
 * this — the browser client carries the signed-in admin's session.
 */
export async function uploadQuestionImage(file: File): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) {
    return { error: "That file isn't an image." };
  }

  let body: Blob;
  try {
    body = await toWebp(file);
  } catch {
    return { error: "That image couldn't be read. Try re-saving it as PNG or JPEG." };
  }

  if (body.size > MAX_BYTES) {
    return { error: "That image is still over 2 MB after compression. Try a smaller crop." };
  }

  const ext = body.type === "image/gif" ? "gif" : "webp";
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await createClient()
    .storage.from(QUESTION_IMAGE_BUCKET)
    .upload(path, body, { contentType: body.type, upsert: false });

  if (error) {
    return { error: error.message };
  }
  return { path };
}
