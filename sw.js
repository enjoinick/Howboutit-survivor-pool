/* Minimal service worker for installability and basic offline support */
const CACHE_NAME = 'survivor-pool-v1-20250818b';
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

  const url = new URL(req.url);
  const accept = req.headers.get('accept') || '';
  const isHTML = accept.includes('text/html');

  // Bypass cross-origin requests entirely (let the browser handle them)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache proxy responses; network-first if present
  if (url.pathname.startsWith('/proxy/')) {
    event.respondWith(
      fetch(req).catch(() => new Response('', { status: 502 }))
    );
    return;
  }

  if (isHTML) {
    // Network-first for HTML to avoid stale app code
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || (await caches.match('./index.html')) || new Response('', { status: 504 });
        })
    );
    return;
  }

  // Cache-first for non-HTML, but always return a valid Response
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) {
        // Kick off a background update
        fetch(req)
          .then((res) => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone())).catch(() => {});
            }
          })
          .catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone())).catch(() => {});
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })()
  );
});
