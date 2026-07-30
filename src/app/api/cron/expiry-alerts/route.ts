import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailLayout, emailConfigured, getUserEmail } from "@/lib/email";

// Daily cron (see vercel.json). Emails students whose plan is expiring soon.
// Billing is manual (one-time payments, no auto-charge) — these reminders are
// the only nudge to actually pay again, unlike a Stripe-style auto-renewal.
// Reminders fire when the whole number of days remaining hits one of these — so
// with a once-daily run each student gets at most these nudges per period.
// 30 days is here because plans are annual: a year after paying, a student needs
// more than a week's warning to budget for the renewal.
const REMIND_ON = new Set([30, 7, 3, 1]);
const DAY = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // If CRON_SECRET is set, require Vercel's Bearer header.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ ok: true, skipped: "email not configured" });
  }

  const db = createAdminClient();
  const now = Date.now();
  const { data: subs } = await db
    .from("subscriptions")
    .select("user_id, status, current_period_end, plan")
    .in("status", ["active", "trialing"])
    .not("current_period_end", "is", null)
    .neq("plan", "free");

  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://medprep-teal.vercel.app";
  let sent = 0;

  for (const s of subs ?? []) {
    const end = new Date(s.current_period_end as string).getTime();
    const daysLeft = Math.floor((end - now) / DAY);
    if (!REMIND_ON.has(daysLeft)) continue;

    const email = await getUserEmail(s.user_id as string);
    if (!email) continue;

    const when = new Date(end).toLocaleDateString();
    const ok = await sendEmail({
      to: email,
      subject:
        daysLeft === 1
          ? "⏳ Your MEDprep plan expires tomorrow"
          : `⏳ Your MEDprep plan expires in ${daysLeft} days`,
      html: emailLayout({
        heading: "Your plan is expiring soon",
        body: `Your MEDprep plan ends on <strong>${when}</strong>. Billing is manual, so pay again before then to keep your access — it won't renew automatically.`,
        cta: { label: "Renew now", href: `${site}/account` },
      }),
    });
    if (ok) sent += 1;
  }

  return NextResponse.json({ ok: true, sent });
}
