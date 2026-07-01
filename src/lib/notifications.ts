import { createClient } from "@/lib/supabase/server";
import { getEntitlements } from "@/lib/billing/entitlements";
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

/** Build the current user's notification feed + unread count. */
export async function getNotifications(): Promise<{ items: Notif[]; unread: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], unread: 0 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("notifications_seen_at")
    .eq("id", user.id)
    .single();
  const seenAt = profile?.notifications_seen_at
    ? new Date(profile.notifications_seen_at).getTime()
    : 0;

  const items: Notif[] = [];

  // Admin announcements
  const { data: anns } = await supabase
    .from("announcements")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  for (const a of anns ?? []) {
    items.push({ id: `ann-${a.id}`, type: "announcement", title: a.title, body: a.body, at: a.created_at });
  }

  // Newly added exams (published, last 14 days)
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  const { data: exams } = await supabase
    .from("exam_templates")
    .select("id, title, category, created_at")
    .eq("is_published", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(6);
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

  // Subscription state (expiring / expired / payment issue)
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const ent = await getEntitlements();
  if (sub) {
    if (sub.status === "past_due") {
      items.push({
        id: "sub-pastdue",
        type: "sub",
        title: "Payment failed",
        body: "Update your payment method to keep full access.",
        at: sub.updated_at,
        href: "/account",
      });
    } else if (sub.status === "canceled") {
      items.push({
        id: "sub-canceled",
        type: "sub",
        title: "Subscription ended",
        body: "Resubscribe anytime to unlock mock exams again.",
        at: sub.updated_at,
        href: "/pricing",
      });
    } else if (ent.entitled && sub.current_period_end) {
      const end = new Date(sub.current_period_end).getTime();
      const daysLeft = (end - Date.now()) / DAY;
      if (daysLeft <= 7) {
        items.push({
          id: "sub-expiring",
          type: "sub",
          title: "Subscription expiring soon",
          body: `Your plan ends on ${new Date(sub.current_period_end).toLocaleDateString()}.`,
          at: new Date(end - 7 * DAY).toISOString(),
          href: "/account",
        });
      }
    }
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const unread = items.filter((i) => new Date(i.at).getTime() > seenAt).length;
  return { items, unread };
}
