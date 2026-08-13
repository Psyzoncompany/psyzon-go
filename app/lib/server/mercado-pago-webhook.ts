function parseSignature(header: string) {
  return Object.fromEntries(
    header
      .split(",")
      .map((part) => part.trim().split("=", 2))
      .filter((part) => part.length === 2),
  );
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function signMercadoPagoManifest(secret: string, dataId: string, requestId: string, timestamp: string) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
}

export async function verifyMercadoPagoSignature(
  secret: string,
  dataId: string,
  requestId: string,
  signature: string,
  nowSeconds = Date.now() / 1000,
) {
  const parts = parseSignature(signature);
  const timestamp = parts.ts ?? "";
  const received = parts.v1 ?? "";
  if (!timestamp || !received || Math.abs(nowSeconds - Number(timestamp)) > 900) return false;
  const expected = await signMercadoPagoManifest(secret, dataId, requestId, timestamp);
  return constantTimeEqual(expected, received);
}

export function mercadoPagoEventKey(eventId: string | number | undefined, requestId: string, action?: string) {
  return `mercado_pago:${eventId ?? requestId}:${action ?? "payment"}`;
}
