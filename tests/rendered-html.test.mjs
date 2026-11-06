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
  assert.match(html, /name="viewport" content="[^"]*maximum-scale=1[^"]*user-scalable=no/);
  assert.match(html, /icon-192-v3\.png\?v=4/);
  assert.doesNotMatch(html, /rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
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
  const [worker, page, localNotifications, androidManifest] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/localNotifications.ts", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /request\.headers\.has\("authorization"\)/);
  assert.match(worker, /cacheControl\.includes\("no-store"\)/);
  assert.doesNotMatch(worker, /PUBLIC_ASSETS = \[[\s\S]*?"\/"/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.match(worker, /Promise\.allSettled/);
  assert.match(page, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(page, /updateViaCache: "none"/);
  assert.match(page, /documentPictureInPicture/);
  assert.match(page, /requestWindow\(\{ width: 230, height: 128 \}\)/);
  assert.match(page, /Modo flutuante/);
  assert.match(page, /Clique para abrir o sistema/);
  assert.doesNotMatch(page, /mobileFloatingOpen/);
  assert.doesNotMatch(page, /Atalho flutuante ativado no celular/);
  assert.doesNotMatch(page, /mobile-floating-launcher/);
  assert.match(page, /syncDailyReminders/);
  assert.match(page, /08:00, 14:00 e 19:00/);
  assert.match(localNotifications, /hour: 8/);
  assert.match(localNotifications, /hour: 14/);
  assert.match(localNotifications, /hour: 19/);
  assert.match(localNotifications, /allowWhileIdle: true/);
  assert.match(localNotifications, /LocalNotifications\.schedule/);
  assert.match(localNotifications, /Capacitor\.isPluginAvailable\("LocalNotifications"\)/);
  assert.match(localNotifications, /"unsupported"/);
  assert.match(localNotifications, /priority\.title/);
  assert.match(localNotifications, /priority\.detail/);
  assert.match(localNotifications, /largeBody: content\.body/);
  assert.match(localNotifications, /outra\(s\) pendência\(s\)/);
  assert.match(androidManifest, /android\.permission\.SCHEDULE_EXACT_ALARM/);
  assert.match(page, /Notificações indisponíveis neste navegador/);
  assert.match(page, /sidebarCollapsed/);
  assert.match(page, /sidebar-collapse-button/);
  assert.match(page, /PanelLeftClose/);
  assert.match(page, /sidebar-collapsed/);
  assert.match(page, /className="nav-group"/);
  assert.match(page, /label: "Operação"/);
  assert.match(page, /label: "Gestão"/);
  assert.match(page, /label: "Conta"/);
  assert.match(page, /editingOrder/);
  assert.match(page, /OrderEditModal/);
  assert.match(page, /Pedido e financeiro atualizados/);
});

test("service worker clones only a public static response before its body is consumed", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const listeners = new Map();
  let releaseCache;
  let cachedBody = "";
  const cacheReady = new Promise((resolve) => { releaseCache = resolve; });

  vm.runInNewContext(worker, {
    URL,
    Promise,
    fetch: async () => new Response("fresh asset", { headers: { "cache-control": "public, max-age=31536000" } }),
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
    request: { method: "GET", url: "https://psyzon.test/_next/static/chunks/app.js", destination: "script", headers: new Headers() },
    respondWith: (promise) => { responsePromise = promise; },
    waitUntil: (promise) => { cachePromise = promise; },
  });

  const response = await responsePromise;
  assert.equal(await response.text(), "fresh asset");
  releaseCache({ put: async (_key, cachedResponse) => { cachedBody = await cachedResponse.text(); } });
  await cachePromise;
  assert.equal(cachedBody, "fresh asset");
});

test("removes AI and bank widgets from the app while preserving secured server integrations", async () => {
  const [page, workspace, schema, aiRoute, aiStore, webhook, paymentLookup, paymentHandler, mercadoPago, exampleEnv] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PSYZONAIWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server/ai-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/webhooks/mercadopago/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/integrations/mercadopago/payment/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server/mercado-pago-payment-handler.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server/mercado-pago.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);



  assert.match(page, /event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/);
  assert.match(page, /Tamanho das letras/);
  assert.match(page, /extra-large/);


  assert.doesNotMatch(page, /PSYZONAIWorkspace|ai-floating-button|PluggyFinance|Saldo pessoal|Saldo empresa/);
  assert.match(page, /<FinanceWorkspace/);
  assert.match(page, /<CustomersWorkspace/);
  assert.match(workspace, /ai-quick-grid/);
  assert.match(workspace, /SpeechRecognition/);
  assert.match(workspace, /Salvar hist/);
  assert.match(workspace, /psyzon-ai-active-conversation/);
  assert.match(workspace, /financial_confirm/);
  assert.match(workspace, /Modelo preferido/);
  assert.match(workspace, /DeepSeek → Groq → Gemini/);
  assert.match(workspace, /preferredProvider/);
  assert.match(schema, /ai_conversations/);
  assert.match(schema, /ai_audit_logs/);
  assert.match(schema, /financial_reconciliation/);
  assert.match(aiRoute, /authenticateFirebaseRequest/);
  assert.match(aiStore, /listUserCollection\(identity, "aiConversations"/);
  assert.match(aiStore, /setUserDocument\(identity, "aiSettings"/);
  assert.match(aiStore, /preferredProvider: "auto"/);
  assert.match(aiRoute, /allowed\.preferredProvider = body\.preferredProvider/);
  assert.match(aiStore, /getUserDocument\(identity, "integrationSyncState", "mercado_pago"/);
  assert.match(webhook, /verifyMercadoPagoSignature/);
  assert.match(paymentLookup, /authenticateFirebaseRequest/);
  assert.match(paymentLookup, /isAuthorizedMercadoPagoIdentity/);
  assert.match(paymentLookup, /enforceMercadoPagoRateLimit/);
  assert.match(paymentHandler, /alreadyImported/);
  assert.match(paymentHandler, /private, no-store/);
  assert.match(mercadoPago, /external_reference: value/);
  assert.match(mercadoPago, /fetchMercadoPagoPayment\(value\)/);


  assert.match(page, /initializeAuth\(app, \{[\s\S]*?persistence: browserLocalPersistence,[\s\S]*?popupRedirectResolver: browserPopupRedirectResolver/);
  assert.doesNotMatch(page, /setPersistence\(/);
  assert.match(exampleEnv, /^DEEPSEEK_API_KEY=/m);
  assert.match(exampleEnv, /^DEEPSEEK_MODEL=deepseek-v4-pro$/m);
  assert.match(exampleEnv, /^GROQ_API_KEY=/m);
  assert.match(exampleEnv, /^GROQ_MODEL=openai\/gpt-oss-120b$/m);
  assert.match(exampleEnv, /^GEMINI_API_KEY=/m);
  assert.match(exampleEnv, /^MERCADO_PAGO_ACCESS_TOKEN=/m);
  assert.match(exampleEnv, /^AUTHORIZED_FIREBASE_UIDS=/m);
  assert.match(exampleEnv, /^NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY=/m);
  assert.doesNotMatch(exampleEnv, /NEXT_PUBLIC_(DEEPSEEK|GEMINI|MERCADO_PAGO)/);
});

test("keeps the AI workspace stable with large global fonts", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /body\.ai-workspace-active \{ zoom: 1;/);
  assert.match(css, /\.app-shell\.ai-page-active > \.sidebar/);
  assert.match(css, /--ai-answer-text: 14\.5px/);
  assert.match(css, /overflow-x: hidden/);

});

test("keeps notifications inside the viewport at every interface size", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /data-ui-size="extra-large"[^}]+--ui-viewport-width: 78\.125vw/);
  assert.match(css, /\.notification-panel \{[^}]+var\(--ui-viewport-width\)/);
  assert.match(css, /\.toast \{[^}]+max-width:[^}]+var\(--ui-viewport-width\)/);
  assert.match(css, /\.toast \{ bottom: 84px; white-space: normal; \}/);
  assert.match(css, /\.notification-item small \{[^}]+overflow-wrap: anywhere/);
});

test("allows the Pluggy modal stylesheet without weakening script CSP", async () => {
  const [proxy, css, component] = await Promise.all([
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/PluggyFinance.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(proxy, /script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(proxy, /style-src-elem 'self' 'unsafe-inline'/);
  assert.doesNotMatch(proxy, /script-src[^\n]+unsafe-inline/);
  assert.match(css, /\.pluggy-widget-portal \[id\$="_modal"\][^}]+width: 100vw !important[^}]+height: 100dvh !important/);
  assert.match(css, /\.pluggy-widget-portal iframe[^}]+width: 100% !important[^}]+height: 100% !important/);
  assert.match(component, /allowFullscreen/);
});

test("uses the full desktop viewport for the fabric calculator", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width: 901px\) \{[\s\S]+?\.calculator-panel \{[^}]+width: 100%; height: 100%; max-height: none/);
  assert.match(css, /\.fabric-calculator \{[^}]+grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.fabric-calculator \.same-collar-color input\[type="checkbox"\] \{[^}]+width: 15px; height: 15px/);
});

test("uses readable typography in AI response cards and conversation sidebar", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.ai-brand b \{ font-size: 14px/);
  assert.match(css, /\.ai-conversation-list > div > button:first-child span[^}]+font-size: 12px/);
  assert.match(css, /\.ai-response-metrics small \{[^}]+font-size: 11px/);
  assert.match(css, /\.ai-response-metrics b \{[^}]+font-size: 18px/);
  assert.match(css, /\.ai-confirmation dd \{[^}]+font-size: 11\.5px/);
});

test("renders professional markdown structure in AI answers", async () => {
  const [workspace, css] = await Promise.all([
    readFile(new URL("../app/PSYZONAIWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /function MarkdownText/);
  assert.match(workspace, /ai-markdown-table-wrap/);
  assert.match(workspace, /formatInlineMarkdown/);
  assert.match(css, /\.ai-markdown-content blockquote/);
  assert.match(css, /\.ai-markdown-table-wrap table/);
});
