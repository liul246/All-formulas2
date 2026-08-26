const CACHE_NAME = 'smart-calculator-v1';

// ከኢንተርኔት ውጭ (Offline) እንዲያዙ የሚፈለጉ ፋይሎች
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// 1. Service Worker ሲጫን (Install) ፋይሎቹን Cache ማድረግ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// 2. አዲስ ስሪት ሲኖር አሮጌውን Cache ማጽዳት (Activate)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// 3. አፑ ሲከፈት ከ Cache መውሰድ (Offline Support)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // የኔትወርክ ጥያቄው ካልሰራ ከካሽ index.html እንዲመልስ
        return caches.match('./index.html');
      });
    })
  );
});
