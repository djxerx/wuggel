// ── Service Worker — Word Swipe ──────────────────────────────
// CACHE_NAME must change on every deploy (keep in sync with the
// version label in index.html).  A byte-different sw.js is what
// triggers the browser to install the update.
const CACHE_NAME = 'word-swipe-v0.61';

// Must-have for the app shell to work offline.
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Nice-to-have: cached individually so a single missing file
// can never break the install (cache.addAll is all-or-nothing).
const OPTIONAL_ASSETS = [
  '/words.txt',
  '/word10k.txt',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/sounds/tick1.wav',
  '/sounds/tick2.wav',
  '/sounds/tick3.wav',
  '/sounds/word_found.wav',
  '/sounds/invalid.wav',
  '/sounds/duplicate.wav',
  '/sounds/warning.wav',
  '/sounds/game_over.wav',
  '/sounds/game_start.wav',
  '/sounds/highscore.wav',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(CRITICAL_ASSETS).then(() =>
        Promise.allSettled(
          OPTIONAL_ASSETS.map(url =>
            fetch(url).then(r => { if (r.ok) return cache.put(url, r); }).catch(() => {})
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: purge caches from previous versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//  • Navigations + index.html → NETWORK-FIRST so a simple reload
//    always picks up the newest deploy; cache is the offline fallback.
//  • Everything else → cache-first with background refresh
//    (stale-while-revalidate), so assets are instant but stay current.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isShell = event.request.mode === 'navigate' ||
                  url.pathname === '/' || url.pathname === '/index.html';

  if (isShell) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(hit => hit || caches.match('/index.html'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const refresh = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => null);
      return cached || refresh.then(r => r || Response.error());
    })
  );
});
