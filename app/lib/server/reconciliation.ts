import type { FirebaseIdentity } from "./firebase-rest";
import { deleteUserDocument, listUserCollection, setUserDocument } from "./firebase-rest";
import { listMercadoPagoPayments } from "./mercado-pago";
import { buildMercadoPagoReconciliation, type ProviderPayment, type SystemTransaction } from "./reconciliation-core";

function transactionDate(item: Record<string, unknown>) {
  const explicit = typeof item.transactionDate === "string" ? item.transactionDate : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const parsed = new Date(String(item.createdAt ?? item._createTime ?? ""));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

export async function listReconciliation(identity: FirebaseIdentity) {
  const rows = await listUserCollection(identity, "mercadoPagoReconciliation", 500);
  return rows.map((row) => ({
    id: row.id,
    ownerUserId: identity.uid,
    systemTransactionId: typeof row.systemTransactionId === "string" ? row.systemTransactionId : null,
    providerPaymentId: typeof row.providerPaymentId === "string" ? row.providerPaymentId : null,
    status: String(row.status ?? ""),
    systemAmountCents: row.systemAmountCents === null ? null : Number(row.systemAmountCents ?? 0),
    providerAmountCents: row.providerAmountCents === null ? null : Number(row.providerAmountCents ?? 0),
    differenceCents: row.differenceCents === null ? null : Number(row.differenceCents ?? 0),
    confidence: String(row.confidence ?? "high"),
    reason: String(row.reason ?? ""),
    updatedAt: Number(row.updatedAt ?? 0),
  }));
}

export async function reconcileMercadoPago(identity: FirebaseIdentity) {
  const local = (await listUserCollection(identity, "transactions", 500))
    .filter((item) => item.account === "business" && item.type === "income")
    .map<SystemTransaction>((item) => ({
      id: item.id,
      amountCents: Math.round(Number(item.amount ?? 0) * 100),
      date: transactionDate(item),
      orderId: String(item.orderId ?? ""),
      providerId: String(item.providerTransactionId ?? item.paymentId ?? ""),
      description: String(item.description ?? ""),
      type: String(item.type ?? ""),
    }));
  const payments = await listMercadoPagoPayments(identity) as ProviderPayment[];
  const results = buildMercadoPagoReconciliation(identity.uid, local, payments);
  const previous = await listUserCollection(identity, "mercadoPagoReconciliation", 500);
  await Promise.all(previous.map((row) => deleteUserDocument(identity, "mercadoPagoReconciliation", row.id)));
  await Promise.all(results.map((row) => setUserDocument(identity, "mercadoPagoReconciliation", row.id, row)));
  return {
    checked: results.length,
    totals: results.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {}),
    problems: results.filter((item) => item.status !== "CONCILIADO").slice(0, 100),
  };
}
