const CACHE = "psyzon-go-v5";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192-v3.png",
  "/icon-512-v3.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset)))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/signin") || url.pathname.startsWith("/callback")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) {
        const responseForCache = response.clone();
        event.waitUntil(
          caches.open(CACHE)
            .then((cache) => cache.put("/", responseForCache))
            .catch(() => undefined),
        );
      }
      return response;
    }).catch(() => caches.match("/")));
    return;
  }

  if (!["style", "script", "image", "font", "manifest"].includes(event.request.destination)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
    if (response.ok) {
      const responseForCache = response.clone();
      event.waitUntil(
        caches.open(CACHE)
          .then((cache) => cache.put(event.request, responseForCache))
          .catch(() => undefined),
      );
    }
    return response;
  })));
});
