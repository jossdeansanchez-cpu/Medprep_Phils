import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { coerceTrack } from "@/lib/tracks";

/**
 * How recently a user must have been created for the signup track to apply.
 *
 * The Google button on the signup form sends ?track=; the one on the login form
 * does not. This window is a second guard: if an existing student re-runs the
 * signup flow, their chosen track is theirs already and must not be rewritten
 * by whatever the form happened to have selected.
 */
const NEW_USER_WINDOW_MS = 2 * 60 * 1000;

/**
 * Handles two different arrivals:
 *   - a Supabase email link (password recovery): token_hash + type, or code
 *   - the Google OAuth redirect: code, plus our own next/track params
 *
 * Both exchange for a session; they differ only in where a failure should send
 * the user. An OAuth failure used to land on /forgot-password, which is
 * baffling when you never asked to reset anything.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const next = params.get("next") || "/dashboard";
  const origin = req.nextUrl.origin;
  const supabase = await createClient();

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const track = params.get("track");

  // Google reports a refusal in-band rather than by failing the redirect.
  const oauthError = params.get("error_description") || params.get("error");
  if (oauthError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthError)}`);
  }

  // An OAuth arrival is the one carrying our own params; a recovery link is not.
  const fromOAuth = Boolean(code && (params.has("track") || params.has("next")));

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await applySignupTrack(supabase, track);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    fromOAuth
      ? `${origin}/login?error=${encodeURIComponent("Could not finish signing in with Google.")}`
      : `${origin}/forgot-password?error=expired`
  );
}

/**
 * Set the track a brand-new Google signup chose on the form.
 *
 * public.handle_new_user() reads `track` from user metadata and Google supplies
 * none, so without this every Google signup defaults to PLE — an NMAT student
 * would get the wrong question bank and the wrong plan with nothing to tell
 * them. Only ever touches an account created moments ago by this same flow.
 *
 * Failures are swallowed on purpose: the student is signed in, and the track is
 * changeable from Account. Blocking the redirect over it would be worse.
 */
async function applySignupTrack(
  supabase: Awaited<ReturnType<typeof createClient>>,
  raw: string | null
): Promise<void> {
  if (!raw) return;
  const track = coerceTrack(raw);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const createdAt = Date.parse(user.created_at ?? "");
  if (!Number.isFinite(createdAt)) return;
  if (Date.now() - createdAt > NEW_USER_WINDOW_MS) return;

  await supabase.from("profiles").update({ track }).eq("id", user.id);
}
