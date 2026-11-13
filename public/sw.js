// KIKKO service worker: app-shell caching. API calls are never cached.
const VERSION = 'kikko-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/brand/kikko-logo.png',
  '/brand/kikko-logo-reversed.png', '/brand/kikko-icon.png', '/icon-192.png', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & other APIs: network only
  if (req.mode === 'navigate') {
    // network first for the HTML so deploys show up; fall back to the cached shell offline
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); return res;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  // hashed assets & images: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/'))) {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  })));
});
