const CACHE = "psyzon-go-v6-security";
const PUBLIC_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192-v3.png",
  "/icon-512-v3.png",
];
const SAFE_DESTINATIONS = new Set(["style", "script", "image", "font", "manifest"]);
const SAFE_PUBLIC_EXTENSION = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico|webmanifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.allSettled(PUBLIC_ASSETS.map((asset) => cache.add(asset)))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPublicStaticRequest(request, url) {
  if (request.method !== "GET" || request.headers.has("authorization")) return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/signin") || url.pathname.startsWith("/callback") || url.pathname.startsWith("/auth") || url.pathname.startsWith("/__/auth")) return false;
  if (!SAFE_DESTINATIONS.has(request.destination)) return false;
  return url.pathname.startsWith("/_next/static/") || SAFE_PUBLIC_EXTENSION.test(url.pathname);
}

function mayCacheResponse(response) {
  if (!response || !response.ok || response.type === "opaque") return false;
  const cacheControl = response.headers.get("cache-control")?.toLocaleLowerCase() ?? "";
  if (cacheControl.includes("no-store") || cacheControl.includes("private")) return false;
  if (response.headers.has("set-cookie")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!isPublicStaticRequest(event.request, url)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
      if (mayCacheResponse(response)) {
        const responseForCache = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, responseForCache)).catch(() => undefined));
      }
      return response;
    })),
  );
});
