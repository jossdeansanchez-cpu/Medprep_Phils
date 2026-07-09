import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="card space-y-3">
          <h1 className="text-xl font-semibold">Reset link expired</h1>
          <p className="text-sm text-[var(--muted)]">
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <Link href="/forgot-password" className="btn-primary inline-flex">
            Request a new link
          </Link>
        </div>
      )}
    </main>
  );
}
