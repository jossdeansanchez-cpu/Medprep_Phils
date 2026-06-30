import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { priceToPlan } from "@/lib/billing/plans";

// Stripe needs the raw body for signature verification — never parse it first.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  const db = createAdminClient();

  async function upsertFromSubscription(sub: Stripe.Subscription, userId?: string) {
    const item = sub.items.data[0];
    const priceId = item?.price.id ?? "";
    const mapped = priceToPlan(priceId);
    const uid = userId ?? (sub.metadata.user_id as string | undefined);
    if (!uid) return;
    await db.from("subscriptions").upsert({
      user_id: uid,
      plan: mapped?.tier ?? "free",
      interval: mapped?.interval ?? null,
      status: sub.status,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const uid = s.client_reference_id ?? (s.metadata?.user_id as string | undefined);
      if (s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription as string);
        await upsertFromSubscription(sub, uid ?? undefined);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .from("subscriptions")
        .update({ plan: "free", status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
