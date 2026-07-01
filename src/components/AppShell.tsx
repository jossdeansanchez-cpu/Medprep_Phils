import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import DeviceLimitBlock from "@/components/DeviceLimitBlock";
import type { Profile } from "@/lib/types";
import { getEntitlements } from "@/lib/billing/entitlements";
import { checkDevice } from "@/lib/devices";

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
  const device = await checkDevice();
  if (!device.allowed) {
    return <DeviceLimitBlock maxDevices={device.maxDevices} currentDeviceId={device.deviceId} />;
  }

  const { plan } = await getEntitlements();
  const initials =
    (profile.full_name || "U")
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div className="app-gradient min-h-screen p-2 sm:p-6">
      <div className="glass mx-auto max-w-6xl overflow-hidden lg:flex">
        <Sidebar role={profile.role} name={profile.full_name} plan={plan} />

        <div className="min-w-0 flex-1 lg:border-l lg:border-white/50">
          <MobileNav role={profile.role} name={profile.full_name} plan={plan} />

          <main className="px-4 py-5 sm:px-8 sm:py-6">
            {/* Topbar */}
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                {greeting && (
                  <p className="text-sm font-medium text-[var(--primary)]">{greeting}</p>
                )}
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
              </div>
              <div className="hidden items-center gap-3 sm:flex">
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
                  <span className="text-sm font-medium">
                    {profile.full_name || "Account"}
                  </span>
                </div>
              </div>
            </div>

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
