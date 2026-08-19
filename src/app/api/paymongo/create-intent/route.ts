import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPaymentIntent, safePaymentMessage } from "@/lib/billing/paymongo";
import { planByTier, type PlanTier } from "@/lib/billing/plans";
import { coerceTrack, trackLabel } from "@/lib/tracks";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { plan } = (await req.json()) as { plan: PlanTier };

  // The track is taken from the profile, never from the request body: it decides
  // what the payment unlocks, so the client must not get to name it.
  const { data: profile } = await supabase
    .from("profiles")
    .select("track")
    .eq("id", user.id)
    .maybeSingle();
  const track = coerceTrack(profile?.track);

  const planDef = planByTier(plan, track);
  if (!planDef) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  try {
    const intent = await createPaymentIntent({
      amountCentavos: planDef.price * 100,
      description: `MEDprep ${trackLabel(track)} ${planDef.name} — 1 year`,
      metadata: { user_id: user.id, plan, track },
    });
    return NextResponse.json({
      id: intent.id,
      clientKey: intent.attributes.client_key,
      amount: intent.attributes.amount,
    });
  } catch (err) {
    return NextResponse.json({ error: safePaymentMessage(err) }, { status: 400 });
  }
}
