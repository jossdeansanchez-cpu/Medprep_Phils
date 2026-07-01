import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Outbound email via Resend (https://resend.com). SERVER-ONLY.
 *
 * Configuration (Vercel env):
 *   RESEND_API_KEY  — the Resend API key (required to actually send)
 *   EMAIL_FROM      — verified sender, e.g. "MEDprep <alerts@yourdomain.com>"
 *                     Falls back to Resend's shared onboarding address, which can
 *                     ONLY deliver to the Resend account owner until you verify a
 *                     domain. Verify a domain to email real students.
 *
 * If RESEND_API_KEY is unset, every send is a silent no-op so the app keeps
 * working without email configured.
 */

const FROM = process.env.EMAIL_FROM || "MEDprep <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

type SendArgs = { to: string | string[]; subject: string; html: string };

/** Send one email. Returns true if handed off to Resend, false if skipped/failed. */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping send:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

/** Minimal branded HTML wrapper for a message. */
export function emailLayout(opts: { heading: string; body: string; cta?: { label: string; href: string } }) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://medprep-teal.vercel.app";
  const button = opts.cta
    ? `<a href="${opts.cta.href}" style="display:inline-block;margin-top:18px;padding:11px 20px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">${opts.cta.label}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:20px;font-weight:800;color:#4f46e5;margin-bottom:20px">MEDprep</div>
    <div style="background:#fff;border-radius:14px;padding:26px 24px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <h1 style="margin:0 0 12px;font-size:18px;color:#111827">${opts.heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:#374151">${opts.body}</div>
      ${button}
    </div>
    <p style="margin:18px 4px 0;font-size:12px;color:#9ca3af">
      You're receiving this because you have a MEDprep account.
      <a href="${site}/account" style="color:#9ca3af">Manage your account</a>.
    </p>
  </div></body></html>`;
}

/** Every student's email address (for announcement blasts). Admin/service role. */
export async function getStudentEmails(): Promise<string[]> {
  const admin = createAdminClient();
  const { data: profiles } = await admin.from("profiles").select("id, role");
  const studentIds = new Set(
    (profiles ?? []).filter((p) => p.role === "student").map((p) => p.id as string)
  );
  const emails: string[] = [];
  let page = 1;
  // Page through auth users, matching only student profiles.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email && studentIds.has(u.id)) emails.push(u.email);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return emails;
}

/** One user's email by id. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}
