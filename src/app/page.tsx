import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { PLANS } from "@/lib/billing/plans";
import { TRACK_ORDER, TRACK_LABELS, TRACK_FULL_NAMES, type ExamTrack } from "@/lib/tracks";

/** Mirrors the seeded subjects per track (supabase/migrations 0002 and 0037). */
const TRACK_SUBJECTS: Record<ExamTrack, string[]> = {
  ple: [
    "Anatomy",
    "Biochemistry",
    "Physiology",
    "Microbiology & Parasitology",
    "Pathology",
    "Pharmacology",
    "Medicine",
    "Surgery",
    "Obstetrics & Gynecology",
    "Pediatrics",
    "Preventive Medicine & Public Health",
    "Legal Medicine & Ethics",
  ],
  nmat: [
    "Verbal",
    "Inductive Reasoning",
    "Quantitative",
    "Perceptual Acuity",
    "Biology",
    "Physics",
    "Social Science",
    "Chemistry",
  ],
};

const TRACK_PITCH: Record<ExamTrack, string> = {
  ple: "The PRC board exam you sit after medical school. Twelve subjects, scored on the real 75% / 50% rule.",
  nmat: "The entrance exam you sit before medical school. Mental Ability and Academic Proficiency, eight subjects in all.",
};

const FACTS = [
  { n: "2", label: "Exams: PLE & NMAT" },
  { n: "20", label: "Subjects covered" },
  { n: "3", label: "Modes: daily, weekly, mock" },
  { n: "75%", label: "PLE passing average" },
];

