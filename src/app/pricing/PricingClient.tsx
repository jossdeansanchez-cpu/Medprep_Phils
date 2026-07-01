"use client";

import { useState } from "react";
import Link from "next/link";
import { PLANS, type PlanTier } from "@/lib/billing/plans";

export default function PricingClient({
  signedIn,
  currentPlan,
}: {
  signedIn: boolean;
  currentPlan: PlanTier;
}) {
  const [loading, setLoading] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: PlanTier) {
    setError(null);
    setLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: "month" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(null);
    }
  }

  return (
    <main className="app-gradient min-h-screen px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 text-center">
          <Link href={signedIn ? "/dashboard" : "/"} className="text-sm text-[var(--muted)] hover:underline">
            ← Back
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Choose your plan</h1>
          <p className="mt-2 text-[var(--muted)]">
            Pass the PRC Physician Licensure Exam with focused practice and full mock exams.
          </p>
        </div>

        {error && <p className="mb-4 text-center text-sm text-[var(--danger)]">{error}</p>}

        <div className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => {
            const price = p.monthly;
            const isCurrent = currentPlan === p.tier;
            return (
              <div
                key={p.tier}
                className={`glass flex flex-col p-6 ${
                  p.highlighted ? "ring-2 ring-[var(--primary)]" : ""
                }`}
              >
                {p.highlighted && (
                  <span className="badge mb-2 self-start bg-[var(--primary)] text-white">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <p className="text-sm text-[var(--muted)]">{p.blurb}</p>
                <div className="mt-4">
                  <span className="text-3xl font-bold">₱{price.toLocaleString()}</span>
                  <span className="text-[var(--muted)]">/mo</span>
                </div>

                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-[var(--primary)]">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {!signedIn ? (
                    <Link href="/login?redirect=/pricing" className="btn-primary w-full">
                      Sign in to subscribe
                    </Link>
                  ) : isCurrent ? (
                    <Link href="/account" className="btn-outline w-full">
                      Current plan
                    </Link>
                  ) : (
                    <button
                      onClick={() => subscribe(p.tier)}
                      disabled={loading !== null}
                      className="btn-primary w-full"
                    >
                      {loading === p.tier ? "Redirecting…" : `Choose ${p.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Free plan: study mode with 10 questions/day. Cancel anytime.
        </p>
      </div>
    </main>
  );
}
