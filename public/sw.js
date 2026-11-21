// Exhume service worker: pre-caches static assets on first load.
// User file data (the actual files being exhumed) is decoded in the UI thread and never
// touches the network or cache—all processing happens in the browser's RAM.

const CACHE_NAME = 'exhume-v1';
const PRECACHE_URLS = [
  './',
  './favicon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).then(() => self.skipWaiting());
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        }),
      );
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { method, url } = request;

  // Only handle same-origin GET requests
  if (method !== 'GET' || !url.startsWith(self.location.origin)) {
    return;
  }

  // Parse the request URL
  const urlObj = new URL(url);
  const isNavigation = request.mode === 'navigate';

  // For navigations, use network-first with fallback to cached home page
  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => caches.match('./').then((cached) => cached || new Response('Offline', { status: 503 }))),
    );
    return;
  }

  // For all other same-origin GET requests, use cache-first:
  // return cached version if available, otherwise fetch from network and cache the result
  event.respondWith(
    caches
      .match(request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response.ok) return response;
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
          });
          return response;
        });
      })
      .catch(() => new Response('Offline', { status: 503 })),
  );
});
