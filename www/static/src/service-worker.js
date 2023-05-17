const app_version = 3;

const cacheName = 'cache-v1';
const precacheResources = [
  '/playground',
  '/playground/static/css/index.css',
  '/playground/static/vendor/fontawesome/css/all.min.css',
  '/playground/static/vendor/fontawesome/css/v4-shims.min.css',
  '/playground/static/vendor/jquery/jquery.modal.min.css',
  '/playground/static/src/resizer.js',
  '/playground/static/src/storage.js',
  '/playground/static/src/canvas.js',
  '/playground/static/src/folders.js',
  '/playground/static/src/index.js',
  '/playground/static/vendor/ace/ace.js',
  '/playground/static/vendor/jquery/jquery.min.js',
  '/playground/static/vendor/jquery/jquery.modal.min.js',
];


self.addEventListener('install', event => {
    console.log("Service worker installed.");
    event.waitUntil(
        caches.open(cacheName)
            .then(cache => {
                return cache.addAll(precacheResources);
            })
    );
});

self.addEventListener("fetch", event => {
    console.log('Fetch intercepted for:', event.request.url);
    event.respondWith(caches.match(event.request)
        .then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});
