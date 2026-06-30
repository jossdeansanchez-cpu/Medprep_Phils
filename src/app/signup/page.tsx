import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentProfile } from "@/lib/auth";

export default async function SignupPage() {
  if (await getCurrentProfile()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <AuthForm mode="signup" />
      <p className="mt-4 text-center text-xs text-[var(--muted)]">
        The first account created becomes the administrator.
      </p>
    </main>
  );
}
