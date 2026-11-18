import type { Bill } from "./finance-model";
import type { Order } from "./order-model";

type Receipt = { kind: "receipt" | "refund"; customerId: string; orderState: string };
type BillPayment = { kind: "bill"; bill: Pick<Bill, "id" | "amount" | "account" | "billingType" | "direction" | "dueDate" | "dueDay" | "paidInstallments" | "lastPaidMonth"> };
export type FinanceIntent = (Receipt | BillPayment) & {
  id: string;
  label: string;
  date: string;
  amount: number;
  includeBalance: boolean;
  error?: string;
};

export class FinanceIntentConflict extends Error {}

export function financeConnectionFailure(error: unknown) {
  return !!error && typeof error === "object" && "code" in error &&
    ["unavailable", "deadline-exceeded"].includes(String(error.code));
}

const prefix = (uid: string) => `psyzon:finance-pending:${uid}:`;
function key(uid: string, entry: FinanceIntent) {
  return prefix(uid) + (entry.kind === "bill"
    ? `bill:${encodeURIComponent(entry.bill.id)}`
    : `${entry.kind}:${encodeURIComponent(entry.customerId)}`);
}

export function readFinanceIntents(uid: string) {
  if (!uid) return [];
  let keys: string[];
  try { keys = Object.keys(localStorage); } catch { return []; }
  return keys.filter(id => id.startsWith(prefix(uid))).flatMap(id => {
    try {
      const item = JSON.parse(localStorage.getItem(id) ?? "null") as FinanceIntent | null;
      const validTarget = item?.kind === "bill" ? typeof item.bill?.id === "string"
        : (item?.kind === "receipt" || item?.kind === "refund") && typeof item.customerId === "string" && typeof item.orderState === "string";
      return item && validTarget && typeof item.id === "string" && typeof item.label === "string" &&
        typeof item.date === "string" && Number.isFinite(item.amount) ? [item] : [];
    } catch { return []; }
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function queueFinanceIntent(uid: string, item: FinanceIntent) {
  const id = key(uid, item);
  if (localStorage.getItem(id)) return false;
  localStorage.setItem(id, JSON.stringify(item));
  return true;
}

export function updateFinanceIntent(uid: string, item: FinanceIntent, error?: string) {
  const id = key(uid, item);
  const current = localStorage.getItem(id);
  if (!current || JSON.parse(current).id !== item.id) return;
  if (error) localStorage.setItem(id, JSON.stringify({ ...item, error }));
  else localStorage.removeItem(id);
}

export function receiptOrderState(orders: Order[]) {
  return JSON.stringify(orders.filter(order => order.status !== "Orçamento")
    .sort((a, b) => a.id.localeCompare(b.id)).map(order => [order.id, order.total, order.paid]));
}
