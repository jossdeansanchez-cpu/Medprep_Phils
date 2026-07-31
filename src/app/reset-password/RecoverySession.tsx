"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Rescues the recovery session when Supabase's own mailer sends the link.
 *
 * Supabase's `/auth/v1/verify` endpoint completes the recovery and then
 * redirects with the tokens in the URL *fragment*
 * (`#access_token=…&refresh_token=…`). Fragments are never sent to the server,
 * so a Server Component sees no session and would show "link expired" for a
 * link that is in fact perfectly valid.
 *
 * Reading it here, in the browser, makes that flow work without having to edit
 * Supabase's email template. Links minted by the app itself carry a
 * `token_hash` query param instead and are handled server-side in
 * /auth/callback — this component simply does nothing for those.
 */
export default function RecoverySession() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      // Drop the tokens from the address bar either way — they shouldn't sit in
      // history or get pasted into a support chat.
      window.history.replaceState(null, "", window.location.pathname);
      if (error) setFailed(true);
      else router.refresh();
    });
  }, [router]);

  if (!failed) return null;
  return (
    <p className="mt-3 text-sm text-[var(--danger)]">
      We couldn&apos;t open that reset link. Please request a new one.
    </p>
  );
}
