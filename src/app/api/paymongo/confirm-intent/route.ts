import { NextRequest, NextResponse } from "next/server";
import { applyPaymentIntentResult } from "@/lib/billing/paymongo-fulfillment";

/**
 * Fallback confirmation, called from the checkout return page after a
 * GCash/QRPh redirect. The webhook is the primary path; this just double
 * -checks directly with PayMongo in case the webhook hasn't landed yet.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const result = await applyPaymentIntentResult(id);
  return NextResponse.json(result);
}
