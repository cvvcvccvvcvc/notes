const CACHE_PREFIX = 'notes-prototype-';
const build = new URL(self.location.href).searchParams.get('build') || 'local';
const CACHE = `${CACHE_PREFIX}${build.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/offline-assets.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Offline asset manifest unavailable');
        return response.json();
      })
      .then((assets) =>
        caches.open(CACHE).then((cache) => cache.addAll([...SHELL, ...assets])),
      ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/login' ||
    url.pathname === '/login.css' ||
    url.pathname === '/healthz'
  )
    return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && new URL(response.url).pathname !== '/login') {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((match) => match || caches.match('/')),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
