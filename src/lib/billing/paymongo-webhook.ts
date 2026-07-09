import "server-only";
import crypto from "crypto";

/**
 * Verify a PayMongo webhook signature and parse the event.
 *
 * Algorithm confirmed from PayMongo's own Node SDK source (their docs pages
 * for this are incomplete): the `Paymongo-Signature` header is
 * `t=<unix-ts>,te=<test-mode-sig>,li=<live-mode-sig>` — HMAC-SHA256 of
 * `${timestamp}.${rawBody}` using the webhook's secret key, hex-encoded.
 * Whichever of te/li is non-empty matches the mode the request was sent in.
 */
export class PayMongoSignatureError extends Error {}

export function constructPayMongoEvent(params: {
  rawBody: string;
  signatureHeader: string;
  webhookSecret: string;
}): { id: string; type: string; data: unknown } {
  const parts = params.signatureHeader.split(",");
  if (parts.length < 3) throw new PayMongoSignatureError("Malformed signature header");

  const timestamp = parts[0].split("=")[1];
  const testSig = parts[1].split("=")[1];
  const liveSig = parts[2].split("=")[1];
  const expectedSig = liveSig || testSig;
  if (!timestamp || !expectedSig) {
    throw new PayMongoSignatureError("Malformed signature header");
  }

  const hmac = crypto
    .createHmac("sha256", params.webhookSecret)
    .update(`${timestamp}.${params.rawBody}`)
    .digest("hex");

  const a = Buffer.from(hmac);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new PayMongoSignatureError("Signature mismatch");
  }

  const parsed = JSON.parse(params.rawBody);
  const resource = parsed.data;
  return { id: resource.id, type: resource.attributes.type, data: resource.attributes.data };
}
