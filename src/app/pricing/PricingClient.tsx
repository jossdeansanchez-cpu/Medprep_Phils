"use client";

import Link from "next/link";
import { PLANS, type PlanTier } from "@/lib/billing/plans";

export default function PricingClient({
  signedIn,
  currentPlan,
}: {
  signedIn: boolean;
  currentPlan: PlanTier;
}) {
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

        <div className="stagger grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => {
            const price = p.price;
            const isCurrent = currentPlan === p.tier;
            return (
              <div
                key={p.tier}
                className={`glass lift flex flex-col p-6 ${
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
                  <span className="text-[var(--muted)]">/year</span>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    One payment · covers your whole review year
                  </p>
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
                    <Link href={`/checkout?plan=${p.tier}`} className="btn-primary w-full">
                      {`Choose ${p.name}`}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--muted)]">
          Free plan: 1 daily or weekly practice exam per month — mock exams need a paid plan.
          Paid plans are billed once a year, and exam allowances still reset on the 1st of
          every month. No auto-charge — nothing renews unless you pay again.
        </p>
      </div>
    </main>
  );
}
