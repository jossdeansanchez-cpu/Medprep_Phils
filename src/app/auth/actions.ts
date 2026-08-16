"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRecoveryLink } from "@/lib/auth/recovery-link";
import { sendEmail, emailLayout, emailConfigured } from "@/lib/email";
import { coerceTrack } from "@/lib/tracks";

export type AuthState = { error?: string; message?: string } | undefined;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(redirectTo || "/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const track = coerceTrack(formData.get("track"));

  if (password.length < 6) return { error: "Password must be at least 6 characters." };
  if (!email.includes("@")) return { error: "Please enter a valid email address." };

  // Create the account already email-confirmed (server-side, service role) so the
  // student can sign in immediately. This avoids depending on confirmation-email
  // delivery, which is unreliable on Supabase's built-in mailer.
  //
  // `track` rides along in user_metadata because public.handle_new_user() reads
  // the profile row's values from there — no second write after signup.
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, track },
  });
  if (createError) {
    const msg = /already.*registered|already been registered|duplicate/i.test(createError.message)
      ? "An account with this email already exists. Try signing in."
      : createError.message;
    return { error: msg };
  }

  // Establish the session and send them into the app.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { message: "Account created. You can now sign in." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/** Email a password-reset link. Always reports success (don't reveal whether
 *  an email is registered). Link lands on /auth/callback → /reset-password. */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email.includes("@")) return { error: "Please enter a valid email address." };

  // Always the same reply, whatever happens below: a different message for a
  // known vs unknown address would let anyone enumerate who has an account.
  const neutral: AuthState = {
    message:
      "If an account exists for that email, we've sent a reset link. Check your inbox (and spam).",
  };

  if (emailConfigured()) {
    // Preferred path: mint the link ourselves and send it over the app's own
    // SMTP. Supabase's built-in mailer is best-effort and rate limited per
    // hour, which is why students were never receiving these.
    const { link } = await createRecoveryLink(email);
    if (link) {
      await sendEmail({
        to: email,
        subject: "Reset your MEDprep password",
        html: emailLayout({
          heading: "Set a new password",
          body: "You asked to reset your MEDprep password. This link works once and expires shortly. If you didn't ask for it, you can ignore this email — your password stays as it is.",
          cta: { label: "Choose a new password", href: link },
        }),
      });
    }
    return neutral;
  }

  // Fallback while SMTP isn't configured: Supabase's built-in mailer. Delivery
  // is best-effort, so this is a stopgap rather than the intended path.
  //
  // Point straight at /reset-password rather than /auth/callback: this mailer
  // hands the session back in the URL fragment, which a route handler cannot
  // read. RecoverySession picks it up in the browser instead.
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://medprep-teal.vercel.app";
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${site}/reset-password`,
  });

  return neutral;
}

/** Set a new password for the current (recovery-session) user. */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link has expired. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
