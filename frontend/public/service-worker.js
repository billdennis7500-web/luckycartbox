/**
 * NaijaInvest service worker
 * -------------------------------------------------------------
 * Deliberately minimal — this SW exists to satisfy the PWA
 * install criteria (must respond to `fetch`) so browsers offer
 * "Add to home screen" / native install. It does not attempt to
 * cache API responses (payment / balance data must always be
 * fresh) and does not cache the app shell (we rely on the CDN
 * + browser cache instead). This avoids the classic "stale UI
 * after deploy" trap that hurts fintech UX.
 */
const SW_VERSION = "naijainvest-sw-2";
const OFFLINE_URL = "/offline.html";
const OFFLINE_CACHE = "naijainvest-offline-v1";

self.addEventListener("install", (event) => {
  // Pre-cache a small offline fallback page.
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) =>
      cache.addAll([OFFLINE_URL, "/icon-192.png"]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old caches from previous SW versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Only intercept navigation requests so we can serve the offline page
  // when the user is fully offline. Everything else falls through.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      })
    );
  }
});
