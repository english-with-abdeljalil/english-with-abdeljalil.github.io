/* =====================================================================
   English Quest Service Worker v2 — offline PWA support
   Network-first for HTML (always fresh), cache-first for assets.
   ===================================================================== */
const CACHE_NAME = 'eq-v3';
const PRECACHE_URLS = [
  './home.html',
  './ai-coach.html',
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
  './progress.html',
  './eq-voice.js',
  './eq-calm.js',
  './eq-avatar.js',
  './eq-music.js',
  './eq-streak.js',
  './eq-xp-log.js',
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
  // Only handle GET. Let POST/PUT (e.g. AI Coach calls to the Worker backend)
  // go straight to the network untouched — the Cache API can't store them.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isHTML = event.request.mode === 'navigate' ||
    (event.request.headers.get('Accept') || '').includes('text/html');

  // Third-party (fonts, analytics) — network-first with cache fallback
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic') ||
      url.hostname.includes('goatcounter') || url.hostname.includes('gc.zgo') ||
      url.hostname.includes('jsdelivr')) {
    event.respondWith(
      fetch(event.request)
        .then(r => { const c = r.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, c)); return r; })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // HTML pages — network-first: always check server, cache as fallback
  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then(r => {
          const c = r.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, c));
          return r;
        })
        .catch(() => caches.match(event.request).then(cached => {
          // If no cache match, try a stale-but-usable fallback
          if (cached) return cached;
          // Last resort: serve the offline page
          return caches.match('./home.html');
        }))
    );
    return;
  }

  // JS, CSS, images, other assets — cache-first for speed
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const fetchPromise = fetch(event.request)
          .then(r => {
            if (r && r.ok) {
              const c = r.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, c));
            }
            return r;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
  );
});
