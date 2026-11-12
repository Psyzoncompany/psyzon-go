import type { BusinessNote } from "./notes-model";
import type { Order } from "./order-model";
import { poloExtra } from "./order-pricing";
import type { Bill } from "./finance-model";
import { millis } from "./notes-model";
export const sewingNoteId = "psyzon-sewing-ledger";
export type SewingEntry = {
  id: string;
  person: string;
  kind: "print" | "payment";
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
};
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
  let printCredit = 0;
  for (const entry of entries) {
    if (entry.kind === "payment") paid += entry.amount;
    else printCredit += entry.amount;
  }
  return { paid: Math.round(paid * 100) / 100, printCredit: Math.round(printCredit * 100) / 100 };
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
    const { paid, printCredit } = sewingEntryTotals(entries);
    return {
      person,
      rows,
      total,
      printCredit,
      paid,
      balance: Math.round((total - paid) * 100) / 100,
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
    }));
  let unallocated = 0;
  const apply = (row: (typeof rows)[number], amount: number) => {
    const used = Math.min(Math.max(0, row.cost - row.paid), amount);
    row.paid += used;
    return amount - used;
  };
  for (const entry of confirmedEntries(orders, ledger).filter(
    (entry) => entry.person === person && entry.kind === "payment",
  )) {
    const target = entry.orderId
      ? rows.find((row) => row.order.id === entry.orderId)
      : undefined;
    unallocated += target ? apply(target, entry.amount) : entry.amount;
  }
  for (const row of rows) {
    unallocated = apply(row, unallocated);
  }
  return rows.map((row) => ({
    ...row,
    remaining: Math.round((row.cost - row.paid) * 100) / 100,
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
