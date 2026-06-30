import Sidebar from "@/components/Sidebar";
import type { Profile } from "@/lib/types";
import { getEntitlements } from "@/lib/billing/entitlements";

export default async function AppShell({
  profile,
  greeting,
  title,
  children,
}: {
  profile: Profile;
  greeting?: string;
  title: string;
  children: React.ReactNode;
}) {
  const { plan } = await getEntitlements();
  const initials =
    (profile.full_name || "U")
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="app-gradient min-h-screen p-4 sm:p-6">
      <div className="glass mx-auto flex max-w-6xl overflow-hidden">
        <Sidebar role={profile.role} name={profile.full_name} plan={plan} />

        <main className="min-w-0 flex-1 border-l border-white/50 px-5 py-6 sm:px-8">
          {/* Topbar */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              {greeting && (
                <p className="text-sm font-medium text-[var(--primary)]">{greeting}</p>
              )}
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/60 text-[var(--muted)] hover:bg-white">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/60 text-[var(--muted)] hover:bg-white">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
              </button>
              <div className="flex items-center gap-2 rounded-full bg-white/60 py-1 pl-1 pr-3">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
                  {initials}
                </div>
                <span className="hidden text-sm font-medium sm:inline">
                  {profile.full_name || "Account"}
                </span>
              </div>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
