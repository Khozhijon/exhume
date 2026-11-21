// Exhume service worker: makes the app shell available offline.
// It only ever stores the site's own static files. The files a visitor exhumes are decoded in the page
// and never reach the network or this cache.
//
// The scripts and styles of the first visit are requested before this worker controls the page, so the
// page sends their addresses in a 'precache' message once the worker is active (see src/ui/offline.ts).
// Only after that answer does the page say "Offline ready".

const CACHE_NAME = 'exhume-v2';
const PRECACHE_URLS = ['./', './favicon.svg', './manifest.webmanifest'];
const SCOPE = new URL('./', self.location.href).href;

const inScope = (url) => typeof url === 'string' && url.startsWith(SCOPE);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'precache' || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];
  const urls = [...new Set(data.urls.filter(inScope))];
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(urls.map((url) =>
        cache.match(url).then((hit) => hit || cache.add(url)).then(() => true, () => false))))
      .then((results) => {
        const failed = results.filter((ok) => !ok).length;
        if (port) port.postMessage({ type: 'precached', stored: results.length - failed, failed });
      }),
  );
});

// Stores a copy; the copy is taken before the response is handed to the page.
const keep = (request, response) => {
  if (!response.ok) return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !inScope(request.url)) return;

  // The page itself: the network first (so a new version is picked up), the stored page when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => keep(request, response))
        .catch(() => caches.match(request, { ignoreSearch: true })
          .then((hit) => hit || caches.match(SCOPE))
          .then((hit) => hit || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } }))),
    );
    return;
  }

  // Everything else (hashed scripts and styles, icons): the stored copy first.
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => keep(request, response)))
      .catch(() => new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })),
  );
});
