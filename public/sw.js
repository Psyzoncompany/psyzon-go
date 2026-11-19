const CACHE = "psyzon-go-v7-offline";
const SHELL_KEY = "/__psyzon-offline-shell";
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
    prepareShell().catch(() => {}).then(() => self.clients.claim()),
  );
});

let preparingShell;
async function prepareShell() {
  const response = await fetch("/", { credentials: "omit", redirect: "error", cache: "no-store", headers: { "x-psyzon-shell": "1" } });
  if (!response.ok || response.headers.get("x-psyzon-shell") !== "1" || response.headers.has("set-cookie") ||
    !response.headers.get("content-type")?.includes("text/html") || !response.headers.has("content-security-policy")) return;
  const html = await response.clone().text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)].map(match => match[1].replaceAll("&amp;", "&")))];
  if (!assets.some(asset => /\.js(?:\?|$)/.test(asset))) return;
  const cache = await caches.open(CACHE);
  await Promise.all(assets.map(async asset => {
    if (await cache.match(asset)) return;
    const file = await fetch(asset, { credentials: "omit", redirect: "error" });
    if (!mayCacheResponse(file)) throw new Error("Offline asset unavailable");
    await cache.put(asset, file);
  }));
  await cache.put(SHELL_KEY, response);
  const oldCaches = (await caches.keys()).filter(key => key.startsWith("psyzon-go-") && key !== CACHE);
  await Promise.allSettled(oldCaches.map(key => caches.delete(key)));
}

self.addEventListener("message", event => {
  if (event.data !== "PREPARE_OFFLINE") return;
  preparingShell ??= prepareShell().catch(() => {}).finally(() => { preparingShell = undefined; });
  event.waitUntil(preparingShell);
});

self.addEventListener("notificationclick", (event) => {
  if (event.notification.tag !== "psyzon-attention") return;
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL("/#inicio?notificacoes=1", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const appWindow = windows.find(({ url }) => {
      const page = new URL(url);
      return page.origin === self.location.origin && page.pathname === "/";
    });
    if (appWindow) {
      try {
        const client = await appWindow.navigate(destination);
        if (client) return await client.focus();
      } catch {
        // The app tab may have closed while opening the alert.
      }
    }
    return self.clients.openWindow(destination);
  })());
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
  if (event.request.mode === "navigate" && event.request.method === "GET" && !event.request.headers.has("authorization") &&
      url.origin === self.location.origin && url.pathname === "/" && !url.search) {
    event.respondWith(fetch(event.request).catch(async () => {
      return await caches.match(SHELL_KEY) ?? new Response("Abra o Psyzon GO com internet para preparar o acesso offline.", {
        status: 503, headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }));
    return;
  }
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
