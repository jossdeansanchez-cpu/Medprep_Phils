import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Returns the current user's profile, or null if not signed in. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (profile as Profile) ?? null;
}

/** Throws unless the current user is an admin. Use to guard admin server actions. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Not authorized");
  }
  return profile;
}
