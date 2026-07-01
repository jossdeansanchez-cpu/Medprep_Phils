"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
