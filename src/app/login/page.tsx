import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentProfile } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  if (await getCurrentProfile()) redirect("/dashboard");
  const { redirect: redirectTo } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <AuthForm mode="login" redirectTo={redirectTo} />
    </main>
  );
}
