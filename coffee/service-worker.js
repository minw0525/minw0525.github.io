const CACHE_PREFIX = `brew-timer:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v7`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./assets/fonts/PretendardVariable.woff2",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => cache.match(event.request).then((cached) => cached || fetch(event.request))),
  );
});
