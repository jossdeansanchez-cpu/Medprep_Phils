import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { signOut } from "@/app/auth/actions";

export default async function Nav() {
  const profile = await getCurrentProfile();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--card)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href={profile ? "/dashboard" : "/"} className="font-semibold tracking-tight">
          <span className="text-[var(--primary)]">MED</span>prep
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {profile ? (
            <>
              <Link href="/dashboard" className="btn-ghost">Dashboard</Link>
              <Link href="/practice" className="btn-ghost">Practice</Link>
              {profile.role === "admin" && (
                <Link href="/admin" className="btn-ghost">Admin</Link>
              )}
              <span className="mx-2 hidden text-[var(--muted)] sm:inline">
                {profile.full_name || "Account"}
                {profile.role === "admin" && (
                  <span className="badge ml-2 bg-[var(--primary)]/10 text-[var(--primary)]">
                    admin
                  </span>
                )}
              </span>
              <form action={signOut}>
                <button type="submit" className="btn-outline">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">Sign in</Link>
              <Link href="/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
