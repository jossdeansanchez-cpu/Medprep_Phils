/*
 * MEDprep service worker — deliberately minimal.
 *
 * SAFETY RULE: never cache anything user-specific. Pages are server-rendered
 * per user (exam questions, entitlements, admin data), so caching a document
 * response could show one student another student's content, or keep serving a
 * paywalled page after a plan lapses. We therefore cache ONLY immutable static
 * build assets, and fall back to a small offline page for navigations.
 */
const VERSION = "medprep-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Server Actions are POSTs and Supabase /
  // PayMongo are cross-origin, so both are left entirely alone.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: always go to the network so auth and entitlements are fresh.
  // Only if the network is unavailable do we show the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r ?? Response.error())
      )
    );
    return;
  }

  // Icons only. We deliberately DO NOT cache /_next/static JS: serving a stale
  // chunk to a student mid-exam can break the page (it once hid the Submit
  // button behind an old build), and the browser's own HTTP cache already
  // handles those files efficiently via immutable headers. The offline page is
  // the only thing we really need cached.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
  }

  // Everything else (app code, API routes, RSC payloads, data) goes straight to
  // the network — never cached.
});
