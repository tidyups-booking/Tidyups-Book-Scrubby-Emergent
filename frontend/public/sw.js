// Scrubby / Tidyups PWA service worker.
//
// IMPORTANT: bump CACHE whenever we ship code that changes the JS/asset bundle so
// clients installed as a PWA don't stay pinned to the previous cached JS bundle
// (which is exactly what caused "the Staff/Cleaner buttons aren't showing" on
// returning devices — they were getting the pre-tab-added JS from disk).
const CACHE = 'tidyups-v2';

self.addEventListener('install', () => {
  // Take over immediately on install — don't wait for all tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  if (request.mode === 'navigate') {
    // Navigations: network-first so a deploy is picked up immediately.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((match) => match || caches.match('/')))
    );
    return;
  }

  // Assets (JS bundle, CSS, images): stale-while-revalidate. Return the cached
  // copy for instant load, but ALWAYS kick off a background fetch that refreshes
  // the cache — so the *next* load gets the freshly-deployed asset. This is what
  // fixes the "Staff / Cleaner buttons aren't showing" bug: even when the URL is
  // in cache, a new bundle behind the same URL will be picked up on next visit.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
