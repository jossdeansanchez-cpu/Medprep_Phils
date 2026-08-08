import Link from "next/link";
import { isIosApp } from "@/lib/platform/server";

type Copy = { title: string; body: string };

/**
 * Shown where a feature isn't included in the student's plan.
 *
 * Both variants are required, and that is deliberate. App Store Guideline 3.1.1
 * forbids steering iOS users towards a purchase made outside Apple's IAP — not
 * just links, but any mention of buying elsewhere. Since the web deploy serves
 * the App Store build too, a caller that forgot the iOS wording would ship a
 * violation silently. Making `ios` required turns that into a compile error.
 *
 * The iOS variant states the limit as a fact and stops: no call to action, no
 * price, no suggestion that a purchase exists anywhere.
 */
export default async function UpgradeGate({
  web,
  ios,
}: {
  web: Copy;
  ios: Copy;
}) {
  const iosApp = await isIosApp();
  const copy = iosApp ? ios : web;

  return (
    <div className="rounded-2xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/[0.06] p-5 text-center">
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{copy.body}</p>
      {!iosApp && (
        <Link href="/pricing" className="btn-primary mt-3 inline-flex">
          See plans
        </Link>
      )}
    </div>
  );
}
