// ── Service Worker — Wuggel ──────────────────────────────────
// Cache name matches app version — bump this whenever you deploy
// so old caches are automatically purged on next visit.
const CACHE_NAME = 'wuggel-v0.6';

const STATIC_ASSETS = [
  '/manifest.json',
  '/words.txt',
  '/Word10K.txt',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
];

const SOUND_ASSETS = [
  '/sounds/Tick1.wav',
  '/sounds/Tick2.wav',
  '/sounds/Tick3.wav',
  '/sounds/word_found.wav',
  '/sounds/invalid.wav',
  '/sounds/duplicate.wav',
  '/sounds/warning.wav',
  '/sounds/game_over.wav',
  '/sounds/highscore.wav',
  '/sounds/game_start.wav',
];

// Install: pre-cache static assets; cache sounds optionally
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).then(() =>
        Promise.allSettled(
          SOUND_ASSETS.map(url =>
            fetch(url).then(r => { if (r.ok) cache.put(url, r); }).catch(() => {})
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: purge all old caches, claim existing tabs immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // ── Network-first for the app shell (index.html / navigation) ──
  // Always tries the network so a fresh deployment is picked up
  // immediately. Falls back to cache only when offline.
  if (event.request.mode === 'navigate' ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── Cache-first for everything else (sounds, icons, dictionary) ──
  // These are large and change rarely; serve from cache for speed.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => {});
    })
  );
});
