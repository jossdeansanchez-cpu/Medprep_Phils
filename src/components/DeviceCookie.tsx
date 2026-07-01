"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a stable per-browser device id in a cookie so the server can enforce
 * per-account device limits. The id is generated once and kept in localStorage,
 * so parallel requests never mint different ids (which would over-count devices).
 */
export default function DeviceCookie() {
  const router = useRouter();
  useEffect(() => {
    let id = localStorage.getItem("md_device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("md_device", id);
    }
    const hadCookie = document.cookie
      .split("; ")
      .some((c) => c.startsWith("md_device="));
    document.cookie = `md_device=${id}; path=/; max-age=31536000; samesite=lax`;
    // First time the cookie appears, re-run server components so the device
    // check registers/enforces immediately instead of on the next navigation.
    if (!hadCookie) router.refresh();
  }, [router]);

  return null;
}
