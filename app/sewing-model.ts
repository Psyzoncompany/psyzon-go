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
function confirmedEntries(orders: Order[], ledger: SewingLedger) {
  const quotes = new Set(orders.filter(order => order.status === "Orçamento").map(order => order.id));
  return ledger.entries.filter(entry => !entry.orderId || !quotes.has(entry.orderId));
}
export function sewingBalances(orders: Order[], ledger: SewingLedger) {
  const confirmed = confirmedEntries(orders, ledger);
  return ledger.people.map((person) => {
    const rows = orders.filter(
      (order) => order.status !== "Orçamento" && sewingPerson(ledger, order.id) === person,
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
    const prints = entries
      .filter((entry) => entry.kind === "print")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const paid = entries
      .filter((entry) => entry.kind === "payment")
      .reduce((sum, entry) => sum + entry.amount, 0);
    return {
      person,
      rows,
      total,
      prints,
      paid,
      balance: Math.round((total - prints - paid) * 100) / 100,
    };
  });
}

export function sewingOrderBalances(
  orders: Order[],
  ledger: SewingLedger,
  person: string,
) {
  const rows = orders
    .filter((order) => order.status !== "Orçamento" && sewingPerson(ledger, order.id) === person)
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
      credit: 0,
    }));
  const funds = { payment: 0, print: 0 };
  const apply = (
    row: (typeof rows)[number],
    kind: "payment" | "print",
    amount: number,
  ) => {
    const used = Math.min(
      Math.max(0, row.cost - row.paid - row.credit),
      amount,
    );
    if (kind === "payment") row.paid += used;
    else row.credit += used;
    return amount - used;
  };
  for (const entry of confirmedEntries(orders, ledger).filter(
    (entry) => entry.person === person,
  )) {
    const target = entry.orderId
      ? rows.find((row) => row.order.id === entry.orderId)
      : undefined;
    funds[entry.kind] += target
      ? apply(target, entry.kind, entry.amount)
      : entry.amount;
  }
  for (const row of rows) {
    funds.print = apply(row, "print", funds.print);
    funds.payment = apply(row, "payment", funds.payment);
  }
  return rows.map((row) => ({
    ...row,
    remaining: Math.round((row.cost - row.paid - row.credit) * 100) / 100,
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
