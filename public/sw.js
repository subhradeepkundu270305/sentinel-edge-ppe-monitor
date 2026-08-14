const CACHE_NAME = 'sentinel-edge-cache-v1';
// Model files are large — cache them explicitly on first successful fetch
// rather than pre-caching, so install doesn't fail if the model isn't there yet.
const CORE_ASSETS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
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

// Cache-first for everything under /models/ and built assets so the app
// (and the detection model) work with zero connectivity after first load.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isModel = url.pathname.startsWith('/models/');
  const isAsset = url.pathname.startsWith('/assets/');
  const isCdn = url.hostname.includes('jsdelivr.net') || url.hostname.includes('fonts.gstatic.com');

  if (isModel || isAsset || isCdn || CORE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
  }
});
