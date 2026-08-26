const CACHE_NAME = 'smart-calculator-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// 1. Service Worker Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Service Worker Activate
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
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Request (Offline Support)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// 4. Push Notifications Support
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Notification from Smart Calculator',
    icon: 'https://via.placeholder.com/192.png'
  };
  event.waitUntil(
    self.registration.showNotification('Smart Calculator', options)
  );
});

// 5. Background Sync Support
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('Background sync event triggered');
  }
});

// 6. Periodic Background Sync Support
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-cache') {
    console.log('Periodic sync event triggered');
  }
});
