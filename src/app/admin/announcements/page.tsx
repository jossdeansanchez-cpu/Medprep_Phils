import { createClient } from "@/lib/supabase/server";
import { createAnnouncement, deleteAnnouncement } from "@/app/admin/actions";

type Row = { id: string; title: string; body: string | null; created_at: string };

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false });
  const announcements = (data ?? []) as Row[];

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div>
        <h1 className="mb-3 text-xl font-semibold">New announcement</h1>
        <form action={createAnnouncement} className="glass space-y-3 p-5">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" required className="input" placeholder="Exam schedule update" />
          </div>
          <div>
            <label className="label" htmlFor="body">Message</label>
            <textarea id="body" name="body" rows={4} className="input" placeholder="Write your announcement…" />
          </div>
          <button type="submit" className="btn-primary w-full">Send to all students</button>
          <p className="text-xs text-[var(--muted)]">
            Announcements appear in every user&apos;s notification bell.
          </p>
        </form>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Sent <span className="text-[var(--muted)]">({announcements.length})</span>
        </h2>
        {announcements.length === 0 ? (
          <div className="glass p-5 text-sm text-[var(--muted)]">No announcements yet.</div>
        ) : (
          <div className="space-y-3">
            {announcements.map((a) => (
              <div key={a.id} className="glass p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.title}</p>
                    {a.body && <p className="mt-1 text-sm text-[var(--muted)]">{a.body}</p>}
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                  <form action={deleteAnnouncement.bind(null, a.id)}>
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
