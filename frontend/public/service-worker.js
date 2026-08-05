/**
 * Luckycart Box service worker
 * -------------------------------------------------------------
 * Deliberately minimal — this SW exists to satisfy the PWA
 * install criteria (must respond to `fetch`) so browsers offer
 * "Add to home screen" / native install. It does not attempt to
 * cache API responses (payment / balance data must always be
 * fresh) and does not cache the app shell (we rely on the CDN
 * + browser cache instead). This avoids the classic "stale UI
 * after deploy" trap that hurts fintech UX.
 *
 * Product images (large binaries served at /api/products/{id}/image)
 * are the ONE exception — Cloudflare fronts them with a `no-store`
 * header that the browser respects, so re-rendering the Marketplace
 * would re-download every tile every time. We cache-first them
 * here since the URL itself embeds a cache-buster (`?v=<hash>`)
 * that flips whenever the admin uploads a new picture.
 */
const SW_VERSION = "luckycartbox-sw-4";
const OFFLINE_URL = "/offline.html";
const OFFLINE_CACHE = "luckycartbox-offline-v1";
const IMAGE_CACHE = "luckycartbox-product-images-v1";

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
      const keep = new Set([OFFLINE_CACHE, IMAGE_CACHE]);
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Match: /api/products/<id>/image[?v=...]
const PRODUCT_IMAGE_RE = /\/api\/products\/[^/]+\/image(\?|$)/;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cache-first for product-image endpoints. Because the URL carries a `v`
  // cache-buster, admin updates automatically invalidate the cache entry.
  if (PRODUCT_IMAGE_RE.test(url.pathname + url.search)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const resp = await fetch(req);
        if (resp && resp.status === 200 && resp.type !== "opaque") {
          cache.put(req, resp.clone()).catch(() => {});
        }
        return resp;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Navigation → offline fallback when the network drops entirely.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(OFFLINE_CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      })
    );
  }
});
