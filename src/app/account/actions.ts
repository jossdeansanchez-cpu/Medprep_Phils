"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTrack } from "@/lib/tracks";

/** Remove one of the current user's registered devices (frees a device slot). */
export async function removeDevice(deviceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("user_devices")
    .delete()
    .eq("user_id", user.id)
    .eq("device_id", deviceId);

  revalidatePath("/account");
  revalidatePath("/", "layout");
}

/**
 * Permanently delete the signed-in student's own account.
 *
 * Required by App Store Guideline 5.1.1(v): an app that lets people create an
 * account must let them delete it from inside the app, and disabling it isn't
 * enough — the personal data has to go too.
 *
 * Deletes the auth user, which cascades to the profile and from there to
 * devices, attempts and the subscription row. Admins are refused: an admin
 * removing themselves would leave the question bank unmanageable, and they
 * aren't the users this guideline is about.
 */
export async function deleteMyAccount(
  confirmation: string
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  // Typed confirmation, so this can't happen on a stray tap.
  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { error: 'Type DELETE to confirm.' };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin") {
    return { error: "Admin accounts can't be deleted here." };
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  // Outside any try/catch: redirect() works by throwing NEXT_REDIRECT.
  redirect("/?deleted=1");
}

/**
 * Switch which exam the student is preparing for.
 *
 * Deliberately does not touch the subscription. A plan is bought against a
 * track, and public.effective_plan() reports 'free' once the two diverge — so
 * someone with PLE Pro who moves to NMAT drops to the free tier on NMAT and
 * gets their PLE plan back untouched if they switch return. The UI warns about
 * this before the switch; enforcing it here would only duplicate the database.
 */
export async function setMyTrack(track: string): Promise<{ error: string } | void> {
  const next = parseTrack(track);
  if (!next) return { error: "Unknown exam track." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ track: next })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Track decides the exam catalogue, the nav badges and the plan gates, so the
  // whole shell is stale after this.
  revalidatePath("/", "layout");
}

/** Mark the notification feed as seen (clears the unread badge). */
export async function markNotificationsSeen() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  revalidatePath("/", "layout");
}
