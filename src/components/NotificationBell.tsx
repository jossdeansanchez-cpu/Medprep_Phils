"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markNotificationsSeen } from "@/app/account/actions";
import type { Notif } from "@/lib/notifications";

const ICON: Record<string, string> = { announcement: "📣", exam: "📝", sub: "⏳" };

export default function NotificationBell({
  items,
  unread,
}: {
  items: Notif[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0 && !seen) {
      setSeen(true);
      startTransition(() => markNotificationsSeen());
    }
  }

  const badge = seen ? 0 : unread;

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-full bg-white/60 text-[var(--muted)] transition-colors duration-200 hover:bg-white"
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="pop-in absolute right-0 z-50 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="font-semibold">Notifications</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                  You&apos;re all caught up.
                </p>
              ) : (
                items.map((n) => {
                  const inner = (
                    <div className="flex gap-3 px-4 py-3 hover:bg-black/[0.03]">
                      <span className="text-lg leading-none">{ICON[n.type]}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{n.title}</p>
                        {n.body && (
                          <p className="mt-0.5 text-xs text-[var(--muted)]">{n.body}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                          {new Date(n.at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  );
                  return n.href ? (
                    <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="block border-b border-[var(--border)] last:border-0">
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className="border-b border-[var(--border)] last:border-0">
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
