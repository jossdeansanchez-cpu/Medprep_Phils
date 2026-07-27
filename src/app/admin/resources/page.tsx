import { createClient } from "@/lib/supabase/server";
import { deleteResource } from "@/app/admin/actions";
import ResourceForm from "./ResourceForm";
import type { Resource, ResourceKind } from "@/lib/types";

const KIND_LABEL: Record<ResourceKind, string> = {
  book: "Book",
  pdf: "PDF",
  review: "Review exam",
};

export default async function AdminResourcesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("resources")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  const resources = (data ?? []) as Resource[];

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div>
        <h1 className="mb-3 text-xl font-semibold">Resources</h1>
        <ResourceForm />
        <p className="mt-3 text-xs text-[var(--muted)]">
          Resources are visible only to students on the Max Pro plan.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Published <span className="text-[var(--muted)]">({resources.length})</span>
        </h2>
        {resources.length === 0 ? (
          <div className="glass p-5 text-sm text-[var(--muted)]">No resources yet.</div>
        ) : (
          <div className="space-y-3">
            {resources.map((r) => (
              <div key={r.id} className="glass p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="text-xs text-[var(--muted)]">#{r.sort_order}</span>
                    </div>
                    <p className="font-semibold">{r.title}</p>
                    {r.description && (
                      <p className="mt-1 text-sm text-[var(--muted)]">{r.description}</p>
                    )}
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs text-[var(--primary)] underline"
                    >
                      {r.url}
                    </a>
                  </div>
                  <form action={deleteResource.bind(null, r.id)}>
                    <button className="btn-ghost text-xs text-[var(--danger)]" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
