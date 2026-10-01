/* HealthSphere AI — offline service worker (no build step, no dependencies).
   - App shell (HTML/CSS/JS/fonts): cache-first, so the UI opens offline.
   - Authenticated GET /api/* reads: network-first with cache fallback, so
     reopening the app offline shows your last saved data (banner included).
   - Writes (POST/PUT/PATCH/DELETE) always need the network and fail fast
     offline — the app already toasts those errors.
   NOTE: cached API responses live in this browser's Cache Storage. On a
   shared device, use the browser profile per person (same rule as passwords). */

const STATIC_CACHE = 'hs-static-v2';
const API_CACHE = 'hs-api-v1';
const OFFLINE_CORE = ['/', '/index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(OFFLINE_CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return /^\/(css|js)\//.test(url.pathname)
    || /\.(?:css|js|woff2?|png|jpg|svg|ico|webmanifest)$/.test(url.pathname)
    || url.pathname === '/' || url.pathname === '/index.html';
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return; // writes always go to network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts/CDN handle themselves

  // Authenticated reads: network first, stale cache as offline fallback.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(API_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(request).then(hit => hit || offlineJson()))
    );
    return;
  }

  // Shell + navigations: cache first, refresh in background.
  if (request.mode === 'navigate' || isStaticAsset(url)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(hit => {
        const net = fetch(request).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return res;
        }).catch(() => null);
        if (request.mode === 'navigate') return net.then(r => r || hit || offlinePage());
        return hit || net.then(r => r || Promise.reject(new Error('offline')));
      })
    );
  }
});

function offlineJson() {
  return new Response(JSON.stringify({ error: 'You are offline — showing last saved data where available.' }), {
    status: 503, headers: { 'Content-Type': 'application/json' },
  });
}

function offlinePage() {
  return caches.match('/index.html').then(hit => hit || new Response('Offline', {
    status: 503, headers: { 'Content-Type': 'text/plain' },
  }));
}
