import type { User } from "firebase/auth";

const path = "/api/notifications/push";
const ownerKey = "psy-web-push-owner";

export function hasWebPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushEnabledFor(uid: string) {
  return localStorage.getItem(ownerKey) === uid;
}

export type WebPushSetup = { registration: ServiceWorkerRegistration; publicKey: Uint8Array<ArrayBuffer> };

export async function prepareWebPush(): Promise<WebPushSetup> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("Avisos em segundo plano indisponíveis.");
  const { publicKey } = await response.json();
  if (typeof publicKey !== "string" || !/^B[A-Za-z0-9_-]{86}$/.test(publicKey)) {
    throw new Error("Avisos em segundo plano indisponíveis.");
  }
  const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=");
  return { registration: await navigator.serviceWorker.ready, publicKey: Uint8Array.from(raw, c => c.charCodeAt(0)) };
}

async function changePushDevice(user: User, method: "PUT" | "DELETE" | "POST", body: object) {
  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => null);
  if (response.status === 410) throw new WebPushExpired();
  throw new Error(payload?.error ?? "Não foi possível configurar as notificações.");
}

export class WebPushExpired extends Error {
  constructor() {
    super("A inscrição venceu. Ative os avisos novamente.");
  }
}

export async function enableWebPush(user: User, { registration, publicKey }: WebPushSetup) {
  // Start the subscription within the click handler, while Safari has user activation.
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
  try {
    await changePushDevice(user, "PUT", subscription.toJSON());
  } catch (error) {
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  localStorage.setItem(ownerKey, user.uid);
}

export async function disableWebPush(user: User, registration: ServiceWorkerRegistration) {
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    try {
      await changePushDevice(user, "DELETE", { endpoint: subscription.endpoint });
    } catch (error) {
      if (!await subscription.unsubscribe().catch(() => false)) throw error;
    }
    await subscription.unsubscribe().catch(() => {});
  }
  if (pushEnabledFor(user.uid)) localStorage.removeItem(ownerKey);
}

export async function sendWebPushTest(user: User, registration: ServiceWorkerRegistration) {
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) throw new WebPushExpired();
  await changePushDevice(user, "POST", { endpoint: subscription.endpoint });
}
