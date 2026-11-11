import type { BusinessNote } from "./notes-model";
import type { Order } from "./order-model";
import type { Bill } from "./finance-model";
export const sewingNoteId = "psyzon-sewing-ledger";
export type SewingEntry = {
  id: string;
  person: string;
  kind: "print" | "payment";
  quantity: number;
  amount: number;
  date: string;
};
export type SewingLedger = {
  people: string[];
  assignments: Record<string, string>;
  rates: Record<string, number>;
  entries: SewingEntry[];
};
export function readSewing(
  notes: Pick<BusinessNote, "id" | "content">[],
): SewingLedger {
  const raw = notes.find((note) => note.id === sewingNoteId)?.content;
  if (!raw)
    return { people: ["Zefa"], assignments: {}, rates: {}, entries: [] };
  const value = JSON.parse(raw) as SewingLedger;
  return { ...value, people: [...new Set(["Zefa", ...value.people])] };
}
export function sewingBalances(orders: Order[], ledger: SewingLedger) {
  return ledger.people.map((person) => {
    const rows = orders.filter(
      (order) => (ledger.assignments[order.id] || "Zefa") === person,
    );
    const total = rows.reduce(
      (sum, order) =>
        sum +
        order.quantity *
          (ledger.rates[order.id] ?? (/\bpolo\b/i.test(order.product) ? 7 : 4)),
      0,
    );
    const entries = ledger.entries.filter((entry) => entry.person === person);
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
