"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import type { Role } from "@/lib/types";

type Item = { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean; exact?: boolean };

const ICON = "h-[18px] w-[18px]";

const items: Item[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    exact: true,
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/practice",
    label: "Study mode",
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M13 3v5h5" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Overview",
    adminOnly: true,
    exact: true,
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 13h8V3H3zM13 21h8V3h-8zM3 21h8v-6H3z" />
      </svg>
    ),
  },
  {
    href: "/admin/questions",
    label: "Question Bank",
    adminOnly: true,
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 5v14a2 2 0 0 0 2 2h13" />
        <path d="M7 3h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    href: "/admin/upload",
    label: "Upload",
    adminOnly: true,
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
    ),
  },
  {
    href: "/admin/exams",
    label: "Exams",
    adminOnly: true,
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    href: "/admin/students",
    label: "Students",
    adminOnly: true,
    icon: (
      <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export default function Sidebar({
  role,
  name,
}: {
  role: Role;
  name: string | null;
}) {
  const pathname = usePathname();
  const visible = items.filter((i) => !i.adminOnly || role === "admin");

  return (
    <aside className="flex w-60 shrink-0 flex-col px-4 py-6">
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
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:bg-white/50 hover:text-[var(--foreground)]"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-white/50 pt-4">
        <div className="mb-3 px-2 text-xs text-[var(--muted)]">
          {name || "Account"}
          {role === "admin" && (
            <span className="badge ml-2 bg-[var(--primary)]/15 text-[var(--primary)]">admin</span>
          )}
        </div>
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
