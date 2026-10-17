"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The fragment never changes while this page is open: either the link carried
 * recovery tokens or it did not. Nothing to subscribe to.
 */
const subscribe = () => () => {};

const hasRecoveryFragment = () =>
  new URLSearchParams(window.location.hash.slice(1)).has("access_token");

/**
 * Assume we are still checking until the browser says otherwise.
 *
 * The server cannot see the fragment, so it has to guess. Guessing "no tokens"
 * would put the expired card in the server HTML and flash it at a student whose
 * link is fine — the exact bug this component exists to prevent. Guessing
 * "checking" costs a dead link one extra frame of optimism instead.
 */
const serverSnapshot = () => true;

/**
 * Rescues the recovery session when Supabase's own mailer sends the link, and
 * owns whether the "expired" message may appear at all.
 *
 * Supabase's `/auth/v1/verify` endpoint completes the recovery and redirects
 * with the tokens in the URL *fragment* (`#access_token=…&refresh_token=…`).
 * Fragments are never sent to the server, so a Server Component sees no session
 * for a link that is perfectly valid.
 *
 * This used to render alongside the "Reset link expired" card rather than
 * instead of it, so a student following a good link was told it had expired, in
 * large type, for as long as the exchange took. Anyone who believed it and
 * tapped "Request a new link" discarded a working session. The card is now
 * passed in as children and shown only once there is nothing left to redeem.
 *
 * Links minted by the app itself carry a `token_hash` query param and are
 * handled server-side in /auth/callback; those arrive with no fragment, so this
 * resolves on the first client render.
 */
export default function RecoverySession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const pending = useSyncExternalStore(subscribe, hasRecoveryFragment, serverSnapshot);

  useEffect(() => {
    if (!pending) return;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      // Drop the tokens from the address bar either way — they shouldn't sit in
      // history or get pasted into a support chat.
      window.history.replaceState(null, "", window.location.pathname);
      if (error) setFailed(true);
      // On success nothing else changes here: the refresh re-renders this page
      // with a session, which swaps this whole branch for the form. `pending`
      // stays true meanwhile, so the expired card never appears in the gap.
      else router.refresh();
    });
  }, [pending, router]);

  if (pending && !failed) {
    return (
      <div className="card space-y-2">
        <h1 className="text-xl font-semibold">Opening your reset link…</h1>
        <p className="text-sm text-[var(--muted)]">This only takes a moment.</p>
      </div>
    );
  }

  return (
    <>
      {failed && (
        <p className="mb-3 rounded-lg bg-[var(--danger)]/10 p-3 text-sm text-[var(--danger)]">
          We couldn&apos;t open that reset link. Please request a new one.
        </p>
      )}
      {children}
    </>
  );
}
