import { createClient } from "@/lib/supabase/server";
import type { getEntitlements } from "@/lib/billing/entitlements";
import { categoryLabel, type ExamCategory } from "@/lib/categories";

export type NotifType = "announcement" | "exam" | "sub";

export type Notif = {
  id: string;
  type: NotifType;
  title: string;
  body?: string | null;
  at: string; // ISO timestamp used for ordering + unread
  href?: string;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Build the current user's notification feed + unread count.
 * Takes the (in-flight) entitlements call so it runs concurrently with this
 * function's own queries instead of waiting on it first — only the final
 * "expiring soon" check needs the resolved value. See perf note in AppShell.
 */
export async function getNotifications(
  entPromise: ReturnType<typeof getEntitlements>
): Promise<{ items: Notif[]; unread: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unread: 0 };

  const since = new Date(Date.now() - 14 * DAY).toISOString();

  // Independent reads — fire together instead of one round trip at a time.
  const [{ data: profile }, { data: anns }, { data: exams }, { data: sub }] = await Promise.all([
    supabase.from("profiles").select("notifications_seen_at, role").eq("id", user.id).single(),
    supabase
      .from("announcements")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("exam_templates")
      .select("id, title, category, created_at")
      .eq("is_published", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("subscriptions")
      .select("status, current_period_end, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const seenAt = profile?.notifications_seen_at
    ? new Date(profile.notifications_seen_at).getTime()
    : 0;

  const items: Notif[] = [];

  for (const a of anns ?? []) {
    items.push({ id: `ann-${a.id}`, type: "announcement", title: a.title, body: a.body, at: a.created_at });
  }

  for (const e of exams ?? []) {
    items.push({
      id: `exam-${e.id}`,
      type: "exam",
      title: `New exam: ${e.title}`,
      body: categoryLabel(e.category as ExamCategory),
      at: e.created_at,
      href: "/exams",
    });
  }

  // Billing is one-time/manual now (no auto-charge subscription object), so
  // there's no "payment failed" server-side status — just an expiring or
  // already-lapsed plan based on current_period_end.
  if (sub?.current_period_end) {
    const end = new Date(sub.current_period_end).getTime();
    const entitled = (await entPromise).entitled;
    if (entitled) {
      const daysLeft = (end - Date.now()) / DAY;
      if (daysLeft <= 7) {
        items.push({
          id: "sub-expiring",
          type: "sub",
          title: "Plan expiring soon",
          body: `Your plan ends on ${new Date(sub.current_period_end).toLocaleDateString()}. Renew anytime from your account.`,
          at: new Date(end - 7 * DAY).toISOString(),
          href: "/account",
        });
      }
    } else if (end < Date.now()) {
      items.push({
        id: "sub-expired",
        type: "sub",
        title: "Plan ended",
        body: "Renew anytime to unlock mock exams and full access again.",
        at: sub.updated_at,
        href: "/account",
      });
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const unread = items.filter((i) => new Date(i.at).getTime() > seenAt).length;
  return { items, unread };
}
