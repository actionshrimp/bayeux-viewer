// Offline support: cache-first for everything same-origin, filled as the app is used
// (and in bulk by the "Save for offline use" button). Bump VERSION to drop old caches.
const VERSION = 'bayeux-v2-runtime';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  const isPage = req.mode === 'navigate';
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isPage) {
      // Network first for the page so updates arrive; fall back to cache offline.
      try { const res = await fetch(req); cache.put(req, res.clone()); return res; }
      catch { return (await cache.match(req)) || (await cache.match('./')) || Response.error(); }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch { return Response.error(); }
  })());
});
