const CACHE = 'sokerireport-v4';
const SHARE_CACHE = 'sokerireport-share';
const BASE = new URL('./', self.location.href).pathname;
const PRECACHE = [
  BASE,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}fonts/inter-latin.woff2`,
  `${BASE}fonts/inter-latin-ext.woff2`,
  `${BASE}fonts/manrope-latin.woff2`,
  `${BASE}fonts/manrope-latin-ext.woff2`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === `${BASE}share-target`
  ) {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const file = form.get('file');
          if (file && typeof file !== 'string') {
            const cache = await caches.open(SHARE_CACHE);
            const name = encodeURIComponent(file.name || 'shared.csv');
            await cache.put(
              new Request(`${self.location.origin}${BASE}__shared/${name}`),
              new Response(file, {
                headers: { 'content-type': file.type || 'text/csv' },
              }),
            );
          }
        } catch {
          // A malformed share still returns to the app.
        }
        return Response.redirect(`${self.location.origin}${BASE}?shared=1`, 303);
      })(),
    );
    return;
  }

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network-first, but always refresh the cached shell so a later offline
    // visit does not point at assets from a previous build.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(BASE, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => (await caches.match(BASE)) ?? (await caches.match(request)) ?? Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    }),
  );
});
