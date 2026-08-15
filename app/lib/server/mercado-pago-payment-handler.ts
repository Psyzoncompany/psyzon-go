import type { FirebaseIdentity } from "./firebase-admin";
import type { MercadoPagoPayment } from "./mercado-pago";

const MAX_BODY_BYTES = 4_096;
const PAYMENT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

type PaymentPreview = {
  paymentId: string;
  externalReference: string | null;
  description: string;
  status: string;
  statusDetail: string | null;
  approved: boolean;
  amount: number;
  netAmount: number | null;
  feeAmount: number;
  paymentMethod: string | null;
  transactionDate: string;
};

export type PaymentHandlerDependencies = {
  authenticate: (request: Request) => Promise<FirebaseIdentity>;
  authorize: (identity: FirebaseIdentity) => boolean;
  authorizationConfigured: () => boolean;
  rateLimit: (identity: FirebaseIdentity, request: Request) => Promise<{ allowed: boolean; retryAfter: number }>;
  findPayment: (identifier: string) => Promise<MercadoPagoPayment | null>;
  previewPayment: (payment: MercadoPagoPayment) => PaymentPreview;
  upsertPayment: (identity: FirebaseIdentity, payment: MercadoPagoPayment) => Promise<{ lastSyncedAt: number }>;
  listTransactions: (identity: FirebaseIdentity) => Promise<Array<Record<string, unknown>>>;
};

function jsonResponse(body: object, status: number, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { ...PRIVATE_RESPONSE_HEADERS, ...headers } });
}

export function mercadoPagoMethodNotAllowed() {
  return jsonResponse({ error: "Método não permitido." }, 405, { Allow: "POST" });
}

function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(/[;,\n]/)
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = new Set(configured.length ? configured : ["https://www.psyzon.com.br"]);
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return origins;
}

function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return allowedOrigins().has(new URL(origin).origin) && new URL(origin).origin === origin;
  } catch {
    return false;
  }
}

function hasValidBearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  return Boolean(match && match[1].length <= 8_192);
}

async function readLimitedJson(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) throw new Error("INVALID_BODY");

  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("INVALID_BODY");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error("INVALID_BODY");
  }
}

function paymentIdentifier(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_BODY");
  const record = body as Record<string, unknown>;
  if (!Object.keys(record).every((key) => key === "paymentId" || key === "identifier")) throw new Error("INVALID_BODY");
  if (record.paymentId !== undefined && record.identifier !== undefined) throw new Error("INVALID_BODY");
  const value = record.paymentId ?? record.identifier;
  if (typeof value !== "string") throw new Error("INVALID_PAYMENT_ID");
  const normalized = value.trim();
  if (!PAYMENT_IDENTIFIER.test(normalized)) throw new Error("INVALID_PAYMENT_ID");
  return normalized;
}

function shortText(value: unknown, maximum: number, fallback = "") {
  return typeof value === "string" ? value.slice(0, maximum) : fallback;
}

function nullableText(value: unknown, maximum: number) {
  return value === null ? null : typeof value === "string" ? value.slice(0, maximum) : null;
}

function finiteMoney(value: unknown, nullable = false) {
  if (nullable && value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000_000 ? value : 0;
}

function publicPaymentPreview(preview: PaymentPreview): PaymentPreview {
  return {
    paymentId: shortText(preview.paymentId, 80),
    externalReference: nullableText(preview.externalReference, 160),
    description: shortText(preview.description, 240, "Pagamento Mercado Pago"),
    status: shortText(preview.status, 40, "unknown"),
    statusDetail: nullableText(preview.statusDetail, 120),
    approved: preview.approved === true,
    amount: finiteMoney(preview.amount) as number,
    netAmount: finiteMoney(preview.netAmount, true),
    feeAmount: finiteMoney(preview.feeAmount) as number,
    paymentMethod: nullableText(preview.paymentMethod, 80),
    transactionDate: /^\d{4}-\d{2}-\d{2}$/.test(preview.transactionDate) ? preview.transactionDate : "",
  };
}

export function createMercadoPagoPaymentHandler(dependencies: PaymentHandlerDependencies) {
  return async function POST(request: Request) {
    if (request.method !== "POST") return mercadoPagoMethodNotAllowed();
    if (!hasAllowedOrigin(request)) return jsonResponse({ error: "Origem não autorizada." }, 403);

    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
    if (contentType !== "application/json") return jsonResponse({ error: "Corpo da requisição inválido." }, 400);
    if (!hasValidBearer(request)) return jsonResponse({ error: "Autenticação necessária." }, 401);

    let identity: FirebaseIdentity;
    try {
      identity = await dependencies.authenticate(request);
    } catch (error) {
      if (error instanceof Response && error.status >= 500) {
        console.error("Mercado Pago payment authentication unavailable", { code: "FIREBASE_ADMIN_CONFIGURATION" });
        return jsonResponse({ error: "Não foi possível processar a solicitação." }, 500);
      }
      return jsonResponse({ error: "Token inválido ou expirado." }, 401);
    }

    if (!identity.emailVerified || identity.signInProvider !== "google.com") {
      return jsonResponse({ error: "Usuário autenticado sem permissão para esta operação." }, 403);
    }
    if (!dependencies.authorize(identity)) {
      if (process.env.NODE_ENV === "production" && !dependencies.authorizationConfigured()) {
        console.error("Mercado Pago payment authorization denied", { code: "AUTHORIZATION_NOT_CONFIGURED" });
      }
      return jsonResponse({ error: "Usuário autenticado sem permissão para esta operação." }, 403);
    }

    let rateLimit: { allowed: boolean; retryAfter: number };
    try {
      rateLimit = await dependencies.rateLimit(identity, request);
    } catch {
      console.error("Mercado Pago payment rate limiter unavailable", { code: "DISTRIBUTED_RATE_LIMIT_FAILURE" });
      return jsonResponse({ error: "Não foi possível processar a solicitação." }, 500);
    }
    if (!rateLimit.allowed) {
      return jsonResponse({ error: "Limite de consultas excedido. Tente novamente mais tarde." }, 429, { "Retry-After": String(rateLimit.retryAfter) });
    }

    let identifier: string;
    try {
      identifier = paymentIdentifier(await readLimitedJson(request));
    } catch {
      return jsonResponse({ error: "Corpo ou paymentId inválido." }, 400);
    }

    try {
      const payment = await dependencies.findPayment(identifier);
      if (!payment) return jsonResponse({ error: "Pagamento não encontrado." }, 404);
      const storedPayment = await dependencies.upsertPayment(identity, payment);
      const preview = publicPaymentPreview(dependencies.previewPayment(payment));
      const transactions = await dependencies.listTransactions(identity);
      const existing = transactions.find((transaction) => String(transaction.providerTransactionId ?? "") === preview.paymentId);

      return jsonResponse({
        payment: preview,
        alreadyImported: Boolean(existing),
        existingTransaction: existing ? { id: shortText(existing.id, 160), description: shortText(existing.description, 240, "Movimentação importada") } : null,
        syncedAt: Number.isFinite(storedPayment.lastSyncedAt) ? storedPayment.lastSyncedAt : null,
      }, 200);
    } catch {
      console.error("Mercado Pago payment lookup failed", { code: "UPSTREAM_OR_STORAGE_FAILURE" });
      return jsonResponse({ error: "Não foi possível consultar esse pagamento." }, 500);
    }
  };
}
