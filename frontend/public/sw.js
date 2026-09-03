const CACHE_NAME = 'ocp-v2';
const STATIC_ASSETS = [
  '/',
  '/menu',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Vite dev assets, HMR websocket, or API
  if (
    request.method !== 'GET' ||
    !request.url.startsWith('http') ||
    request.url.includes('/api/') ||
    request.url.includes('/@vite') ||
    request.url.includes('/@react-refresh') ||
    request.url.includes('/@fs/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.search.includes('token=') ||
    request.headers.get('accept')?.includes('text/javascript') ||
    request.destination === 'script' ||
    request.destination === 'style'
  ) return;

  // Only handle navigation / document requests for offline fallback
  if (request.mode !== 'navigate' && request.destination !== 'document' && request.destination !== '') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request).then((response) => {
        if (response && response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached || caches.match('/offline.html'));

      return cached || fetched;
    })
  );
});
