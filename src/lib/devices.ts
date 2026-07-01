import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { PlanTier } from "@/lib/billing/plans";

export const DEVICE_LIMITS: Record<PlanTier, number> = {
  free: 1,
  basic: 1,
  pro: 2,
  max_pro: 3,
};

export type DeviceCheck = {
  allowed: boolean;
  deviceCount: number;
  maxDevices: number;
  deviceId: string | null;
};

/** Register/heartbeat the current device and return whether it's allowed. */
export async function checkDevice(): Promise<DeviceCheck> {
  const cookieStore = await cookies();
  const deviceId = cookieStore.get("md_device")?.value ?? null;
  // No cookie yet (very first request) → allow; the cookie lands for next time.
  if (!deviceId) return { allowed: true, deviceCount: 0, maxDevices: 0, deviceId: null };

  const ua = (await headers()).get("user-agent") ?? null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("register_device", {
    p_device: deviceId,
    p_user_agent: ua,
  });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row ? !!row.allowed : true,
    deviceCount: row?.device_count ?? 0,
    maxDevices: row?.max_devices ?? 0,
    deviceId,
  };
}

export type DeviceRow = {
  device_id: string;
  user_agent: string | null;
  first_seen: string;
  last_seen: string;
};

/** The current user's registered devices, oldest first. */
export async function listMyDevices(): Promise<DeviceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_devices")
    .select("device_id, user_agent, first_seen, last_seen")
    .order("first_seen", { ascending: true });
  return (data ?? []) as DeviceRow[];
}

/** A short human label from a user-agent string. */
export function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";
  const os =
    /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "device";
  return `${browser} on ${os}`;
}
