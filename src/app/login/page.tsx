import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import GoogleSignIn from "@/components/GoogleSignIn";
import { getCurrentProfile } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>;
}) {
  if (await getCurrentProfile()) redirect("/dashboard");
  const { redirect: redirectTo, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      {/* Set by /auth/callback when a Google sign-in is refused or fails. */}
      {error && (
        <p className="mb-3 rounded-lg bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <AuthForm
        mode="login"
        redirectTo={redirectTo}
        oauth={<GoogleSignIn mode="login" redirectTo={redirectTo} />}
      />
    </main>
  );
}
