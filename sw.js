// Service worker minimale: rende il sito installabile e lo fa aprire anche offline
// (con l'ultima versione vista). Le chiamate cross-origin (API F1, tweet, font) non vengono toccate.
const CACHE = 'ferrari-analyzer-v1';
const SHELL = [
  './',
  'index.html',
  'driver.html',
  'styles.css',
  'app.js',
  'driver.js',
  'data/circuits.geojson',
  'assets/logo.svg',
  'assets/logo-white.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: online prendi sempre la versione aggiornata, offline ripiega sulla cache.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
  );
});
