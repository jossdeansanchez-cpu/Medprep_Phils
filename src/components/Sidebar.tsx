"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import type { Role } from "@/lib/types";
import { planLabel, type PlanTier } from "@/lib/billing/plans";
import { visibleNavItems, isActive } from "@/components/nav-items";

const ICON = "h-[18px] w-[18px]";

export default function Sidebar({
  role,
  name,
  plan = "free",
}: {
  role: Role;
  name: string | null;
  plan?: PlanTier;
}) {
  const pathname = usePathname();
  const visible = visibleNavItems(role);
  const showUpgrade = plan === "free" || plan === "basic";

  return (
    <aside className="hidden w-60 shrink-0 flex-col px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-sm font-bold text-white">
          M
        </div>
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-[var(--primary)]">MED</span>prep
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {visible.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[color,background-color,transform] duration-200 ${
                active
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:translate-x-0.5 hover:bg-white/50 hover:text-[var(--foreground)]"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-white/50 pt-4">
        <Link
          href="/account"
          className="mb-2 flex items-center gap-2 px-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
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
            className="mb-2 flex items-center gap-3 rounded-xl bg-[var(--primary)]/10 px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/15"
          >
            ✦ Upgrade plan
          </Link>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--muted)] transition-colors hover:bg-white/50 hover:text-[var(--foreground)]"
          >
            <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
