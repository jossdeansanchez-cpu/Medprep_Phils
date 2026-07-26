/**
 * Client-side payment method creation + attach. CLIENT-SAFE — uses only the
 * PUBLIC key. PayMongo has no browser SDK; this calls their REST API
 * directly from the browser, so raw card numbers never reach our server —
 * only the resulting payment_method_id does.
 */

function publicKey(): string {
  const key = process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY;
  if (!key) throw new Error("Payments are not configured yet.");
  return key;
}

async function pmClientFetch(path: string, body: unknown) {
  const res = await fetch(`https://api.paymongo.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${publicKey()}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const detail = json?.errors?.[0]?.detail as string | undefined;
    // Same rule as the server: never show the customer an error caused by our
    // own configuration (rotated/invalid public key, account not enabled) —
    // those quote the API key and link to developer docs. Card declines and
    // other actionable payment errors are passed through as-is.
    const isConfig =
      res.status === 401 ||
      res.status === 403 ||
      /api key|does not exist|authentication|not enabled|unauthorized/i.test(detail ?? "");
    if (isConfig) {
      console.error("[paymongo] CONFIG ERROR:", res.status, detail);
      throw new Error(
        "Payments are temporarily unavailable. Please try again shortly — if it keeps happening, contact support."
      );
    }
    throw new Error(detail ?? "Payment could not be started");
  }
  return json;
}

export async function createCardPaymentMethod(card: {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  name: string;
  email: string;
}): Promise<string> {
  const json = await pmClientFetch("/payment_methods", {
    data: {
      attributes: {
        type: "card",
        details: {
          card_number: card.number.replace(/\s+/g, ""),
          exp_month: card.expMonth,
          exp_year: card.expYear,
          cvc: card.cvc,
        },
        billing: { name: card.name, email: card.email },
      },
    },
  });
  return json.data.id as string;
}

export async function createEwalletPaymentMethod(
  type: "gcash" | "qrph"
): Promise<string> {
  const json = await pmClientFetch("/payment_methods", {
    data: { attributes: { type } },
  });
  return json.data.id as string;
}

export type AttachResult = {
  status: string;
  redirectUrl?: string;
  qrImageUrl?: string;
};

/** Attach a payment method to a Payment Intent (client-side, public key). */
export async function attachPaymentMethod(params: {
  paymentIntentId: string;
  paymentMethodId: string;
  clientKey: string;
  returnUrl: string;
}): Promise<AttachResult> {
  const json = await pmClientFetch(
    `/payment_intents/${params.paymentIntentId}/attach`,
    {
      data: {
        attributes: {
          payment_method: params.paymentMethodId,
          client_key: params.clientKey,
          return_url: params.returnUrl,
        },
      },
    }
  );
  const attrs = json.data.attributes;
  const nextAction = attrs.next_action;
  return {
    status: attrs.status as string,
    redirectUrl: nextAction?.redirect?.url,
    qrImageUrl: nextAction?.code?.image_url,
  };
}
