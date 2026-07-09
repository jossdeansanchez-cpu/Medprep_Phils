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
  if (!res.ok) throw new Error(json?.errors?.[0]?.detail ?? "Payment could not be started");
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
