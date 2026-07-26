/*
 * MEDprep service worker — deliberately minimal.
 *
 * SAFETY RULE: never cache anything user-specific. Pages are server-rendered
 * per user (exam questions, entitlements, admin data), so caching a document
 * response could show one student another student's content, or keep serving a
 * paywalled page after a plan lapses. We therefore cache ONLY immutable static
 * build assets, and fall back to a small offline page for navigations.
 */
const VERSION = "medprep-v1";
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

  // Immutable build output (/_next/static/**) — safe to cache-first, since the
  // filenames are content-hashed and change on every deploy.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
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

  // Everything else (API routes, RSC payloads, data) falls through to the
  // network untouched — no caching.
});
