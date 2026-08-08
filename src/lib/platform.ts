/**
 * Which surface a request came from: the website, or the iOS app.
 *
 * The iOS app is a Capacitor shell whose WKWebView loads medprepacad.com
 * directly, so the UI it shows is rendered by this same server. App Store
 * Guideline 3.1.1 forbids selling digital subscriptions outside Apple's IAP,
 * and the "link to your own site" allowance does not extend to the Philippines
 * storefront — so every purchase surface has to be suppressed for that client.
 * The server therefore has to be able to tell the two apart per request.
 *
 * Deliberately free of framework imports: the proxy (src/proxy.ts) runs before
 * `next/headers` is usable, Server Components read via ./platform/server, and
 * Client Components read `navigator`. One source of truth for all three.
 */

/** Appended to the WebView user-agent by capacitor.config.ts. */
export const IOS_APP_UA_TOKEN = "MEDprepiOS";

/** Sticky marker set by the proxy on the first request from the app. */
export const PLATFORM_COOKIE = "md_platform";
export const PLATFORM_COOKIE_VALUE = "ios";

export type Platform = "ios-app" | "web";

/**
 * Two independent signals, and *either* is enough.
 *
 * Fail closed on purpose. If the user-agent were ever missing — a WebView
 * process recycle, a plugin resetting it — a UA-only check would quietly show
 * the pricing page inside the App Store build. That is a rejection, not a
 * cosmetic glitch, so a stale cookie erring towards "hide the pricing" is the
 * safer failure. There is no cross-contamination risk: a remote-URL WKWebView
 * has its own cookie store, separate from Safari's on the same phone.
 */
export function detectPlatform(
  userAgent: string | null | undefined,
  platformCookie: string | null | undefined
): Platform {
  if (userAgent?.includes(IOS_APP_UA_TOKEN)) return "ios-app";
  if (platformCookie === PLATFORM_COOKIE_VALUE) return "ios-app";
  return "web";
}

/** Client Components only — Server Components use isIosApp() from ./platform/server. */
export function isIosAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(IOS_APP_UA_TOKEN);
}
