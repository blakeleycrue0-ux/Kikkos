// KIKKO service worker.
// - The version below is replaced with a unique build id at build time, so every deploy
//   produces a byte-different sw.js and browsers pick the update up.
// - HTML: network first (new deploys show up), cached copy only when offline.
// - Hashed assets (/assets/*) and brand images: cache first (their names change when content does).
// - Supabase / other origins: never cached.
const VERSION = 'kikko-__KIKKO_BUILD__';
const SHELL = ['/', '/manifest.webmanifest', '/brand/kikko-logo.webp', '/brand/kikko-logo-reversed.webp',
  '/brand/kikko-icon.webp', '/icon-192.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Keep the previous cache's /assets/ files: an already-open page may still lazy-load them.
  e.waitUntil(caches.keys().then(async (keys) => {
    const old = keys.filter((k) => k !== VERSION);
    const cur = await caches.open(VERSION);
    for (const k of old) {
      const c = await caches.open(k);
      for (const req of await c.keys()) {
        if (new URL(req.url).pathname.startsWith('/assets/')) {
          const res = await c.match(req);
          if (res) await cur.put(req, res);
        }
      }
      await caches.delete(k);
    }
  }).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname === '/sw.js') return;
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/'))) {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
