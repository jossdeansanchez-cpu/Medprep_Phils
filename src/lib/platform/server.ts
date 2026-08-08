import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { PLATFORM_COOKIE, detectPlatform, type Platform } from "@/lib/platform";

/**
 * Is this request coming from the iOS app? For Server Components.
 *
 * Wrapped in React's `cache` so the eight-or-so components that ask during one
 * render share a single header read.
 *
 * Reading headers() opts a route into dynamic rendering — which costs nothing
 * here, because every route is already dynamic: src/lib/supabase/server.ts
 * awaits cookies() on every page, and src/lib/devices.ts already reads the
 * user-agent on every AppShell render.
 */
export const currentPlatform = cache(async (): Promise<Platform> => {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return detectPlatform(h.get("user-agent"), c.get(PLATFORM_COOKIE)?.value);
});

/** Convenience wrapper — the only question callers actually ask. */
export async function isIosApp(): Promise<boolean> {
  return (await currentPlatform()) === "ios-app";
}
