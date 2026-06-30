import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";
import { planToPriceId, type PlanTier, type BillingInterval } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { plan, interval } = (await req.json()) as {
    plan: PlanTier;
    interval: BillingInterval;
  };
  const price = planToPriceId(plan, interval);
  if (!price) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const site = process.env.NEXT_PUBLIC_SITE_URL!;
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: sub?.stripe_customer_id ?? undefined,
    customer_email: sub?.stripe_customer_id ? undefined : user.email,
    client_reference_id: user.id,
    metadata: { user_id: user.id },
    subscription_data: { metadata: { user_id: user.id } },
    success_url: `${site}/account?checkout=success`,
    cancel_url: `${site}/pricing?checkout=cancel`,
  });

  return NextResponse.json({ url: session.url });
}
