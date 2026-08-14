import type { FirebaseIdentity } from "./firebase-rest";
import { getUserDocument, listUserCollection, setUserDocument } from "./firebase-rest";

export type MercadoPagoPayment = {
  id: number | string;
  external_reference?: string | null;
  description?: string | null;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  date_created?: string;
  date_approved?: string | null;
  payment_method_id?: string;
  payment_type_id?: string;
  transaction_details?: { net_received_amount?: number };
  fee_details?: Array<{ amount?: number; type?: string }>;
};

function cents(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function normalizePayment(payment: MercadoPagoPayment, ownerUserId: string) {
  const feeCents = (payment.fee_details ?? []).reduce((sum, fee) => sum + cents(fee.amount), 0);
  return {
    paymentId: String(payment.id),
    ownerUserId,
    externalReference: payment.external_reference ?? null,
    description: payment.description ?? null,
    status: payment.status ?? "unknown",
    statusDetail: payment.status_detail ?? null,
    amountCents: cents(payment.transaction_amount),
    netAmountCents: payment.transaction_details?.net_received_amount === undefined ? null : cents(payment.transaction_details.net_received_amount),
    feeCents,
    paymentMethod: [payment.payment_method_id, payment.payment_type_id].filter(Boolean).join(" · ") || null,
    dateCreated: payment.date_created ?? null,
    dateApproved: payment.date_approved ?? null,
    lastSyncedAt: Math.floor(Date.now() / 1000),
  };
}

function mercadoPagoPaymentTime(payment: MercadoPagoPayment) {
  return Date.parse(payment.date_approved ?? payment.date_created ?? "") || 0;
}

async function mercadoPagoFetch(path: string) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`MERCADO_PAGO_HTTP_${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  return await mercadoPagoFetch(`/v1/payments/${encodeURIComponent(paymentId)}`) as MercadoPagoPayment;
}

export async function findMercadoPagoPayment(identifier: string) {
  const value = identifier.trim();
  if (!value || value.length > 160) throw new Error("MERCADO_PAGO_INVALID_IDENTIFIER");

  if (/^\d+$/.test(value)) {
    try {
      return await fetchMercadoPagoPayment(value);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "MERCADO_PAGO_HTTP_404") throw error;
    }
  }

  const params = new URLSearchParams({
    sort: "date_created",
    criteria: "desc",
    external_reference: value,
    limit: "20",
    offset: "0",
  });
  const data = await mercadoPagoFetch(`/v1/payments/search?${params}`) as { results?: MercadoPagoPayment[] };
  const results = (data.results ?? []).sort((left, right) => mercadoPagoPaymentTime(right) - mercadoPagoPaymentTime(left));
  return results.find((payment) => payment.status === "approved") ?? results[0] ?? null;
}

export function mercadoPagoImportPreview(payment: MercadoPagoPayment) {
  const normalized = normalizePayment(payment, "");
  const paymentDate = payment.date_approved ?? payment.date_created ?? "";
  return {
    paymentId: normalized.paymentId,
    externalReference: normalized.externalReference,
    description: normalized.description || `Pagamento Mercado Pago #${normalized.paymentId}`,
    status: normalized.status,
    statusDetail: normalized.statusDetail,
    approved: normalized.status === "approved",
    amount: normalized.amountCents / 100,
    netAmount: normalized.netAmountCents === null ? null : normalized.netAmountCents / 100,
    feeAmount: normalized.feeCents / 100,
    paymentMethod: normalized.paymentMethod,
    transactionDate: /^\d{4}-\d{2}-\d{2}/.test(paymentDate) ? paymentDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}

export async function upsertMercadoPagoPayment(identity: FirebaseIdentity, payment: MercadoPagoPayment) {
  const row = normalizePayment(payment, identity.uid);
  await setUserDocument(identity, "mercadoPagoPayments", row.paymentId, row);
  return row;
}

export async function syncMercadoPagoPayments(identity: FirebaseIdentity, beginDate?: string, endDate?: string) {
  const previous = await getUserDocument(identity, "integrationSyncState", "mercado_pago");
  const end = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999-03:00` : new Date().toISOString();
  const fallbackBegin = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const lastSyncedAt = Number(previous?.lastSyncedAt ?? 0);
  const incrementalBegin = lastSyncedAt ? new Date((lastSyncedAt - 86_400) * 1000).toISOString() : fallbackBegin;
  const needsBackfill = !previous?.fullBackfillCompletedAt;
  const begin = beginDate && /^\d{4}-\d{2}-\d{2}$/.test(beginDate) ? `${beginDate}T00:00:00.000-03:00` : needsBackfill ? fallbackBegin : incrementalBegin;
  try {
    const payments: MercadoPagoPayment[] = [];
    const pageSize = 100;
    const maximumPayments = 1_000;
    let available = 0;
    for (let offset = 0; offset < maximumPayments; offset += pageSize) {
      const params = new URLSearchParams({ sort: "date_created", criteria: "desc", range: "date_created", begin_date: begin, end_date: end, limit: String(pageSize), offset: String(offset) });
      const data = await mercadoPagoFetch(`/v1/payments/search?${params}`) as { results?: MercadoPagoPayment[]; paging?: { total?: number } };
      const page = data.results ?? [];
      available = Number(data.paging?.total ?? (available || page.length));
      payments.push(...page);
      if (page.length < pageSize || payments.length >= available) break;
    }
    await Promise.all(payments.map((payment) => upsertMercadoPagoPayment(identity, payment)));
    const now = Math.floor(Date.now() / 1000);
    await setUserDocument(identity, "integrationSyncState", "mercado_pago", { status: "connected", lastSyncedAt: now, lastError: null, recordsChecked: payments.length, fullBackfillCompletedAt: previous?.fullBackfillCompletedAt ?? (needsBackfill ? now : null), updatedAt: now });
    return { synced: payments.length, available: available || payments.length, truncated: available > payments.length, lastSyncedAt: now, begin, end };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "Erro desconhecido";
    const now = Math.floor(Date.now() / 1000);
    await setUserDocument(identity, "integrationSyncState", "mercado_pago", { status: "error", lastSyncedAt: lastSyncedAt || null, lastError: message, recordsChecked: 0, updatedAt: now });
    throw error;
  }
}

export async function listMercadoPagoPayments(identity: FirebaseIdentity) {
  const rows = await listUserCollection(identity, "mercadoPagoPayments", 500);
  return rows.map((row) => ({
    paymentId: row.id,
    ownerUserId: identity.uid,
    externalReference: typeof row.externalReference === "string" ? row.externalReference : null,
    description: typeof row.description === "string" ? row.description : null,
    status: String(row.status ?? "unknown"),
    statusDetail: typeof row.statusDetail === "string" ? row.statusDetail : null,
    amountCents: Number(row.amountCents ?? 0),
    netAmountCents: row.netAmountCents === null ? null : Number(row.netAmountCents ?? 0),
    feeCents: Number(row.feeCents ?? 0),
    paymentMethod: typeof row.paymentMethod === "string" ? row.paymentMethod : null,
    dateCreated: typeof row.dateCreated === "string" ? row.dateCreated : null,
    dateApproved: typeof row.dateApproved === "string" ? row.dateApproved : null,
    rawSummaryJson: "{}",
    lastSyncedAt: Number(row.lastSyncedAt ?? 0),
  })).sort((left, right) => right.lastSyncedAt - left.lastSyncedAt);
}
