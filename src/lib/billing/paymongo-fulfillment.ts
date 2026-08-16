import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrievePaymentIntent, type PMPaymentIntent } from "@/lib/billing/paymongo";
import { sendEmail, emailLayout, getUserEmail } from "@/lib/email";
import { BILLING_INTERVAL, BILLING_PERIOD_DAYS, type PlanTier } from "@/lib/billing/plans";
import { coerceTrack } from "@/lib/tracks";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Apply a Payment Intent's result to the student's subscription row.
 * Called from both the webhook (primary path) and the checkout return page
 * (fallback, in case the webhook is slow or misses) — safe to call twice for
 * the same intent since it re-derives state from PayMongo each time.
 */
export async function applyPaymentIntentResult(intentId: string): Promise<{
  status: "paid" | "pending" | "failed";
  plan?: PlanTier;
}> {
  const intent = await retrievePaymentIntent(intentId);
  const metadata = intent.attributes.metadata ?? {};
  const userId = metadata.user_id;
  const plan = metadata.plan as PlanTier | undefined;
  if (!userId || !plan) return { status: "pending" };

  // Which track this payment bought. Intents created before tracks existed carry
  // no value, and those were all PLE — which is what coerceTrack falls back to.
  const track = coerceTrack(metadata.track);

  const succeeded = intent.attributes.status === "succeeded";
  const latestPayment = intent.attributes.payments.at(-1);

  const db = createAdminClient();

  if (succeeded) {
    const { data: existing } = await db
      .from("subscriptions")
      .select("current_period_end, track")
      .eq("user_id", userId)
      .maybeSingle();

    // Paying again while still active extends from the existing end date, so a
    // student never loses time they already paid for. That only holds within one
    // track: a student switching from NMAT to PLE is buying access they did not
    // have, so their remaining NMAT time must not roll over into it.
    const sameTrack = coerceTrack(existing?.track) === track;
    const base =
      sameTrack && existing?.current_period_end
        ? Math.max(new Date(existing.current_period_end).getTime(), Date.now())
        : Date.now();
    const newPeriodEnd = new Date(base + BILLING_PERIOD_DAYS * DAY).toISOString();

    await db.from("subscriptions").upsert({
      user_id: userId,
      plan,
      track,
      interval: BILLING_INTERVAL,
      status: "active",
      paymongo_last_payment_id: latestPayment?.id ?? intentId,
      current_period_end: newPeriodEnd,
      updated_at: new Date().toISOString(),
    });
    return { status: "paid", plan };
  }

  if (intent.attributes.status === "awaiting_payment_method") {
    // Payment failed and PayMongo reset the intent for another attempt.
    const email = await getUserEmail(userId);
    if (email) {
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://medprep-teal.vercel.app";
      await sendEmail({
        to: email,
        subject: "⚠️ Your MEDprep payment didn't go through",
        html: emailLayout({
          heading: "Payment failed",
          body: "Your last payment attempt for MEDprep didn't complete. No charge was made — you can try again anytime.",
          cta: { label: "Try again", href: `${site}/pricing` },
        }),
      });
    }
    return { status: "failed" };
  }

  return { status: "pending" };
}

export type { PMPaymentIntent };
