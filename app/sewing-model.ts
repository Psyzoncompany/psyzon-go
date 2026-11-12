import type { BusinessNote } from "./notes-model";
import type { Order } from "./order-model";
import { poloExtra } from "./order-pricing";
import type { Bill } from "./finance-model";
import { millis } from "./notes-model";
export const sewingNoteId = "psyzon-sewing-ledger";
export type SewingEntry = {
  id: string;
  person: string;
  kind: "print" | "payment" | "offset";
  quantity: number;
  amount: number;
  date: string;
  name?: string;
  orderId?: string;
};
export type SewingLedger = {
  defaultPerson?: string;
  people: string[];
  assignments: Record<string, string>;
  rates: Record<string, number>;
  excludedOrderIds?: string[];
  hiddenOrderIds?: string[];
  entries: SewingEntry[];
  movements?: SewingMovement[];
};
export type SewingMovement = { id: string; orderId: string; person: string; kind: "sent" | "returned"; quantity: number; date: string; deadline?: string };

export function sewingInCustody(movements: SewingMovement[], orderId: string, person: string) {
  const items = movements.filter(item => item.orderId === orderId && item.person === person);
  const sent = items.filter(item => item.kind === "sent").reduce((sum, item) => sum + item.quantity, 0);
  const returned = items.filter(item => item.kind === "returned").reduce((sum, item) => sum + item.quantity, 0);
  return { sent, returned, remaining: sent - returned };
}

export function validateSewingMovement(ledger: SewingLedger, orders: Order[], movement: SewingMovement, today: string) {
  const order = orders.find(item => item.id === movement.orderId);
  if (!order || order.status === "Orçamento" || !ledger.people.includes(movement.person) || !Number.isInteger(movement.quantity) || movement.quantity < 1 || !["sent", "returned"].includes(movement.kind) || !/^\d{4}-\d{2}-\d{2}$/.test(movement.date) || movement.date > today)
    throw new Error("Confira o pedido, a data e as peças.");
  if (movement.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(movement.deadline)) throw new Error("Confira o prazo.");
  const previous = ledger.movements ?? [];
  const custody = sewingInCustody(previous, order.id, movement.person);
  const held = previous.filter(item => item.orderId === order.id).reduce((sum,item) => sum + (item.kind === "sent" ? item.quantity : -item.quantity), 0);
  if (movement.kind === "sent" && (sewingPerson(ledger, order.id) !== movement.person || held + movement.quantity > order.quantity))
    throw new Error("O envio ultrapassa a quantidade disponível do pedido.");
  if (movement.kind === "returned" && movement.quantity > custody.remaining) throw new Error("O retorno ultrapassa as peças com esta costureira.");
  if (previous.some(item => item.orderId === order.id && item.person === movement.person && item.date > movement.date))
    throw new Error("A data deve ser posterior aos movimentos já registrados.");
}
export function readSewing(
  notes: Pick<BusinessNote, "id" | "content">[],
): SewingLedger {
  const raw = notes.find((note) => note.id === sewingNoteId)?.content;
  if (!raw)
    return { people: ["Zefa"], assignments: {}, rates: {}, entries: [] };
  const value = JSON.parse(raw) as SewingLedger;
  return { ...value, people: [...new Set(value.people)] };
}
export function sewingPerson(ledger: SewingLedger, orderId: string) {
  return ledger.assignments[orderId] || ledger.defaultPerson || "Zefa";
}
export function confirmedEntries(orders: Order[], ledger: SewingLedger) {
  const quotes = new Set(orders.filter(order => order.status === "Orçamento").map(order => order.id));
  return ledger.entries.filter(entry => !entry.orderId || !quotes.has(entry.orderId));
}

export function sewingEntriesForPeriod(entries: SewingEntry[], person?: string, period = "") {
  return entries.filter(entry => (!person || entry.person === person) && (!period || entry.date.startsWith(period + "-")))
    .reverse()
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function sewingEntryTotals(entries: SewingEntry[]) {
  let paid = 0;
  let printCredit = 0, offsets = 0;
  for (const entry of entries) {
    if (entry.kind === "payment") paid += entry.amount;
    else if (entry.kind === "print") printCredit += entry.amount;
    else offsets += entry.amount;
  }
  return { paid: Math.round(paid * 100) / 100, printCredit: Math.round((printCredit - offsets) * 100) / 100, offsets: Math.round(offsets * 100) / 100 };
}
export function sewingBalances(orders: Order[], ledger: SewingLedger) {
  const confirmed = confirmedEntries(orders, ledger);
  const hidden = new Set(ledger.hiddenOrderIds);
  return ledger.people.map((person) => {
    const rows = orders.filter(
      (order) => order.status !== "Orçamento" && !hidden.has(order.id) && sewingPerson(ledger, order.id) === person,
    );
    const total = rows.reduce(
      (sum, order) =>
        sum +
        (ledger.excludedOrderIds?.includes(order.id) ? 0 : order.quantity) *
          (ledger.rates[order.id] ??
            (poloExtra(order.shirtType, order.product) > 0 ? 7 : 4)),
      0,
    );
    const entries = confirmed.filter((entry) => entry.person === person);
    const { paid, printCredit, offsets } = sewingEntryTotals(entries);
    return {
      person,
      rows,
      total,
      printCredit,
      paid,
      offsets,
      balance: Math.round((total - paid - offsets) * 100) / 100,
    };
  });
}

export function sewingOrderBalances(
  orders: Order[],
  ledger: SewingLedger,
  person: string,
) {
  const hidden = new Set(ledger.hiddenOrderIds);
  const rows = orders
    .filter((order) => order.status !== "Orçamento" && !hidden.has(order.id) && sewingPerson(ledger, order.id) === person)
    .sort(
      (a, b) =>
        millis(a.createdAt) - millis(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((order) => ({
      order,
      excluded: ledger.excludedOrderIds?.includes(order.id) ?? false,
      cost:
        (ledger.excludedOrderIds?.includes(order.id) ? 0 : order.quantity) *
        (ledger.rates[order.id] ??
          (poloExtra(order.shirtType, order.product) > 0 ? 7 : 4)),
      paid: 0,
      offset: 0,
    }));
  let unallocated = 0, credit = 0;
  const apply = (row: (typeof rows)[number], amount: number, offset = false) => {
    const used = Math.min(Math.max(0, row.cost - row.paid - row.offset), amount);
    if (offset) row.offset += used;
    else row.paid += used;
    return amount - used;
  };
  for (const entry of confirmedEntries(orders, ledger).filter(
    (entry) => entry.person === person && (entry.kind === "payment" || entry.kind === "offset"),
  )) {
    const target = entry.orderId
      ? rows.find((row) => row.order.id === entry.orderId)
      : undefined;
    const rest = target ? apply(target, entry.amount, entry.kind === "offset") : entry.amount;
    if (entry.kind === "offset") credit += rest;
    else unallocated += rest;
  }
  for (const row of rows) {
    unallocated = apply(row, unallocated);
    credit = apply(row, credit, true);
  }
  return rows.map((row) => ({
    ...row,
    remaining: Math.round((row.cost - row.paid - row.offset) * 100) / 100,
  }));
}
export function sewingBills(orders: Order[], ledger: SewingLedger): Bill[] {
  return sewingBalances(orders, ledger)
    .filter((item) => item.balance > 0)
    .map((item) => ({
      id: "sewing-" + encodeURIComponent(item.person),
      description: "Costura · " + item.person,
      amount: item.balance,
      account: "business",
      billingType: "once",
      dueDay: 1,
      category: "Costura",
    }));
}
