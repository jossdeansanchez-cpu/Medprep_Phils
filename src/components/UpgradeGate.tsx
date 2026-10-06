import Link from "next/link";
import { isStoreApp } from "@/lib/platform/server";

type Copy = { title: string; body: string };

/**
 * Shown where a feature isn't included in the student's plan.
 *
 * Both variants are required, and that is deliberate. App Store Guideline 3.1.1
 * and Google Play's Payments policy both forbid steering a store user towards a
 * purchase made outside the store's own billing — not just links, but any
 * mention of buying elsewhere. Since this one deploy serves the App Store and
 * Play builds too, a caller that forgot the in-app wording would ship a
 * violation silently. Making `app` required turns that into a compile error.
 *
 * The `app` variant is shown in both store builds. It states the limit as a fact
 * and stops: no call to action, no price, no suggestion that a purchase exists
 * anywhere.
 */
export default async function UpgradeGate({
  web,
  app,
}: {
  web: Copy;
  app: Copy;
}) {
  const storeApp = await isStoreApp();
  const copy = storeApp ? app : web;

  return (
    <div className="rounded-2xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/[0.06] p-5 text-center">
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{copy.body}</p>
      {!storeApp && (
        <Link href="/pricing" className="btn-primary mt-3 inline-flex">
          See plans
        </Link>
      )}
    </div>
  );
}
