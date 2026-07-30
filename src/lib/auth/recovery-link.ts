import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mint a password-recovery link that points at our own /auth/callback.
 *
 * Supabase's built-in mailer is documented as best-effort and rate limited per
 * hour — fine for trying things out, not for real students. Generating the link
 * ourselves lets us deliver it over the SMTP the app already uses for its other
 * mail, and lets an admin hand the link to a student directly.
 *
 * `hashed_token` is the single-use recovery token. /auth/callback exchanges it
 * via verifyOtp, which works cross-device — the student can open the link on a
 * different phone from the one that requested it.
 */
export async function createRecoveryLink(
  email: string
): Promise<{ link?: string; error?: string }> {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://medprep-teal.vercel.app";
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${site}/auth/callback?next=/reset-password` },
  });

  if (error) return { error: error.message };

  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) return { error: "Supabase did not return a recovery token." };

  return {
    link: `${site}/auth/callback?token_hash=${tokenHash}&type=recovery&next=/reset-password`,
  };
}
