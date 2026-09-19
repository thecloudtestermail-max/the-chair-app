// public/sw.js
//
// Registered once per tenant scope (see src/components/ServiceWorkerRegistrar.tsx
// and src/lib/pwaScope.ts) instead of once globally — this same script file
// runs as a SEPARATE registration per scope (the registration key is
// (scriptURL, scope)), so self.registration.scope tells each running
// instance which tenant (or the platform root, for '/') it's serving, and
// every cache name below is namespaced off of it. Without that, every
// salon's installed PWA shared one cache and one offline fallback, so
// clearing it (e.g. on logout) or falling back offline could show a
// DIFFERENT salon's cached content.
const SCOPE_PATHNAME = new URL(self.registration.scope).pathname;
const TENANT_MATCH = SCOPE_PATHNAME.match(/^\/t\/([^/]+)\//);
const SCOPE_ID = TENANT_MATCH ? `t-${TENANT_MATCH[1]}` : 'root';
const HOME_PATH = TENANT_MATCH ? `/t/${TENANT_MATCH[1]}` : '/';

const CACHE_VERSION = `chair-app-v1-${SCOPE_ID}`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const STATIC_ASSETS = [
  HOME_PATH,
  '/offline.html',
  '/logo-192.png',
  '/logo-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // NOT cache.addAll(): addAll is atomic and rejects the whole install
      // if a single asset 404s, silently breaking every offline feature
      // (audit finding). Cache each asset independently instead — one
      // missing icon shouldn't take down the service worker.
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          fetch(url).then((response) => {
            if (response.ok) return cache.put(url, response);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Only this scope's own caches are eligible for cleanup — a
          // stale cache from a DIFFERENT scope (another tenant, or root)
          // is that registration's to manage, not this one's.
          if (cacheName.startsWith(`chair-app-v1-${SCOPE_ID}-`) && !cacheName.startsWith(CACHE_VERSION)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API requests (let them go through)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html').then((cached) => cached || new Response('Offline')))
    );
    return;
  }

  // Cache-first for static assets
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff|woff2)$/)) {
    event.respondWith(
      caches.match(request).then((response) => {
        return (
          response ||
          fetch(request).then((response) => {
            const clonedResponse = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, clonedResponse);
            });
            return response;
          })
        );
      })
    );
    return;
  }

  // Network-first for HTML and other requests
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clonedResponse = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, clonedResponse);
        });
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match(HOME_PATH).then((home) => home || caches.match('/offline.html')))
      )
  );
});
