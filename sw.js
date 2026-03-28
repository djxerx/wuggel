// ── Service Worker — Word Swipe ──────────────────────────────
const CACHE_NAME = 'word-swipe-v1';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/words.txt',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
];

const SOUND_ASSETS = [
  '/sounds/tick.wav',
  '/sounds/word_found.wav',
  '/sounds/invalid.wav',
  '/sounds/duplicate.wav',
  '/sounds/warning.wav',
  '/sounds/game_over.wav',
  '/sounds/highscore.wav',
];

// Install: pre-cache core assets; cache sounds only if they exist
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CORE_ASSETS).then(() =>
        // Sounds are optional — never fail install if missing
        Promise.allSettled(
          SOUND_ASSETS.map(url =>
            fetch(url).then(r => { if (r.ok) cache.put(url, r); }).catch(() => {})
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: purge old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for same-origin GET requests
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});
