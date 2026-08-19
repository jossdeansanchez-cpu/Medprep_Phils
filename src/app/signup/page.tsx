import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentProfile } from "@/lib/auth";
import { coerceTrack } from "@/lib/tracks";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>;
}) {
  if (await getCurrentProfile()) redirect("/dashboard");

  // Landing-page calls to action link here as /signup?track=nmat, so the exam
  // the visitor clicked on is already selected on the form.
  const { track } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <AuthForm mode="signup" defaultTrack={coerceTrack(track)} />
    </main>
  );
}
