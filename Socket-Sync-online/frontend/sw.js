const CACHE_NAME = 'socket-sync-cache-v5';
const urlsToCache = [
  '/',
  '/login',
  '/signup',
  '/chat',
  '/css/style.css',
  '/js/ui.js',
  '/js/chat.js',
  '/material/images/Socket-Sync-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Use addAll for critical assets, but suppress errors if some fail
        // This prevents the SW from getting stuck in the "installing" phase
        return Promise.allSettled(urlsToCache.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`Failed to cache ${url}:`, err);
          });
        }));
      })
  );
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Use Network-First caching strategy for most assets to ensure updates
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If network fetch is successful, clone response and update the cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // If offline or network fails, fallback to cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        // Take control of all clients immediately
        return self.clients.claim();
    })
  );
});
