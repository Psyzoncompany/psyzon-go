import assert from "node:assert/strict";
import test from "node:test";
import type { FirebaseIdentity } from "../app/lib/server/firebase-admin";
import {
  createMercadoPagoPaymentHandler,
  type PaymentHandlerDependencies,
} from "../app/lib/server/mercado-pago-payment-handler";

const token = "header.payload.signature";
const identity = {
  uid: "user-a",
  email: "owner@example.com",
  displayName: "Owner",
  idToken: token,
  emailVerified: true,
  signInProvider: "google.com",
  admin: false,
  decodedToken: {},
} as FirebaseIdentity;

function dependencies(overrides: Partial<PaymentHandlerDependencies> = {}): PaymentHandlerDependencies {
  return {
    authenticate: async () => identity,
    authorize: () => true,
    authorizationConfigured: () => true,
    rateLimit: async () => ({ allowed: true, retryAfter: 60 }),
    findPayment: async () => ({ id: 123, status: "approved", transaction_amount: 125.5 }),
    previewPayment: () => ({
      paymentId: "123",
      externalReference: "pix-123",
      description: "Pagamento",
      status: "approved",
      statusDetail: "accredited",
      approved: true,
      amount: 125.5,
      netAmount: 120,
      feeAmount: 5.5,
      paymentMethod: "pix",
      transactionDate: "2026-08-15",
    }),
    upsertPayment: async () => ({ lastSyncedAt: 123456 }),
    listTransactions: async () => [],
    ...overrides,
  };
}

function request(options: { method?: string; authorization?: string | null; origin?: string; contentType?: string; body?: BodyInit } = {}) {
  const headers = new Headers();
  if (options.authorization !== null) headers.set("authorization", options.authorization ?? `Bearer ${token}`);
  if (options.contentType !== "") headers.set("content-type", options.contentType ?? "application/json");
  if (options.origin) headers.set("origin", options.origin);
  const method = options.method ?? "POST";
  return new Request("https://www.psyzon.com.br/api/integrations/mercadopago/payment", {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : options.body ?? JSON.stringify({ paymentId: "123" }),
  });
}

test("returns 401 without a bearer token", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ authorization: null }));
  assert.equal(response.status, 401);
});

test("returns 401 for a malformed bearer token", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ authorization: "Bearer not-a-jwt" }));
  assert.equal(response.status, 401);
});

test("returns 401 for an invalid Firebase token", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ authenticate: async () => { throw new Error("invalid"); } }))(request());
  assert.equal(response.status, 401);
});

test("returns 401 for an expired Firebase token", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ authenticate: async () => { throw new Error("expired"); } }))(request());
  assert.equal(response.status, 401);
});

test("returns 403 for an authenticated but unauthorized user", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ authorize: () => false }))(request());
  assert.equal(response.status, 403);
});

test("accepts an authorized user", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request());
  assert.equal(response.status, 200);
});

test("returns 403 when the email is not verified", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ authenticate: async () => ({ ...identity, emailVerified: false }) }))(request());
  assert.equal(response.status, 403);
});

test("returns 403 when the sign-in provider is not Google", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ authenticate: async () => ({ ...identity, signInProvider: "password" }) }))(request());
  assert.equal(response.status, 403);
});

test("returns 405 for GET and advertises POST", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ method: "GET", contentType: "" }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
});

test("rejects an unauthorized origin", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ origin: "https://evil.example" }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("rejects an incorrect content type", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ contentType: "text/plain" }));
  assert.equal(response.status, 400);
});

test("rejects an oversized body", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ body: JSON.stringify({ paymentId: "1".repeat(5000) }) }));
  assert.equal(response.status, 400);
});

test("rejects invalid JSON", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ body: "{" }));
  assert.equal(response.status, 400);
});

test("rejects an empty paymentId", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ body: JSON.stringify({ paymentId: "" }) }));
  assert.equal(response.status, 400);
});

test("rejects a malicious paymentId", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies())(request({ body: JSON.stringify({ paymentId: "../../etc/passwd?<script>" }) }));
  assert.equal(response.status, 400);
});

test("returns a generic 500 when Mercado Pago fails", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ findPayment: async () => { throw new Error("secret upstream detail"); } }))(request());
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /secret|token|stack/i);
});

test("filters the successful response and applies private cache headers", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({
    previewPayment: (() => ({
      paymentId: "123", externalReference: null, description: "Pagamento", status: "approved", statusDetail: null,
      approved: true, amount: 10, netAmount: 9, feeAmount: 1, paymentMethod: "pix", transactionDate: "2026-08-15",
      accessToken: "must-not-leak", payer: { email: "private@example.com" },
    })) as PaymentHandlerDependencies["previewPayment"],
  }))(request());
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /^private, no-store/);
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.doesNotMatch(body, /must-not-leak|private@example|accessToken|payer/);
});

test("returns 429 when the distributed rate limit is reached", async () => {
  const response = await createMercadoPagoPaymentHandler(dependencies({ rateLimit: async () => ({ allowed: false, retryAfter: 321 }) }))(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "321");
});
