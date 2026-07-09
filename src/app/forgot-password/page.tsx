import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
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
