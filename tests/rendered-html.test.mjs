import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the branded PSYZON GO splash", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>PSYZON GO · Sua empresa sob controle<\/title>/i);
  assert.match(html, /class="splash-screen"/);
  assert.match(html, /src="\/icon-512-v3\.png"/);
  assert.match(html, /Produção e financeiro em tempo real/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /icon-192-v3\.png\?v=4/);
  assert.doesNotMatch(html, /rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("includes the realtime apparel notes workspace", async () => {
  const [page, notes] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/NotesWorkspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /"notes"/);
  assert.match(page, /<NotesWorkspace uid=\{uid\} notes=\{notes\}/);
  assert.match(notes, /1 kg = 4,2 camisas/);
  assert.match(notes, /useState&lt;"kg" \| "pieces"&gt;\("pieces"\)|useState<"kg" \| "pieces">\("pieces"\)/);
  assert.match(notes, /export type NoteMaterial/);
  assert.match(notes, /\["PV", "PP", "PIQUET"\]/);
  assert.match(notes, /calculatedOrderKg \* 0\.05/);
  assert.match(notes, /useState\("90\.91"\)/);
  assert.match(notes, /ribanaKg \* numericRibanaPrice/);
  assert.match(notes, /Ribana/);
  assert.match(notes, /Gola polo/);
  assert.match(notes, /Costa Rica/);
  assert.match(notes, /Atual Têxtil/);
  assert.match(notes, /Custo total do pedido/);
  assert.match(notes, /totalFabricCost > 0/);
  assert.match(notes, /Configurar valores/);
  assert.match(notes, /Valor da ribana por kg/);
  assert.match(notes, /Valor total da ribana/);
  assert.match(notes, /🧵 \*MATERIAL \$\{index \+ 1\}\*/);
  assert.match(notes, /💰 \*CUSTO TOTAL GERAL/);
  assert.match(notes, /materials\.reduce\(\(total, material\) => total \+ material\.totalCost/);
  assert.match(notes, /materials-grand-total/);
  assert.match(notes, /Cálculo automático ativado/);
  assert.match(notes, /calculator-dismiss-layer/);
  assert.match(notes, /Adicionar como MATERIAL/);
  assert.match(notes, /disabled=\{!numericFabricValue \|\| !selectedId \|\| !fabricColor\.trim\(\)\}/);
  assert.doesNotMatch(notes, /Tarefas interativas/);
  assert.match(notes, /Adicionar material/);
  assert.match(notes, /PDF \/ Imprimir/);
  assert.match(notes, /updatedAt: serverTimestamp\(\)/);
  assert.match(notes, /Salvo em tempo real/);
});

test("ships a stable and installable PWA manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.categories.includes("finance"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  assert.ok(manifest.related_applications.some((app) => app.id === "com.psyzon.go"));
  assert.ok(manifest.screenshots.some((screenshot) => screenshot.form_factor === "wide"));
});

test("service worker caches only safe same-origin app assets", async () => {
  const [worker, page] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.match(worker, /Promise\.allSettled/);
  assert.match(page, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(page, /updateViaCache: "none"/);
  assert.match(page, /documentPictureInPicture/);
  assert.match(page, /requestWindow\(\{ width: 230, height: 128 \}\)/);
  assert.match(page, /Modo flutuante/);
  assert.match(page, /Clique para abrir o sistema/);
  assert.match(page, /mobileFloatingOpen/);
  assert.match(page, /Atalho flutuante ativado no celular/);
  assert.match(page, /mobile-floating-launcher/);
});

test("service worker clones a network response before its body is consumed", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const listeners = new Map();
  let releaseCache;
  let cachedBody = "";
  const cacheReady = new Promise((resolve) => { releaseCache = resolve; });

  vm.runInNewContext(worker, {
    URL,
    Promise,
    fetch: async () => new Response("fresh page"),
    caches: {
      open: () => cacheReady,
      match: async () => undefined,
      keys: async () => [],
      delete: async () => true,
    },
    self: {
      location: { origin: "https://psyzon.test" },
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting() {},
      clients: { claim() {} },
    },
  });

  let responsePromise;
  let cachePromise;
  listeners.get("fetch")({
    request: { method: "GET", url: "https://psyzon.test/", mode: "navigate" },
    respondWith: (promise) => { responsePromise = promise; },
    waitUntil: (promise) => { cachePromise = promise; },
  });

  const response = await responsePromise;
  assert.equal(await response.text(), "fresh page");
  releaseCache({ put: async (_key, cachedResponse) => { cachedBody = await cachedResponse.text(); } });
  await cachePromise;
  assert.equal(cachedBody, "fresh page");
});
