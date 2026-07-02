import "server-only";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Outbound email over SMTP (nodemailer). SERVER-ONLY.
 *
 * Works with any SMTP account — the same kind you'd configure in Supabase's
 * Auth SMTP settings (Gmail, SendGrid, Mailgun, your host, etc.). No domain
 * required (Gmail with an App Password is the easiest no-domain option).
 *
 * Configuration (Vercel env):
 *   SMTP_HOST   — e.g. smtp.gmail.com
 *   SMTP_PORT   — 587 (STARTTLS) or 465 (SSL). Defaults to 587.
 *   SMTP_USER   — SMTP username (e.g. your Gmail address)
 *   SMTP_PASS   — SMTP password / app password
 *   EMAIL_FROM  — sender, e.g. "MEDprep <you@gmail.com>". Defaults to SMTP_USER.
 *
 * If SMTP isn't configured, every send is a silent no-op so the app keeps
 * working without email.
 */

const FROM = process.env.EMAIL_FROM || process.env.SMTP_USER || "MEDprep";

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // SSL on 465; STARTTLS otherwise
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

type SendArgs = { to: string | string[]; subject: string; html: string };

/** Send one email. Returns true if sent, false if skipped/failed. */
export async function sendEmail({ to, subject, html }: SendArgs): Promise<boolean> {
  if (!emailConfigured()) {
    console.warn("[email] SMTP not configured — skipping send:", subject);
    return false;
  }
  try {
    await getTransport().sendMail({ from: FROM, to, subject, html });
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
