/* =====================================================================
   English Quest Service Worker v1 — offline PWA support
   Cache-first for app assets, network-first for fonts & analytics.
   ===================================================================== */
const CACHE_NAME = 'eq-v2';
const PRECACHE_URLS = [
  './home.html',
  './index.html',
  './unit1-learn.html',
  './unit1-practice.html',
  './unit1-dungeon.html',
  './unit1-lesson.html',
  './unit1-boss-battle.html',
  './teacher.html',
  './speaking.html',
  './profile.html',
  './settings.html',
  './level-check.html',
  './community.html',
  './tutoring.html',
  './eq-voice.js',
  './eq-calm.js',
  './eq-avatar.js',
  './eq-streak.js',
  './eq-xp-log.js',
  './progress.html',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest'
];

/* ========== INSTALL ========== */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ========== ACTIVATE ========== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ========== FETCH ========== */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Fonts / GoatCounter — network-first with cache fallback
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic') || url.hostname.includes('goatcounter') || url.hostname.includes('gc.zgo')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // All other requests — cache-first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
  );
});
