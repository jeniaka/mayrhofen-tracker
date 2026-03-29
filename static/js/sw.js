/* ── MayrhofenTracker Service Worker ─────────────────────────────────────────── */
const CACHE_NAME = 'mt-v1';
const STATIC_CACHE = [
  '/',
  '/static/css/main.css',
  '/static/css/map.css',
  '/static/css/stats.css',
  '/static/js/app.js',
  '/static/js/map.js',
  '/static/js/tracking.js',
  '/static/js/stats.js',
  '/static/js/weather.js',
  '/static/js/i18n.js',
  '/static/data/slopes.json',
  '/static/data/lifts.json',
  '/static/data/pois.json',
  '/manifest.json',
];

const MAP_TILE_CACHE = 'mt-tiles-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== MAP_TILE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Cache map tiles
  if (url.hostname.includes('tile.opentopomap.org') || url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(MAP_TILE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached || new Response('', { status: 503 }));
        })
      )
    );
    return;
  }

  // API calls — network first, no cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
