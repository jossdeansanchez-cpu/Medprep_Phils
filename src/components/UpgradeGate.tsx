import Link from "next/link";

export default function UpgradeGate({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/[0.06] p-5 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>
      <Link href="/pricing" className="btn-primary mt-3 inline-flex">
        See plans
      </Link>
    </div>
  );
}
