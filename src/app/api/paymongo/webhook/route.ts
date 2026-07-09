import { NextRequest, NextResponse } from "next/server";
import { applyPaymentIntentResult } from "@/lib/billing/paymongo-fulfillment";
import { constructPayMongoEvent, PayMongoSignatureError } from "@/lib/billing/paymongo-webhook";

// PayMongo needs the raw body for signature verification — never parse it first.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("paymongo-signature");
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!sigHeader || !secret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: { id: string; type: string; data: unknown };
  try {
    event = constructPayMongoEvent({ rawBody, signatureHeader: sigHeader, webhookSecret: secret });
  } catch (err) {
    if (err instanceof PayMongoSignatureError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (event.type === "payment.paid" || event.type === "payment.failed") {
    const resource = event.data as { attributes?: { payment_intent_id?: string } };
    const intentId = resource.attributes?.payment_intent_id;
    if (intentId) await applyPaymentIntentResult(intentId);
  }

  return NextResponse.json({ received: true });
}
