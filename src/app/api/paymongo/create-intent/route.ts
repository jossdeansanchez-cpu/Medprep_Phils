import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPaymentIntent, PayMongoError } from "@/lib/billing/paymongo";
import { planByTier, type PlanTier } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { plan } = (await req.json()) as { plan: PlanTier };
  const planDef = planByTier(plan);
  if (!planDef) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  try {
    const intent = await createPaymentIntent({
      amountCentavos: planDef.monthly * 100,
      description: `MEDprep ${planDef.name} — 1 month`,
      metadata: { user_id: user.id, plan },
    });
    return NextResponse.json({
      id: intent.id,
      clientKey: intent.attributes.client_key,
      amount: intent.attributes.amount,
    });
  } catch (err) {
    const message = err instanceof PayMongoError ? err.message : "Could not start payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
