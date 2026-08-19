import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete your account — MEDprep",
  description:
    "How to delete your MEDACAD (MEDprep) account and what happens to your data.",
};

/**
 * Public account-deletion instructions.
 *
 * Google Play requires a URL for this in the Data safety form, and it must be
 * reachable without signing in — a reviewer has to be able to read it cold.
 * Play states the page must name the app or developer as they appear on the
 * store listing, spell out the steps to request deletion, and say which data is
 * removed, which is kept, and for how long. All three are covered below.
 */
const UPDATED = "22 August 2026";
const SUPPORT = "medprep14@gmail.com";

export default function DeleteAccountPage() {
  return (
    <main className="app-gradient min-h-screen px-4 py-12">
      <article className="glass mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
        <header>
          <Link href="/" className="text-sm text-[var(--muted)] hover:underline">
            ← Back to MEDprep
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Delete your account
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            For <strong>MEDACAD</strong> (MEDprep), published by Dodge Enterprise · Last
            updated {UPDATED}
          </p>
        </header>

        <Section title="Delete it yourself, in the app">
          <p>This takes under a minute and needs no request to us.</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            <li>Open MEDACAD and sign in.</li>
            <li>
              Go to <strong>Account</strong> — from the menu, or at{" "}
              <span className="font-mono text-xs">medprepacad.com/account</span>.
            </li>
            <li>
              Scroll to <strong>Danger zone</strong> and tap{" "}
              <strong>Delete my account</strong>.
            </li>
            <li>
              Type <strong>DELETE</strong> to confirm, then tap{" "}
              <strong>Delete permanently</strong>.
            </li>
          </ol>
          <p className="mt-2">
            Your account is removed immediately and you are signed out. This cannot be
            undone.
          </p>
        </Section>

        <Section title="Or ask us to do it">
          <p>
            If you can&apos;t sign in, email{" "}
            <a href={`mailto:${SUPPORT}`} className="text-[var(--primary)] underline">
              {SUPPORT}
            </a>{" "}
            from the address on your account, with the subject{" "}
            <strong>Delete my account</strong>. We action these within 7 days and confirm
            by email once it&apos;s done.
          </p>
        </Section>

        <Section title="What gets deleted">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your name, email address and sign-in credentials</li>
            <li>
              Every exam you have taken — your answers, scores and results history
            </li>
            <li>Your subscription record and plan</li>
            <li>The list of devices registered to your account</li>
          </ul>
          <p className="mt-2">
            All of it is removed from our live systems as soon as the deletion runs.
          </p>
        </Section>

        <Section title="What is kept, and for how long">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Payment records</strong> — our payment provider, PayMongo, keeps a
              record of transactions independently of us, for the period required by
              Philippine tax and accounting law. We cannot delete these on your behalf;
              they contain no exam data.
            </li>
            <li>
              <strong>Encrypted backups</strong> — deleted data may remain in routine
              encrypted backups for up to <strong>30 days</strong>, after which it is
              overwritten. It is not accessible in the app during that time.
            </li>
          </ul>
          <p className="mt-2">
            Nothing else is retained. We do not keep an anonymised or archived copy of
            your study history.
          </p>
        </Section>

        <Section title="Deleting some of your data without closing your account">
          <p>
            You can remove a registered device at any time from{" "}
            <strong>Account → Devices</strong>. For any other partial deletion request,
            email{" "}
            <a href={`mailto:${SUPPORT}`} className="text-[var(--primary)] underline">
              {SUPPORT}
            </a>{" "}
            describing what you want removed — for example your exam history, while
            keeping your account. We will confirm within 7 days.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            These rights are provided under the Philippine Data Privacy Act of 2012
            (Republic Act No. 10173). See our{" "}
            <Link href="/privacy" className="text-[var(--primary)] underline">
              Privacy Policy
            </Link>{" "}
            for what we collect and why.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
