// ── Service Worker — Word Swipe ──────────────────────────────
// CACHE_NAME must change on every deploy (keep in sync with the
// APP_VERSION in index.html).  A byte-different sw.js is what
// triggers the browser to install the update.
const CACHE_NAME = 'word-swipe-v0.71';

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

// Safari refuses to serve a cached response that carries the
// `redirected` flag for a navigation (e.g. the host 308s
// /index.html → /).  Re-wrapping the body strips the flag so an
// offline cold start can always use the cached shell.
async function cleanResponse(res) {
  if (!res.redirected) return res;
  const body = await res.blob();
  return new Response(body, {
    status: 200,
    statusText: 'OK',
    headers: res.headers,
  });
}

async function cachePut(cache, url, res) {
  try { await cache.put(url, await cleanResponse(res)); } catch (_) {}
}

// Network fetch that gives up after `ms` — a flaky connection then
// falls back to cache instead of hanging the launch.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      r => { clearTimeout(timer); resolve(r); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Critical shell — install fails (and retries next launch) if missing
    for (const url of CRITICAL_ASSETS) {
      const res = await fetch(url);
      if (!res.ok) throw new Error('install failed: ' + url);
      await cache.put(url, await cleanResponse(res));
    }
    // Optional assets — best effort, never block install
    await Promise.allSettled(OPTIONAL_ASSETS.map(url =>
      fetch(url).then(r => { if (r.ok) return cachePut(cache, url, r); }).catch(() => {})
    ));
    await self.skipWaiting();
  })());
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
//  • Navigations + index.html → NETWORK-FIRST (4s timeout) so an
//    online launch always picks up the newest deploy; the cached
//    shell is the offline / slow-network fallback.
//  • Everything else → cache-first with background refresh
//    (stale-while-revalidate), so assets are instant but stay current.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isShell = event.request.mode === 'navigate' ||
                  url.pathname === '/' || url.pathname === '/index.html';

  if (isShell) {
    event.respondWith((async () => {
      try {
        const net = await fetchWithTimeout(event.request, 4000);
        if (net && net.ok) {
          const copy = net.clone();
          caches.open(CACHE_NAME).then(c => cachePut(c, event.request.url, copy));
          return net;
        }
        throw new Error('bad status');
      } catch (_) {
        return (await caches.match(event.request)) ||
               (await caches.match('/index.html')) ||
               (await caches.match('/')) ||
               Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const refresh = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => cachePut(c, event.request.url, clone));
        }
        return response;
      }).catch(() => null);
      return cached || refresh.then(r => r || Response.error());
    })
  );
});
