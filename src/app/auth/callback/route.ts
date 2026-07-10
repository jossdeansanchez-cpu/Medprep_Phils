import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the link from a Supabase email (password recovery). Supports both
 * link formats Supabase can send:
 *   - token_hash + type  -> verifyOtp (stateless, works cross-device)
 *   - code               -> exchangeCodeForSession (PKCE, same browser)
 * On success, forwards to `next`; otherwise back to /forgot-password.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const next = params.get("next") || "/dashboard";
  const origin = req.nextUrl.origin;
  const supabase = await createClient();

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/forgot-password?error=expired`);
}
