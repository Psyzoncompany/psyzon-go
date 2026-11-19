import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { generateRequestDetails, generateVAPIDKeys } from "web-push";
import { GET as dailyPush } from "../app/api/notifications/daily/route";
import { DELETE, POST, PUT } from "../app/api/notifications/push/route";
import { notificationDay, parseDevice, pushEndpoint } from "../app/lib/server/web-push";
import { buildReminderContent } from "../app/notification-content";
import { pendingNotifications } from "../app/pending-notifications";
import type { Bill } from "../app/finance-model";
import type { Order } from "../app/order-model";

test("the daily schedule and date use Bahia time", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(config.crons, [{ path: "/api/notifications/daily", schedule: "0 11 * * *" }]);
  assert.equal(notificationDay(new Date("2026-11-19T02:59:00Z")), "2026-11-18");
  assert.equal(notificationDay(new Date("2026-11-19T03:00:00Z")), "2026-11-19");
});

test("device writes and scheduled delivery require authorization", async () => {
  for (const handler of [PUT, POST, DELETE]) {
    assert.equal((await handler(new Request("https://psyzon.test/api/notifications/push"))).status, 401);
  }
  const { publicKey, privateKey } = generateVAPIDKeys();
  process.env.WEB_PUSH_PUBLIC_KEY = publicKey;
  process.env.WEB_PUSH_PRIVATE_KEY = privateKey;
  process.env.CRON_SECRET = "cron-secret-test";
  try {
    const response = await dailyPush(new Request("https://psyzon.test/api/notifications/daily", { headers: { authorization: "Bearer wrong-secret" } }));
    assert.equal(response.status, 401);
  } finally {
    delete process.env.WEB_PUSH_PUBLIC_KEY;
    delete process.env.WEB_PUSH_PRIVATE_KEY;
    delete process.env.CRON_SECRET;
  }
});

test("subscriptions resolve only to approved Web Push services", () => {
  for (const url of ["https://web.push.apple.com/token", "https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://db5.notify.windows.com/token"]) {
    assert.equal(pushEndpoint(url), url);
  }
  for (const url of ["http://web.push.apple.com/token", "https://web.push.apple.com.evil.test/token", "https://fcm.googleapis.com:8080/token", "https://127.0.0.1/token", "https://fcm.googleapis.com@private.test/token"]) {
    assert.equal(pushEndpoint(url), null);
  }
  const receiver = generateVAPIDKeys();
  const keys = { p256dh: receiver.publicKey, auth: Buffer.alloc(16, 42).toString("base64url") };
  const subscription = { endpoint: "https://web.push.apple.com/token", keys };
  assert.deepEqual(parseDevice(subscription), subscription);
  const sender = generateVAPIDKeys();
  const result = generateRequestDetails(subscription, '{"title":"Entrega hoje"}', {
    vapidDetails: { ...sender, subject: "https://psyzon-go.vercel.app" },
  });
  assert.equal(result.headers["Content-Encoding"], "aes128gcm");
  assert.match(String(result.headers.Authorization), /^vapid /i);
});

test("the daily message uses open orders, bills and purchases from the notification list", () => {
  const order: Order = { id: "one", customer: "Cliente A", product: "Uniformes", quantity: 20, total: 1000, paid: 500, dueDate: "2026-11-17", status: "Produção" };
  const bill: Bill = { id: "energia", description: "Energia", amount: 180, account: "business", category: "Contas", billingType: "once", dueDay: 18, dueDate: "2026-11-18" };
  const items = pendingNotifications(
    [order, { ...order, id: "two", customer: "Cliente B", status: "Entregue" }],
    [bill, { ...bill, id: "paga", description: "Conta paga", settled: true }],
    [{ id: "malha", title: "Malha PV", completed: false, amount: 90, purchaseDate: "2026-11-18" }],
    "2026-11-18",
  );
  const { title, body } = buildReminderContent(items, "");
  assert.equal(title, "Pedido atrasado · Cliente A");
  assert.equal(body, "Uniformes · Atrasado 1 dia\n• Energia · a pagar\n• Comprar · Malha PV");
});

test("the service worker shows a detailed background notification without a tab", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const listeners = new Map<string, Function>();
  const notifications: unknown[] = [];
  vm.runInNewContext(worker, { self: {
    addEventListener: (name: string, handler: Function) => listeners.set(name, handler),
    registration: { showNotification: async (title: string, options: object) => notifications.push([title, { ...options }]) },
  } });
  let lifetime: Promise<void> | undefined;
  listeners.get("push")!({
    data: { json: () => ({ title: "Entrega hoje · Cliente A", body: "Uniformes" }) },
    waitUntil: (promise: Promise<void>) => { lifetime = promise; },
  });
  assert.ok(lifetime);
  await lifetime;
  assert.deepEqual(notifications, [["Entrega hoje · Cliente A", { body: "Uniformes", icon: "/icon-192-v3.png", tag: "psyzon-attention" }]]);
});
