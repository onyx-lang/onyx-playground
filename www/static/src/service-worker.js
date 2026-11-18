const app_version = 7;

const cacheName = "cache-v10";
const precacheResources = [
  "",
  "/static/css/index.css",
  "/static/vendor/fontawesome/css/all.min.css",
  "/static/vendor/fontawesome/css/v4-shims.min.css",
  "/static/vendor/jquery/jquery.modal.min.css",
  "/static/src/resizer.js",
  "/static/src/editor.js",
  "/static/src/js_os.js",
  "/static/src/canvas.js",
  "/static/src/folders.js",
  "/static/examples_project.json",
  "/static/src/index.js",
  "/static/vendor/ace/ace.js",
  "/static/vendor/jquery/jquery.min.js",
  "/static/vendor/jquery/jquery.modal.min.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => {
        return cache.addAll(precacheResources);
      })
      .then((_) => {
        console.log("Service worker installed.");
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  console.log("Fetch intercepted for:", event.request.url);
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    }),
  );
});
