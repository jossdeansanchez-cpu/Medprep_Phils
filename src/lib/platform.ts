/**
 * Which surface a request came from: the website, the iOS app, or the Android
 * app on Google Play.
 *
 * Both store builds load medprepacad.com directly — iOS as a Capacitor
 * WKWebView, Android as a Trusted Web Activity — so the UI they show is
 * rendered by this same server. App Store Guideline 3.1.1 and Google Play's
 * Payments policy both forbid selling digital subscriptions outside their own
 * billing, and the "link to your own site" allowance covers neither storefront
 * in the Philippines. Every purchase surface therefore has to be suppressed for
 * both clients, and the server has to be able to tell them apart per request.
 *
 * Deliberately free of framework imports: the proxy (src/proxy.ts) runs before
 * `next/headers` is usable, Server Components read via ./platform/server, and
 * Client Components read `navigator`. One source of truth for all three.
 */

/** Appended to the WebView user-agent by capacitor.config.ts. */
export const IOS_APP_UA_TOKEN = "MEDprepiOS";

/**
 * The Play package that ships the TWA. Must stay in step with
 * public/.well-known/assetlinks.json — if they drift, the app loses both its
 * full-screen chrome and this detection at the same time.
 */
export const ANDROID_APP_PACKAGE = "com.medprepacad.app";

/** Sticky marker set by the proxy on the first request from the iOS app. */
export const PLATFORM_COOKIE = "md_platform";
export const PLATFORM_COOKIE_VALUE = "ios";

export type Platform = "ios-app" | "android-app" | "web";

/** Everything detection looks at, named so the call sites can't transpose them. */
export type PlatformSignals = {
  userAgent?: string | null;
  platformCookie?: string | null;
  /** Chrome sets this to the launching package inside a TWA. */
  requestedWith?: string | null;
  /** A TWA's launch navigation carries an android-app:// referrer. */
  referer?: string | null;
};

/**
 * iOS gets two independent signals and fails closed; Android gets two per-request
 * signals and cannot.
 *
 * For iOS, either signal is enough. If the user-agent were ever missing — a
 * WebView process recycle, a plugin resetting it — a UA-only check would quietly
 * show the pricing page inside the App Store build. That is a rejection, not a
 * cosmetic glitch, so a stale cookie erring towards "hide the pricing" is the
 * safer failure. There is no cross-contamination risk: a remote-URL WKWebView
 * has its own cookie store, separate from Safari's on the same phone.
 *
 * Android cannot have that safety net, because the opposite is true: a TWA runs
 * inside Chrome and shares Chrome's cookie jar for this origin. A sticky cookie
 * set in the app would still be there when the same person opens
 * medprepacad.com in Chrome, and would hide the pricing page from a paying
 * customer in their own browser — so Android is detected per request only, and
 * a request that arrives without either header is treated as web.
 *
 * That makes Android the weaker guarantee of the two. The durable fix is to give
 * the TWA its own origin (app.medprepacad.com), which makes the Host header the
 * signal and restores a cookie that cannot leak; it needs a new bundle and its
 * own assetlinks.json, so it is deliberately not done here.
 */
export function detectPlatform(signals: PlatformSignals): Platform {
  const { userAgent, platformCookie, requestedWith, referer } = signals;

  if (userAgent?.includes(IOS_APP_UA_TOKEN)) return "ios-app";
  if (platformCookie === PLATFORM_COOKIE_VALUE) return "ios-app";

  if (requestedWith === ANDROID_APP_PACKAGE) return "android-app";
  if (referer?.startsWith(`android-app://${ANDROID_APP_PACKAGE}`)) return "android-app";

  return "web";
}

/**
 * The question every purchase surface actually asks. Checkout, pricing and the
 * upgrade CTAs care that the client is a store build, not which store.
 */
export function isStoreAppPlatform(platform: Platform): boolean {
  return platform === "ios-app" || platform === "android-app";
}

/** Client Components only — Server Components use isIosApp() from ./platform/server. */
export function isIosAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(IOS_APP_UA_TOKEN);
}
