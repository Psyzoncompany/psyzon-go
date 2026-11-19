import { createHash, randomUUID } from "node:crypto";
import { FieldPath, type DocumentReference, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { sendNotification, type PushSubscription } from "web-push";
import type { Bill } from "../../finance-model";
import { restockPrefix, restockTasks } from "../../notes/restock-model";
import type { BusinessNote } from "../../notes-model";
import { buildReminderContent } from "../../notification-content";
import { normalizeOrderStatus, type Order } from "../../order-model";
import { pendingNotifications } from "../../pending-notifications";
import { getAdminFirestore } from "./firebase-admin";

const subscriptionCollection = "webPushSubscriptions";
const subject = "https://psyzon-go.vercel.app";
const clock = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "America/Bahia" });

type Device = PushSubscription & {
  uid: string;
  lastTestAt?: number;
  sentDay?: string;
  claim?: string | null;
  claimUntil?: number;
};

type Message = { title: string; body: string };

export function notificationDay(now = new Date()) {
  return clock.format(now);
}

export function pushEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.pathname === "/") return null;
    const host = url.hostname;
    if (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
        host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com") ||
        host.endsWith(".wns.windows.com")) return url.href;
  } catch {
    // Ignore endpoints a browser cannot use.
  }
  return null;
}

export function parseDevice(value: unknown): PushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as Partial<PushSubscription>;
  const url = pushEndpoint(endpoint);
  if (!url || typeof keys?.p256dh !== "string" || typeof keys.auth !== "string" ||
      !/^B[A-Za-z0-9_-]{86}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth)) return null;
  return { endpoint: url, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function pushCredentials() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  return publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

function devices() {
  return getAdminFirestore().collection(subscriptionCollection);
}

function deviceReference(endpoint: string) {
  return devices().doc(createHash("sha256").update(endpoint).digest("hex"));
}

export async function registerPushDevice(uid: string, device: PushSubscription) {
  const reference = deviceReference(device.endpoint);
  const db = getAdminFirestore();
  return db.runTransaction(async (transaction) => {
    const existing = (await transaction.get(reference)).data() as Device | undefined;
    if (existing && (existing.keys.auth !== device.keys.auth || existing.keys.p256dh !== device.keys.p256dh)) return false;
    if (existing?.uid === uid) return true;
    transaction.set(reference, { ...device, uid });
    return true;
  });
}

export async function removePushDevice(uid: string, endpoint: string) {
  const reference = deviceReference(endpoint);
  await getAdminFirestore().runTransaction(async (transaction) => {
    if ((await transaction.get(reference)).get("uid") === uid) transaction.delete(reference);
  });
}

function providerStatus(error: unknown) {
  return typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode : null;
}

async function deliver(device: Device, message: Message, test = false) {
  const vapidDetails = pushCredentials();
  if (!vapidDetails) throw new Error("WEB_PUSH_NOT_CONFIGURED");
  try {
    await sendNotification(device, JSON.stringify(message), {
      vapidDetails,
      TTL: test ? 300 : 8 * 60 * 60,
      urgency: "normal",
      topic: test ? "psyzon-test" : "psyzon-attention",
      timeout: 8000,
    });
    return "sent" as const;
  } catch (error) {
    const status = providerStatus(error);
    if (status === 404 || status === 410) return "expired" as const;
    // Provider errors can include subscription URLs and keys.
    console.error("Web Push rejeitado pelo provedor", { status });
    return "failed" as const;
  }
}

export async function testPushDevice(uid: string, endpoint: string) {
  const reference = deviceReference(endpoint);
  const db = getAdminFirestore();
  const now = Date.now();
  const pending = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const device = snapshot.data() as Device | undefined;
    if (device?.uid !== uid) return "missing" as const;
    if ((device.lastTestAt ?? 0) + 60_000 > now) return "limited" as const;
    transaction.update(reference, { lastTestAt: now });
    return device;
  });
  if (typeof pending === "string") return pending;
  const result = await deliver(pending, {
    title: "PSYZON GO · Notificação de teste",
    body: "Este dispositivo está pronto para receber avisos de pendências.",
  }, true);
  if (result === "expired") await removePushDevice(uid, endpoint);
  return result;
}

async function accountMessage(uid: string, day: string): Promise<Message | null> {
  const account = getAdminFirestore().collection("users").doc(uid);
  const [orders, bills, notes] = await Promise.all([
    account.collection("orders").select("orderKind", "status", "dtfStatus", "dueDate", "customer", "product", "createdAt").get(),
    account.collection("bills").select("billingType", "dueDay", "dueDate", "direction", "description", "amount", "settled", "lastPaidMonth", "totalInstallments", "paidInstallments").get(),
    account.collection("notes").orderBy(FieldPath.documentId()).startAt(restockPrefix).endAt(restockPrefix + "\uf8ff").select("title", "content", "category", "pinned").get(),
  ]);
  const accountOrders = orders.docs.map((doc) => ({ ...doc.data(), id: doc.id, status: normalizeOrderStatus(doc.get("status")) }) as Order)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const accountBills = bills.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Bill)
    .sort((a, b) => a.dueDay - b.dueDay);
  const stock = restockTasks(notes.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as BusinessNote));
  const items = pendingNotifications(accountOrders, accountBills, stock, day);
  if (!items.length) return null;
  const { title, body } = buildReminderContent(items, "");
  return { title, body };
}

async function dispatchDevice(reference: DocumentReference, uid: string, day: string, message: Message) {
  const db = getAdminFirestore();
  const claim = randomUUID();
  const device = await db.runTransaction(async (transaction) => {
    const current = (await transaction.get(reference)).data() as Device | undefined;
    if (current?.uid !== uid || current.sentDay === day || (current.claimUntil ?? 0) > Date.now()) return null;
    transaction.update(reference, { claim, claimUntil: Date.now() + 120_000 });
    return current;
  });
  if (!device) return "skipped" as const;

  const result = await deliver(device, message);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    if (current.get("claim") !== claim) return;
    if (result === "expired") transaction.delete(reference);
    else transaction.update(reference, {
      claim: null,
      claimUntil: 0,
      ...(result === "sent" ? { sentDay: day } : {}),
    });
  });
  return result;
}

export async function dispatchDailyPush(day: string) {
  const stats = { sent: 0, failed: 0, expired: 0, skipped: 0 };
  const messages = new Map<string, Promise<Message | null>>();
  let after: QueryDocumentSnapshot | undefined;
  const baseQuery = devices().orderBy(FieldPath.documentId()).limit(50);

  for (;;) {
    const page = await (after ? baseQuery.startAfter(after) : baseQuery).get();
    for (let index = 0; index < page.docs.length; index += 8) {
      const results = await Promise.allSettled(page.docs.slice(index, index + 8).map(async (doc) => {
        const device = doc.data() as Device;
        if (device.sentDay === day || !device.uid) return "skipped";
        let message = messages.get(device.uid);
        if (!message) {
          message = accountMessage(device.uid, day);
          messages.set(device.uid, message);
        }
        const content = await message;
        return content ? dispatchDevice(doc.ref, device.uid, day, content) : "skipped";
      }));
      for (const result of results) stats[result.status === "rejected" ? "failed" : result.value] += 1;
    }
    if (page.size < 50) return stats;
    after = page.docs.at(-1);
  }
}
