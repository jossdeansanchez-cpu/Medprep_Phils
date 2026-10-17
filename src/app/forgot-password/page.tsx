import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

/**
 * /auth/callback sends a failed recovery here with ?error=expired. Until this
 * page read it, that arrived as a bare form with no explanation: the student
 * clicked the link in their email, landed back where they started, and was
 * given no reason why. Several would reasonably conclude the whole thing was
 * broken rather than that one link had been used or had timed out.
 */
const ERROR_MESSAGES: Record<string, string> = {
  expired:
    "That reset link has expired or was already used. Each link works once — enter your email to get a fresh one.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? error) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      {message && (
        <p className="mb-3 rounded-lg bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]">
          {message}
        </p>
      )}
      <ForgotPasswordForm />
      <p className="mt-4 text-center text-sm text-[var(--muted)]">
        Remembered it?{" "}
        <Link href="/login" className="text-[var(--primary)] underline">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
