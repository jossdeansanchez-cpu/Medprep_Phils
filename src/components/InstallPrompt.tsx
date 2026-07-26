"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "medprep_install_dismissed";

/**
 * Invites the user to install MEDprep to their home screen.
 *
 * Chrome/Android fire `beforeinstallprompt`, which lets us trigger the real
 * install dialog. iOS Safari has no such API — installing is a manual
 * Share → "Add to Home Screen" — so there we just show the instructions.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume hidden until checked

  // Never interrupt a live exam — this is a fixed bottom bar and the runner's
  // Previous/Next/Submit controls sit exactly there.
  const suppressed = pathname?.startsWith("/exam/") || pathname?.startsWith("/practice");

  useEffect(() => {
    // Already installed? Never nag.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes this non-standard flag instead.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (localStorage.getItem(DISMISSED_KEY) === "1") return;
    setDismissed(false);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's own mini-infobar; we show our own UI
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS: no event to wait for, so detect the platform directly.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function close() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setDeferred(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    close();
  }

  if (suppressed || dismissed || (!deferred && !showIosHint)) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="glass pop-in mx-auto flex max-w-md items-center gap-3 p-3 shadow-lg">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white">
          M
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install MEDprep</p>
          <p className="text-xs text-[var(--muted)]">
            {deferred
              ? "Add it to your home screen for quick, full-screen access."
              : "Tap Share, then “Add to Home Screen”."}
          </p>
        </div>
        {deferred && (
          <button onClick={install} className="btn-primary shrink-0 px-3 py-1.5 text-xs">
            Install
          </button>
        )}
        <button
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/[0.05]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
