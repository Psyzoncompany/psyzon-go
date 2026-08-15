import { createHash } from "node:crypto";
import type { FirebaseIdentity } from "./firebase-admin";
import { getAdminFirestore } from "./firebase-admin";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const USER_RATE_LIMIT = 10;
const IP_RATE_LIMIT = 30;

function environmentList(name: string, normalize: (value: string) => string = (value) => value) {
  return new Set(
    (process.env[name] ?? "")
      .split(/[;,\n]/)
      .map((value) => normalize(value.trim()))
      .filter(Boolean),
  );
}

export function isGoogleIdentity(identity: FirebaseIdentity) {
  return identity.emailVerified && identity.signInProvider === "google.com";
}

export function isAuthorizedMercadoPagoIdentity(identity: FirebaseIdentity) {
  if (!isGoogleIdentity(identity)) return false;
  if (identity.admin) return true;

  const authorizedUids = environmentList("AUTHORIZED_FIREBASE_UIDS");
  const legacyOwner = process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim();
  if (legacyOwner) authorizedUids.add(legacyOwner);
  const authorizedEmails = environmentList("AUTHORIZED_GOOGLE_EMAILS", (value) => value.toLocaleLowerCase("en-US"));

  return authorizedUids.has(identity.uid) || (Boolean(identity.email) && authorizedEmails.has(identity.email.toLocaleLowerCase("en-US")));
}

export function hasMercadoPagoAuthorizationConfiguration() {
  return Boolean(
    process.env.AUTHORIZED_FIREBASE_UIDS?.trim()
    || process.env.AUTHORIZED_GOOGLE_EMAILS?.trim()
    || process.env.MERCADO_PAGO_OWNER_FIREBASE_UID?.trim(),
  );
}

function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip")?.trim() || request.headers.get("cf-connecting-ip")?.trim() || "";
  return /^[0-9a-f:.]{3,64}$/i.test(value) ? value.toLocaleLowerCase("en-US") : "";
}

function privateRateLimitKey(scope: string, value: string) {
  return `${scope}-${createHash("sha256").update(value).digest("hex")}`;
}

export async function enforceMercadoPagoRateLimit(identity: FirebaseIdentity, request: Request) {
  const now = Date.now();
  const windowStart = now - (now % RATE_LIMIT_WINDOW_MS);
  const db = getAdminFirestore();
  const limits = [
    { ref: db.collection("securityRateLimits").doc(privateRateLimitKey("mp-user", identity.uid)), limit: USER_RATE_LIMIT },
  ];
  const ip = requestIp(request);
  if (ip) limits.push({ ref: db.collection("securityRateLimits").doc(privateRateLimitKey("mp-ip", ip)), limit: IP_RATE_LIMIT });

  return db.runTransaction(async (transaction) => {
    const snapshots = await transaction.getAll(...limits.map(({ ref }) => ref));
    const states = snapshots.map((snapshot, index) => {
      const data = snapshot.data();
      const sameWindow = data?.windowStart === windowStart;
      return { count: sameWindow && Number.isInteger(data?.count) ? Number(data?.count) : 0, limit: limits[index].limit };
    });
    const denied = states.some((state) => state.count >= state.limit);
    const retryAfter = Math.max(1, Math.ceil((windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000));
    if (denied) return { allowed: false, retryAfter };

    states.forEach((state, index) => {
      transaction.set(limits[index].ref, { windowStart, count: state.count + 1, updatedAt: now }, { merge: false });
    });
    return { allowed: true, retryAfter };
  });
}
