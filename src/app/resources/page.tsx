import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import UpgradeGate from "@/components/UpgradeGate";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, hasAtLeast } from "@/lib/billing/entitlements";
import type { Resource, ResourceKind } from "@/lib/types";

const KIND_LABEL: Record<ResourceKind, string> = {
  book: "Book",
  pdf: "PDF",
  review: "Review exam",
};

const KIND_ICON: Record<ResourceKind, string> = {
  book: "📘",
  pdf: "📄",
  review: "📝",
};

const KIND_ORDER: ResourceKind[] = ["book", "pdf", "review"];

export default async function ResourcesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { plan } = await getEntitlements();

  // Available on every paid plan (Basic and up) — only the free plan is gated.
  if (!hasAtLeast(plan, "basic")) {
    return (
      <AppShell profile={profile} greeting="Study library" title="Resources">
        <div className="mx-auto max-w-xl">
          <UpgradeGate
            title="Resources come with any paid plan"
            body="Subscribe to unlock curated books, PDF references and review exams — starting with Basic."
          />
        </div>
      </AppShell>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const resources = (data ?? []) as Resource[];

  return (
    <AppShell profile={profile} greeting="Study library" title="Resources">
      {resources.length === 0 ? (
        <div className="glass p-5 text-sm text-[var(--muted)]">
          No resources yet — your admin will add books, PDFs and review exams here.
        </div>
      ) : (
        <div className="space-y-8">
          {KIND_ORDER.map((kind) => {
            const items = resources.filter((r) => r.kind === kind);
            if (items.length === 0) return null;
            return (
              <section key={kind}>
                <h2 className="mb-3 text-lg font-semibold">
                  {KIND_ICON[kind]} {KIND_LABEL[kind]}s
                  <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                    ({items.length})
                  </span>
                </h2>
                <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((r) => (
                    <a
                      key={r.id}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="glass lift flex flex-col gap-2 p-5"
                    >
                      <span className="badge self-start bg-[var(--primary)]/10 text-[var(--primary)]">
                        {KIND_LABEL[r.kind]}
                      </span>
                      <h3 className="font-semibold">{r.title}</h3>
                      {r.description && (
                        <p className="text-sm text-[var(--muted)]">{r.description}</p>
                      )}
                      <span className="mt-auto pt-2 text-sm font-medium text-[var(--primary)]">
                        Open →
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
