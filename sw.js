/* Minimal service worker for installability and basic offline support */
const CACHE_NAME = 'survivor-pool-v1-20250807';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './config.json',
  './data.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          // Only cache same-origin GETs and successful responses
          if (res.ok && new URL(req.url).origin === self.location.origin) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
