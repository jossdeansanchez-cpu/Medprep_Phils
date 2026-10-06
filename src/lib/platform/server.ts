import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  PLATFORM_COOKIE,
  detectPlatform,
  isStoreAppPlatform,
  type Platform,
} from "@/lib/platform";

/**
 * Which surface is this request from? For Server Components.
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
  return detectPlatform({
    userAgent: h.get("user-agent"),
    platformCookie: c.get(PLATFORM_COOKIE)?.value,
    requestedWith: h.get("x-requested-with"),
    referer: h.get("referer"),
  });
});

/** iOS specifically — for anything genuinely Apple-shaped. */
export async function isIosApp(): Promise<boolean> {
  return (await currentPlatform()) === "ios-app";
}

/**
 * iOS *or* Android. This is what every purchase surface should ask: both stores
 * forbid our own checkout, so both get the same treatment.
 */
export async function isStoreApp(): Promise<boolean> {
  return isStoreAppPlatform(await currentPlatform());
}
