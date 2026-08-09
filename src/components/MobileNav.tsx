"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import type { Role } from "@/lib/types";
import { planLabel, type PlanTier } from "@/lib/billing/plans";
import { visibleNavItems, isActive } from "@/components/nav-items";

export default function MobileNav({
  role,
  name,
  plan = "free",
  isIosApp = false,
}: {
  role: Role;
  name: string | null;
  plan?: PlanTier;
  isIosApp?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = visibleNavItems(role, plan);
  // See Sidebar — suppressed in the iOS app for Guideline 3.1.1.
  const showUpgrade = !isIosApp && (plan === "free" || plan === "basic");

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="lg:hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/50 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
            M
          </span>
          <span>
            <span className="text-[var(--primary)]">MED</span>prep
          </span>
        </Link>
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl bg-white/60 text-[var(--foreground)] hover:bg-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </div>

      {/* Drawer + backdrop */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col bg-[var(--card)] px-4 py-5 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-lg font-semibold tracking-tight">
                <span className="text-[var(--primary)]">MED</span>prep
              </span>
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] hover:bg-black/[0.05]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {visible.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="mb-2 flex items-center gap-2 px-2 text-xs text-[var(--muted)]"
              >
                <span>{name || "Account"}</span>
                <span className="badge bg-[var(--primary)]/10 text-[var(--primary)]">
                  {planLabel(plan)}
                </span>
                {role === "admin" && <span className="badge bg-black/[0.06]">admin</span>}
              </Link>
              {showUpgrade && (
                <Link
                  href="/pricing"
                  onClick={() => setOpen(false)}
                  className="mb-2 flex items-center gap-3 rounded-xl bg-[var(--primary)]/10 px-3 py-2 text-sm font-medium text-[var(--primary)]"
                >
                  ✦ Upgrade plan
                </Link>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-black/[0.04]"
                >
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign out
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