export default async function Home() {
  if (await getCurrentProfile()) redirect("/dashboard");

  return (
    <div className="min-h-[100dvh] bg-[var(--background)]">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
              M
            </span>
            <span>
              <span className="text-[var(--primary)]">MED</span>prep
            </span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link href="/pricing" className="btn-ghost hidden sm:inline-flex">Pricing</Link>
            <Link href="/login" className="btn-ghost">Sign in</Link>
            <Link href="/signup" className="btn-primary">Get started free</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="hero-field">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div className="reveal">
            <span className="inline-flex items-center rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/10 px-3 py-1 text-xs font-medium text-[var(--primary)]">
              PLE &amp; NMAT preparation
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
              Walk into your medical exam ready.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[var(--muted)]">
              Realistic timed mock exams and daily practice for the Physician Licensure
              Exam and the National Medical Admission Test — scored exactly like the
              real thing.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup?track=ple" className="btn-primary px-5 py-2.5 text-base">
                Prepare for the PLE
              </Link>
              <Link href="/signup?track=nmat" className="btn-outline px-5 py-2.5 text-base">
                Prepare for the NMAT
              </Link>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Free to start.{" "}
              <Link href="/login" className="text-[var(--primary)] underline">
                Already have an account?
              </Link>
            </p>
          </div>

          <div className="reveal" style={{ animationDelay: "0.12s" }}>
            <div className="glass overflow-hidden p-2 shadow-[0_30px_80px_-20px_rgba(13,122,95,0.28)]">
              <Image
                src="/shots/dashboard.png"
                alt="MEDprep student dashboard showing exam statistics and recent attempts"
                width={1340}
                height={880}
                priority
                className="h-auto w-full rounded-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Fact strip */}
      <section className="border-y border-black/[0.06] bg-white">
        <div className="scroll-reveal mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-4 sm:px-6 md:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="px-2 py-7 text-center md:py-9">
              <div className="font-mono text-3xl font-bold tracking-tight md:text-4xl">{f.n}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{f.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How you will prepare - zigzag (max 2) */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Two ways to prepare, whichever exam you&apos;re sitting.
        </h2>

        <div className="scroll-reveal mt-14 grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight">
              Mock exams that mirror the real thing.
            </h3>
            <p className="mt-3 max-w-md text-[var(--muted)]">
              Questions drawn at random from every subject, a live countdown, and automatic
              scoring with the official pass rule. Review every item afterward, per subject.
            </p>
            <Link href="/signup" className="mt-5 inline-flex font-medium text-[var(--primary)]">
              Get started free →
            </Link>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-white p-2 shadow-[0_20px_50px_-24px_rgba(20,40,40,0.25)]">
            <Image
              src="/shots/results.png"
              alt="Results page with a pass-fail badge, general average, and per-subject score bars"
              width={1340}
              height={880}
              className="h-auto w-full rounded-xl"
            />
          </div>
        </div>

        <div className="scroll-reveal mt-16 grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 rounded-2xl border border-black/[0.06] bg-white p-2 shadow-[0_20px_50px_-24px_rgba(20,40,40,0.25)] lg:order-1">
            <Image
              src="/shots/dashboard.png"
              alt="MEDprep dashboard with study progress and quick access to practice"
              width={1340}
              height={880}
              className="h-auto w-full rounded-xl"
            />
          </div>
          <div className="order-1 lg:order-2">
            <h3 className="text-2xl font-semibold tracking-tight">
              Study mode for everyday practice.
            </h3>
            <p className="mt-3 max-w-md text-[var(--muted)]">
              Work through any subject untimed and see the correct answer with a full rationale
              right after you choose. Build recall one question at a time.
            </p>
            <Link href="/signup" className="mt-5 inline-flex font-medium text-[var(--primary)]">
              Get started free →
            </Link>
          </div>
        </div>
      </section>

      {/* Subjects - grid (new layout family) */}
      <section className="border-t border-black/[0.06] bg-white">
        <div className="scroll-reveal mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <h2 className="max-w-md text-3xl font-bold tracking-tight sm:text-4xl">
              Every subject on both exams.
            </h2>
            <p className="max-w-sm text-[var(--muted)]">
              Pick your exam when you sign up — you only ever see the subjects that
              matter to you.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            {TRACK_ORDER.map((t) => (
              <div key={t}>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-xl font-semibold">{TRACK_LABELS[t]}</h3>
                  <span className="text-sm text-[var(--muted)]">
                    {TRACK_FULL_NAMES[t]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{TRACK_PITCH[t]}</p>
                <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TRACK_SUBJECTS[t].map((s, i) => (
                    <li
                      key={s}
                      className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-[var(--background)] px-4 py-3.5 text-sm font-medium"
                    >
                      <span className="font-mono text-xs text-[var(--primary)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?track=${t}`}
                  className="btn-outline mt-5 inline-flex text-sm"
                >
                  Start {TRACK_LABELS[t]} prep
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scoring band - full-width statement (new family) */}
      <section className="bg-[var(--primary)] text-white">
        <div className="scroll-reveal mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <p className="text-sm font-medium uppercase tracking-wide text-white/70">
            Scored like the real exam
          </p>
          <p className="mt-3 max-w-3xl text-2xl font-semibold leading-snug sm:text-3xl">
            On the PLE you pass at a 75% general average with no subject below 50%.
            MEDprep applies the exact rule — and scores every NMAT set the same way,
            subject by subject — so your practice score means what it says.
          </p>
        </div>
      </section>

      {/* Pricing teaser (new family) */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <div className="scroll-reveal flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Start free. Upgrade when you&apos;re ready.
            </h2>
            <p className="mt-3 max-w-md text-[var(--muted)]">
              Practice free every day. Unlock unlimited mock exams and analytics with a plan.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Link href="/signup" className="btn-primary px-5 py-2.5 text-base">
                Get started free
              </Link>
              <Link href="/pricing" className="btn-outline px-5 py-2.5 text-base">
                See all plans
              </Link>
            </div>
          </div>
          <div className="w-full max-w-sm divide-y divide-black/[0.06] rounded-2xl border border-black/[0.06] bg-white">
            {PLANS.map((p) => (
              <div key={p.tier} className="flex items-baseline justify-between px-5 py-4">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-[var(--muted)]">{p.blurb}</div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-lg font-bold">
                    {"₱"}
                    {p.price}
                  </span>
                  <span className="text-xs text-[var(--muted)]">/year</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-black/[0.06] bg-white">
        <div className="scroll-reveal mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="mx-auto max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to start studying?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[var(--muted)]">
            Create a free account and take your first practice session today.
          </p>
          <Link href="/signup" className="btn-primary mt-7 inline-flex px-6 py-3 text-base">
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-[var(--muted)] sm:flex-row sm:px-6">
          <span className="font-semibold tracking-tight text-[var(--foreground)]">
            <span className="text-[var(--primary)]">MED</span>prep
          </span>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-[var(--foreground)]">Pricing</Link>
            <Link href="/privacy" className="hover:text-[var(--foreground)]">Privacy</Link>
            <Link href="/delete-account" className="hover:text-[var(--foreground)]">
              Delete account
            </Link>
            <Link href="/login" className="hover:text-[var(--foreground)]">Sign in</Link>
            <Link href="/signup" className="hover:text-[var(--foreground)]">Get started</Link>
          </div>
          <span>© {new Date().getFullYear()} MEDprep</span>
        </div>
      </footer>
    </div>
  );
}
