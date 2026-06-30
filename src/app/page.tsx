import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import Nav from "@/components/Nav";

export default async function Home() {
  if (await getCurrentProfile()) redirect("/dashboard");

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4">
        <section className="py-20 text-center">
          <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
            Philippine Physician Licensure Exam
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Practice for the PRC board exam the way it&apos;s actually given.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">
            Timed mock exams across all 12 subjects with PLE-style scoring, plus an untimed
            study mode with instant explanations. Built from your school&apos;s own question bank.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/signup" className="btn-primary">Create an account</Link>
            <Link href="/login" className="btn-outline">Sign in</Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {[
            {
              title: "Realistic mock exams",
              body: "Randomized questions per subject, a countdown timer, and automatic per-subject scoring.",
            },
            {
              title: "PLE-style results",
              body: "General average plus every subject score, with the 75% average / 50% minimum passing rule.",
            },
            {
              title: "Study mode",
              body: "Work through any subject untimed and see the correct answer and rationale immediately.",
            },
          ].map((f) => (
            <div key={f.title} className="card">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
