import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { financialReconciliation } from "../../../db/schema";
import type { FirebaseIdentity } from "./firebase-rest";
import { listUserCollection } from "./firebase-rest";
import { listMercadoPagoPayments } from "./mercado-pago";
import { buildMercadoPagoReconciliation, type ProviderPayment, type SystemTransaction } from "./reconciliation-core";

function transactionDate(item: Record<string, unknown>) {
  const explicit = typeof item.transactionDate === "string" ? item.transactionDate : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const parsed = new Date(String(item.createdAt ?? item._createTime ?? ""));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}
export async function reconcileMercadoPago(identity: FirebaseIdentity) {
  const local = (await listUserCollection(identity, "transactions", 500)).filter((item) => item.account === "business" && item.type === "income").map<SystemTransaction>((item) => ({
    id: item.id, amountCents: Math.round(Number(item.amount ?? 0) * 100), date: transactionDate(item), orderId: String(item.orderId ?? ""), providerId: String(item.providerTransactionId ?? item.paymentId ?? ""), description: String(item.description ?? ""), type: String(item.type ?? ""),
  }));
  const payments = await listMercadoPagoPayments(identity.uid) as ProviderPayment[];
  const results = buildMercadoPagoReconciliation(identity.uid, local, payments);

  const db = getDb();
  await db.delete(financialReconciliation).where(eq(financialReconciliation.ownerUserId, identity.uid));
  if (results.length) await db.insert(financialReconciliation).values(results);
  return { checked: results.length, totals: results.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {}), problems: results.filter((item) => item.status !== "CONCILIADO").slice(0, 100) };
}
