import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { integrationSyncState, mercadoPagoPayments } from "../../../db/schema";

type MercadoPagoPayment = {
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

function cents(value: unknown) { const amount = Number(value); return Number.isFinite(amount) ? Math.round(amount * 100) : 0; }

function normalizePayment(payment: MercadoPagoPayment, ownerUserId: string) {
  const feeCents = (payment.fee_details ?? []).reduce((sum, fee) => sum + cents(fee.amount), 0);
  return {
    paymentId: String(payment.id), ownerUserId,
    externalReference: payment.external_reference ?? null,
    description: payment.description ?? null,
    status: payment.status ?? "unknown", statusDetail: payment.status_detail ?? null,
    amountCents: cents(payment.transaction_amount),
    netAmountCents: payment.transaction_details?.net_received_amount === undefined ? null : cents(payment.transaction_details.net_received_amount),
    feeCents,
    paymentMethod: [payment.payment_method_id, payment.payment_type_id].filter(Boolean).join(" · ") || null,
    dateCreated: payment.date_created ?? null,
    dateApproved: payment.date_approved ?? null,
    rawSummaryJson: JSON.stringify({ id: payment.id, external_reference: payment.external_reference, description: payment.description, status: payment.status, status_detail: payment.status_detail, transaction_amount: payment.transaction_amount, date_created: payment.date_created, date_approved: payment.date_approved, payment_method_id: payment.payment_method_id, payment_type_id: payment.payment_type_id, net_received_amount: payment.transaction_details?.net_received_amount, fees: payment.fee_details }),
    lastSyncedAt: Math.floor(Date.now() / 1000),
  };
}

async function mercadoPagoFetch(path: string) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("MERCADO_PAGO_NOT_CONFIGURED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://api.mercadopago.com${path}`, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`MERCADO_PAGO_HTTP_${response.status}`);
    return response.json();
  } finally { clearTimeout(timer); }
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  return await mercadoPagoFetch(`/v1/payments/${encodeURIComponent(paymentId)}`) as MercadoPagoPayment;
}

export async function upsertMercadoPagoPayment(ownerUserId: string, payment: MercadoPagoPayment) {
  const row = normalizePayment(payment, ownerUserId);
  await getDb().insert(mercadoPagoPayments).values(row).onConflictDoUpdate({
    target: mercadoPagoPayments.paymentId,
    set: { ...row },
  });
  return row;
}

export async function syncMercadoPagoPayments(ownerUserId: string, beginDate?: string, endDate?: string) {
  const db = getDb();
  const [sync] = await db.select().from(integrationSyncState).where(and(eq(integrationSyncState.ownerUserId, ownerUserId), eq(integrationSyncState.provider, "mercado_pago"))).limit(1);
  const end = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? `${endDate}T23:59:59.999-03:00` : new Date().toISOString();
  const fallbackBegin = new Date(Date.now() - 90 * 86400000).toISOString();
  const incrementalBegin = sync?.lastSyncedAt ? new Date((sync.lastSyncedAt - 86400) * 1000).toISOString() : fallbackBegin;
  const begin = beginDate && /^\d{4}-\d{2}-\d{2}$/.test(beginDate) ? `${beginDate}T00:00:00.000-03:00` : incrementalBegin;
  const params = new URLSearchParams({ sort: "date_created", criteria: "desc", range: "date_created", begin_date: begin, end_date: end, limit: "100", offset: "0" });
  try {
    const data = await mercadoPagoFetch(`/v1/payments/search?${params}`) as { results?: MercadoPagoPayment[]; paging?: { total?: number } };
    const payments = data.results ?? [];
    for (const payment of payments) await upsertMercadoPagoPayment(ownerUserId, payment);
    const now = Math.floor(Date.now() / 1000);
    await db.insert(integrationSyncState).values({ ownerUserId, provider: "mercado_pago", status: "connected", lastSyncedAt: now, lastError: null, recordsChecked: payments.length, updatedAt: now }).onConflictDoUpdate({ target: [integrationSyncState.ownerUserId, integrationSyncState.provider], set: { status: "connected", lastSyncedAt: now, lastError: null, recordsChecked: payments.length, updatedAt: now } });
    return { synced: payments.length, available: data.paging?.total ?? payments.length, lastSyncedAt: now, begin, end };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 180) : "Erro desconhecido";
    const now = Math.floor(Date.now() / 1000);
    await db.insert(integrationSyncState).values({ ownerUserId, provider: "mercado_pago", status: "error", lastError: message, recordsChecked: 0, updatedAt: now }).onConflictDoUpdate({ target: [integrationSyncState.ownerUserId, integrationSyncState.provider], set: { status: "error", lastError: message, updatedAt: now } });
    throw error;
  }
}

export async function listMercadoPagoPayments(ownerUserId: string) {
  return getDb().select().from(mercadoPagoPayments).where(eq(mercadoPagoPayments.ownerUserId, ownerUserId)).orderBy(desc(mercadoPagoPayments.dateCreated)).limit(500);
}
