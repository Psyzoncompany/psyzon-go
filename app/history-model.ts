import { billDueDate, billIsSettled, roundMoney, type Bill } from "./finance-model";
import { millis, readDocument, type BusinessNote, type NoteMaterial } from "./notes-model";
import type { Order } from "./order-model";

export const historyKinds = { orders: "Pedidos", payable: "Conta a pagar", paid: "Conta paga", fabric: "Compra de malha" } as const;
export type HistoryKind = keyof typeof historyKinds;
export type HistoryInput = { kind: HistoryKind; date: string; title: string; quantity: number; amount: number; supplier: string; notes: string };
export type HistoryEntry = HistoryInput & { id: string; source: "manual" | "material" };
export type HistoryRow = HistoryInput & { id: string; source: HistoryEntry["source"] | "system" };
type Expense = { id: string; type: string; source?: string; description: string; amount: number; transactionDate?: string; createdAt?: unknown };

const bahiaDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function historyDate(value: unknown) {
  if (typeof value === "string" && datePattern.test(value)) return value;
  const timestamp = millis(value);
  return timestamp && Number.isFinite(timestamp) ? bahiaDate.format(timestamp) : "";
}

export function validateHistoryInput(input: HistoryInput) {
  if (!Object.hasOwn(historyKinds, input.kind) || !datePattern.test(input.date) || !input.title.trim()) throw new Error("Confira o tipo, a data e a descrição do registro.");
  const quantityValid = input.kind === "orders" ? Number.isInteger(input.quantity) && input.quantity >= 1 : input.kind === "fabric" ? input.quantity > 0 : input.quantity === 0;
  if (!Number.isFinite(input.quantity) || !quantityValid || input.quantity > 1000000) throw new Error("Confira a quantidade do registro.");
  if (!Number.isFinite(input.amount) || input.amount < (input.kind === "payable" || input.kind === "paid" ? .01 : 0) || input.amount > 100000000 || (input.kind === "orders" && input.amount !== 0)) throw new Error("Confira o valor do registro.");
}

export const materialHistoryId = (noteId: string, materialId: string) => `material-${encodeURIComponent(JSON.stringify([noteId, materialId]))}`;

function isFabric(material: NoteMaterial) {
  return material.fabricKg > 0 && material.fabricKg <= 1000000 && material.fabricCost >= 0 && material.fabricCost <= 100000000;
}

export function fabricHistoryEntry(note: Pick<BusinessNote, "title">, material: NoteMaterial, date: string): Omit<HistoryEntry, "id"> | undefined {
  if (!isFabric(material)) return;
  return { kind: "fabric", source: "material", date, title: `Malha ${material.fabricType}${material.color ? ` · ${material.color}` : ""}`.slice(0, 200), supplier: (material.supplier || "").slice(0, 120), quantity: material.fabricKg, amount: roundMoney(material.fabricCost), notes: (note.title || "").slice(0, 1200) };
}

export function legacyFabricPurchases(notes: BusinessNote[], entries: HistoryEntry[]) {
  const known = new Set(entries.map(entry => entry.id));
  return notes.flatMap(note => {
    const purchased = new Set(note.purchasedMaterialIds);
    const materials = (note.materials ?? []).filter(material => isFabric(material) && purchased.has(material.id) && !known.has(materialHistoryId(note.id, material.id)));
    return materials.length ? [{ id: note.id, title: note.title || "Anotação sem título", materialIds: materials.map(material => material.id), quantity: materials.reduce((sum, material) => sum + material.fabricKg, 0) }] : [];
  });
}

export function pendingFabric(notes: BusinessNote[]) {
  return notes.reduce((sum, note) => {
    if (!note.materials?.length || readDocument(note.content).status === "trash") return sum;
    const purchased = new Set(note.purchasedMaterialIds);
    return sum + note.materials.reduce((subtotal, material) => !purchased.has(material.id) && isFabric(material) ? subtotal + material.fabricKg : subtotal, 0);
  }, 0);
}

export function historyRows(orders: Order[], bills: Bill[], transactions: Expense[], entries: HistoryEntry[], month: string): HistoryRow[] {
  const system: HistoryRow[] = [];
  for (const order of orders) {
    const date = historyDate(order.createdAt);
    if (date) system.push({ id: `order-${order.id}`, source: "system", kind: "orders", date, title: order.product, quantity: 1, amount: 0, supplier: "", notes: `${order.customer} · ${order.quantity} peças` });
  }
  for (const bill of bills) {
    if (bill.direction === "receivable" || billIsSettled(bill, month)) continue;
    system.push({ id: `pending-${bill.id}`, source: "system", kind: "payable", date: billDueDate(bill, month), title: bill.description, amount: bill.amount, quantity: 0, supplier: "", notes: bill.category });
  }
  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.source !== "bill") continue;
    const date = historyDate(transaction.transactionDate || transaction.createdAt);
    if (date) system.push({ id: `paid-${transaction.id}`, source: "system", kind: "paid", date, title: transaction.description, amount: transaction.amount, quantity: 0, supplier: "", notes: "" });
  }
  return [...system, ...entries].sort((a, b) => b.date.localeCompare(a.date));
}

export function historyTotals(rows: HistoryRow[]) {
  const totals = { orders: 0, payable: 0, payableCount: 0, paid: 0, fabric: 0, fabricAmount: 0 };
  for (const item of rows) {
    if (item.kind === "orders") totals.orders += item.quantity;
    if (item.kind === "payable") { totals.payable += item.amount; totals.payableCount++; }
    if (item.kind === "paid") totals.paid += item.amount;
    if (item.kind === "fabric") { totals.fabric += item.quantity; totals.fabricAmount += item.amount; }
  }
  return totals;
}
