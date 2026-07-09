import "server-only";

/**
 * Minimal PayMongo REST client. SERVER-ONLY — uses the secret key.
 *
 * Billing model: one-time Payment Intents per renewal period (not
 * auto-recurring Subscriptions — that API requires org-level card/Maya
 * activation that isn't available yet, and only covers card/Maya anyway).
 * Payment Intents work today and cover GCash, QRPh, and card. Each
 * successful payment extends the student's `current_period_end` by one
 * month; renewal is manual, prompted by the existing reminder email.
 */

const BASE_URL = "https://api.paymongo.com/v1";

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_SECRET_KEY is not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export class PayMongoError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function pmFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.errors?.[0];
    throw new PayMongoError(res.status, err?.detail ?? "PayMongo request failed", err?.code);
  }
  return json as T;
}

export type PMPaymentIntent = {
  id: string;
  attributes: {
    amount: number;
    currency: string;
    status: string;
    client_key: string;
    description: string | null;
    metadata: Record<string, string> | null;
    payments: { id: string }[];
  };
};

export async function createPaymentIntent(params: {
  amountCentavos: number;
  description: string;
  metadata: Record<string, string>;
}): Promise<PMPaymentIntent> {
  const { data } = await pmFetch<{ data: PMPaymentIntent }>("/payment_intents", {
    method: "POST",
    body: {
      data: {
        attributes: {
          amount: params.amountCentavos,
          currency: "PHP",
          payment_method_allowed: ["card", "gcash", "qrph"],
          payment_method_options: { card: { request_three_d_secure: "any" } },
          description: params.description,
          metadata: params.metadata,
        },
      },
    },
  });
  return data;
}

export async function retrievePaymentIntent(id: string): Promise<PMPaymentIntent> {
  const { data } = await pmFetch<{ data: PMPaymentIntent }>(`/payment_intents/${id}`);
  return data;
}
