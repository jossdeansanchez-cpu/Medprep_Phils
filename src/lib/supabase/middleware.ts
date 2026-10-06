import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PLATFORM_COOKIE,
  PLATFORM_COOKIE_VALUE,
  detectPlatform,
  isStoreAppPlatform,
} from "@/lib/platform";

/**
 * Routes neither store build may reach. App Store Guideline 3.1.1 and Google
 * Play's Payments policy both forbid selling digital subscriptions outside their
 * own billing, and the "link to your own site" allowance covers neither
 * storefront in the Philippines.
 *
 * The pages themselves also call notFound() — this is the outer layer, so a
 * purchase route added later is blocked even if nobody remembers to guard it.
 * /api/paymongo/webhook is deliberately absent: PayMongo calls it
 * server-to-server and it never carries an app's headers.
 */
const STORE_BLOCKED_PREFIXES = [
  "/pricing",
  "/checkout",
  "/api/paymongo/create-intent",
  "/api/paymongo/confirm-intent",
];

/**
 * Refreshes the Supabase auth session on every request and enforces
 * route-level access:
 *   - unauthenticated users hitting protected routes -> /login
 *   - non-admins hitting /admin/* -> /dashboard
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Read the platform from the *request* — never from a header we inject here.
  // setAll() above mutates request.cookies and rebuilds the response, so a
  // snapshot of request.headers taken before that would drop the refreshed
  // Supabase cookies and cause intermittent logouts.
  const platform = detectPlatform({
    userAgent: request.headers.get("user-agent"),
    platformCookie: request.cookies.get(PLATFORM_COOKIE)?.value,
    requestedWith: request.headers.get("x-requested-with"),
    referer: request.headers.get("referer"),
  });
  const isIosApp = platform === "ios-app";
  const isStoreApp = isStoreAppPlatform(platform);

  if (isStoreApp) {
    // The landing page carries pricing nav, a plans CTA and a ₱ price table.
    if (path === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (STORE_BLOCKED_PREFIXES.some((p) => path.startsWith(p))) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const protectedPrefixes = ["/dashboard", "/admin", "/exam", "/practice", "/results"];
  const isProtected = protectedPrefixes.some((p) => path.startsWith(p));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Sticky marker so a request that arrives without the app's user-agent is
  // still recognised. Additive — it never touches the Supabase cookies above.
  //
  // iOS only, deliberately. A TWA shares Chrome's cookie jar for this origin, so
  // the same marker set from the Android app would follow the user into Chrome
  // and hide the pricing page from them in their own browser. See the detection
  // comment in src/lib/platform.ts.
  if (isIosApp && request.cookies.get(PLATFORM_COOKIE)?.value !== PLATFORM_COOKIE_VALUE) {
    response.cookies.set(PLATFORM_COOKIE, PLATFORM_COOKIE_VALUE, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
