"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@/lib/billing/plans";
import {
  createCardPaymentMethod,
  createEwalletPaymentMethod,
  attachPaymentMethod,
} from "@/lib/billing/paymongo-client";

type Method = "card" | "gcash" | "qrph";

const METHOD_LABELS: Record<Method, string> = {
  gcash: "GCash",
  qrph: "QR Ph",
  card: "Card",
};

/**
 * Which methods to offer. PayMongo rejects a method that isn't activated on the
 * merchant account ("gcash payment method is not allowed"), which would dead-end
 * the student, so only advertise what's actually enabled. Override without a code
 * change via NEXT_PUBLIC_PAYMONGO_METHODS (e.g. "qrph,card,gcash") once PayMongo
 * approves more methods.
 */
const ENABLED_METHODS: Method[] = (() => {
  const raw = process.env.NEXT_PUBLIC_PAYMONGO_METHODS;
  const parsed = (raw ?? "qrph,card")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Method => s === "card" || s === "gcash" || s === "qrph");
  return parsed.length > 0 ? parsed : ["qrph", "card"];
})();

export default function CheckoutForm({
  plan,
  email,
  name,
}: {
  plan: PlanTier;
  email: string;
  name: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>(ENABLED_METHODS[0]);
  const [form, setForm] = useState({ number: "", expMonth: "", expYear: "", cvc: "", name });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [waitingIntentId, setWaitingIntentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  function pollForQrPayment(intentId: string) {
    setWaitingIntentId(intentId);
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 3000;
      try {
        const res = await fetch(`/api/paymongo/confirm-intent?id=${intentId}`);
        const data = await res.json();
        if (data.status === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          router.push("/account?subscribe=success");
        } else if (data.status === "failed" || elapsed > 5 * 60 * 1000) {
          if (pollRef.current) clearInterval(pollRef.current);
          setWaitingIntentId(null);
          setQrImage(null);
          setError(
            elapsed > 5 * 60 * 1000
              ? "QR code expired. Please try again."
              : "Payment was not completed."
          );
        }
      } catch {
        // transient network error — keep polling until timeout
      }
    }, 3000);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const intentRes = await fetch("/api/paymongo/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const intent = await intentRes.json();
      if (!intentRes.ok) throw new Error(intent.error ?? "Could not start payment");

      const paymentMethodId =
        method === "card"
          ? await createCardPaymentMethod({
              number: form.number,
              expMonth: Number(form.expMonth),
              expYear: Number(form.expYear),
              cvc: form.cvc,
              name: form.name,
              email,
            })
          : await createEwalletPaymentMethod(method);

      const returnUrl = `${window.location.origin}/account?subscribe=return&intent=${intent.id}`;
      const attached = await attachPaymentMethod({
        paymentIntentId: intent.id,
        paymentMethodId,
        clientKey: intent.clientKey,
        returnUrl,
      });

      if (attached.status === "succeeded") {
        router.push("/account?subscribe=success");
        return;
      }
      if (attached.redirectUrl) {
        window.location.href = attached.redirectUrl;
        return;
      }
      if (attached.qrImageUrl) {
        setQrImage(attached.qrImageUrl);
        pollForQrPayment(intent.id);
        return;
      }
      throw new Error("Payment could not be completed. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (qrImage) {
    return (
      <div className="mt-5 space-y-3 text-center">
        <p className="text-sm font-medium">Scan with your GCash, Maya, or banking app</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrImage} alt="Scan to pay" className="mx-auto w-56 rounded-xl border" />
        <p className="text-sm text-[var(--muted)]">
          {waitingIntentId ? "Waiting for payment…" : ""}
        </p>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${ENABLED_METHODS.length}, minmax(0, 1fr))` }}
      >
        {ENABLED_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              method === m
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border)]"
            }`}
          >
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>

      {method === "card" && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="cc-name">Name on card</label>
            <input
              id="cc-name"
              required
              className="input"
              autoComplete="cc-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="cc-number">Card number</label>
            <input
              id="cc-number"
              required
              inputMode="numeric"
              className="input"
              autoComplete="cc-number"
              placeholder="4343 4343 4343 4345"
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="cc-exp-month">MM</label>
              <input
                id="cc-exp-month"
                required
                inputMode="numeric"
                maxLength={2}
                className="input"
                placeholder="12"
                value={form.expMonth}
                onChange={(e) => setForm((f) => ({ ...f, expMonth: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="cc-exp-year">YYYY</label>
              <input
                id="cc-exp-year"
                required
                inputMode="numeric"
                maxLength={4}
                className="input"
                placeholder="2030"
                value={form.expYear}
                onChange={(e) => setForm((f) => ({ ...f, expYear: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="cc-cvc">CVC</label>
              <input
                id="cc-cvc"
                required
                inputMode="numeric"
                maxLength={4}
                className="input"
                placeholder="123"
                value={form.cvc}
                onChange={(e) => setForm((f) => ({ ...f, cvc: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      {method === "gcash" && (
        <p className="text-sm text-[var(--muted)]">
          You&apos;ll be redirected to GCash to approve the payment, then brought back here.
        </p>
      )}
      {method === "qrph" && (
        <p className="text-sm text-[var(--muted)]">
          We&apos;ll show a QR code to scan with your banking or e-wallet app.
        </p>
      )}

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Processing…" : method === "card" ? "Pay" : "Continue"}
      </button>
      <p className="text-center text-xs text-[var(--muted)]">
        Payments are processed securely by PayMongo. Card details never touch our servers.
      </p>
    </form>
  );
}
