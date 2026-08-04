import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MEDprep",
  description:
    "How MEDprep collects, uses and protects your personal information.",
};

/**
 * Public privacy policy. Google Play and the App Store both require a
 * publicly reachable privacy policy URL before an app can be listed, and it
 * must be accurate about what the app actually collects.
 *
 * Kept deliberately specific to what this codebase stores — see the tables in
 * supabase/migrations. Update it when the data model changes.
 */
const UPDATED = "3 August 2026";

export default function PrivacyPage() {
  return (
    <main className="app-gradient min-h-screen px-4 py-12">
      <article className="glass mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
        <header>
          <Link href="/" className="text-sm text-[var(--muted)] hover:underline">
            ← Back to MEDprep
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Last updated {UPDATED}</p>
        </header>

        <Section title="Who we are">
          <p>
            MEDprep is a study application for the Philippine Physician Licensure Examination
            (PLE), operated by Dodge Enterprise. You can reach us at{" "}
            <a href="mailto:medprep14@gmail.com" className="text-[var(--primary)] underline">
              medprep14@gmail.com
            </a>{" "}
            with any question about this policy or your data.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Account details</strong> — your name and email address, and a securely
              hashed version of your password. We never store your password in readable form.
            </li>
            <li>
              <strong>Study activity</strong> — the exams you start, the answers you choose,
              your scores and the dates you sat them. This is what powers your results history
              and progress analytics.
            </li>
            <li>
              <strong>Subscription details</strong> — your plan, when it expires, and a
              reference number for your last payment.
            </li>
            <li>
              <strong>Device information</strong> — a random identifier for each device you
              sign in from, along with your browser&apos;s user-agent string and the dates it
              was first and last used. We use this only to enforce the device limit on your
              plan.
            </li>
          </ul>
        </Section>

        <Section title="What we do not collect">
          <p>
            We do <strong>not</strong> store your card number, CVC or expiry date. Payments are
            processed by PayMongo, and those details go directly to them without passing
            through our servers. We do not track your location, read your contacts, or access
            your photos, camera or microphone. We do not use advertising trackers.
          </p>
        </Section>

        <Section title="Why we use it">
          <p>
            To give you an account and keep you signed in; to run exams and show you your
            results, correct answers and explanations; to apply the limits of your plan; to
            take payment and tell you when your plan is about to expire; and to keep the
            service working and secure.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p>We use a small number of service providers, and only for the purposes above:</p>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Supabase</strong> — stores your account, study activity and subscription
              record.
            </li>
            <li>
              <strong>Vercel</strong> — hosts the application and serves it to your device.
            </li>
            <li>
              <strong>PayMongo</strong> — processes payments and handles your card or e-wallet
              details.
            </li>
          </ul>
          <p className="mt-2">
            We do not sell your personal information, and we do not share it with advertisers.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your account and study history for as long as your account exists, so that
            your past results stay available to you. If you ask us to delete your account, we
            remove your profile, exam attempts and subscription record. Some records may
            persist briefly in encrypted backups before being overwritten.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You may ask us for a copy of your data, ask us to correct it, or ask us to delete
            your account entirely. Email{" "}
            <a href="mailto:medprep14@gmail.com" className="text-[var(--primary)] underline">
              medprep14@gmail.com
            </a>{" "}
            and we will action it. You can change your own password at any time from the sign-in
            screen. These rights are provided under the Philippine Data Privacy Act of 2012
            (Republic Act No. 10173).
          </p>
        </Section>

        <Section title="Children">
          <p>
            MEDprep is intended for medical students and graduates preparing for the PLE. It is
            not directed at children under 13, and we do not knowingly collect their
            information.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change how we handle your data we will update this page and change the date
            at the top. Significant changes will also be announced inside the app.
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
