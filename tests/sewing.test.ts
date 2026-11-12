import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readSewing,
  sewingBalances,
  sewingOrderBalances,
  sewingBills,
  sewingEntriesForPeriod,
  sewingEntryTotals,
  type SewingLedger,
} from "../app/sewing-model";
import type { Order } from "../app/order-model";
import { orderAlerts } from "../app/order-alerts";

test("quotes create neither sewing charges nor production alerts until confirmed", () => {
  const quote: Order = {...orders[0],status:"Orçamento",dtfStatus:"pending"};
  const ledger=readSewing([]);
  assert.deepEqual(sewingBills([quote],ledger),[]);
  assert.deepEqual(orderAlerts([quote],[],[],[],ledger,String).get(quote.id),undefined);
  const confirmed: Order={...quote,status:"Aguardando material"};
  assert.equal(sewingBills([confirmed],ledger)[0].amount,64);
  assert.equal(orderAlerts([confirmed],[],[],[],ledger,String).get(quote.id)?.length,3);
});

test("excluded orders remain visible but do not contribute to sewing charges", () => {
  const ledger = {...readSewing([]), excludedOrderIds:["a"]};
  const rows = sewingOrderBalances(orders, ledger, "Zefa");
  assert.equal(rows.find(row => row.order.id === "a")?.excluded, true);
  assert.equal(rows.find(row => row.order.id === "a")?.remaining, 0);
  assert.equal(sewingBills(orders, ledger)[0].amount, 21);
  assert.equal(sewingBills(orders, {...ledger,excludedOrderIds:[]})[0].amount, 85);
});
const orders: Order[] = [
  {
    id: "a",
    customer: "Ana",
    product: "Camisa",
    quantity: 16,
    total: 100,
    paid: 0,
    status: "Produção",
    dueDate: "2026-11-20",
  },
  {
    id: "b",
    customer: "Bia",
    product: "Polo",
    quantity: 3,
    total: 100,
    paid: 0,
    status: "Produção",
    dueDate: "2026-11-20",
  },
];
test("only payments settle sewing orders and print credits are shown separately", () => {
  const ledger: SewingLedger = {
    people: ["Zefa"],
    assignments: {},
    rates: {},
    entries: [
      {
        id: "p",
        person: "Zefa",
        kind: "payment",
        amount: 10,
        quantity: 0,
        date: "2026-11-11",
      },
      {
        id: "s",
        person: "Zefa",
        kind: "print",
        amount: 8,
        quantity: 2,
        date: "2026-11-11",
        name: "Igreja",
      },
    ],
  };
  assert.deepEqual(
    sewingOrderBalances(orders, ledger, "Zefa").map((row) => row.remaining),
    [54, 21],
  );
  ledger.entries.push({
    id: "paid",
    person: "Zefa",
    kind: "payment",
    amount: 21,
    quantity: 0,
    date: "2026-11-11",
    orderId: "b",
  });
  assert.deepEqual(
    sewingOrderBalances(orders, ledger, "Zefa").map((row) => row.remaining),
    [54, 0],
  );
  assert.equal(sewingBills(orders, ledger)[0].amount, 54);
  assert.equal(sewingBalances(orders, ledger)[0].paid, 31);
  assert.equal(sewingBalances(orders, ledger)[0].printCredit, 8);
});
test("increasing a paid order quantity reopens just its difference", () => {
  const ledger: SewingLedger = {
    people: ["Zefa"],
    assignments: {},
    rates: {},
    entries: [
      {
        id: "paid",
        person: "Zefa",
        kind: "payment",
        amount: 64,
        quantity: 0,
        date: "2026-11-11",
        orderId: "a",
      },
    ],
  };
  assert.equal(sewingOrderBalances(orders, ledger, "Zefa")[0].remaining, 0);
  assert.equal(
    sewingOrderBalances(
      [{ ...orders[0], quantity: 17 }, orders[1]],
      ledger,
      "Zefa",
    )[0].remaining,
    4,
  );
});
test("printing greater than the amount due leaves all sewing charges pending", () => {
  const ledger: SewingLedger = {
    people: ["Zefa"],
    assignments: {},
    rates: {},
    entries: [
      {
        id: "print",
        person: "Zefa",
        kind: "print",
        amount: 100,
        quantity: 25,
        date: "2026-11-11",
      },
    ],
  };
  assert.equal(sewingBalances(orders, ledger)[0].balance, 85);
  assert.equal(sewingBalances(orders, ledger)[0].printCredit, 100);
  assert.equal(sewingBalances(orders, ledger)[0].paid, 0);
  assert.deepEqual(sewingOrderBalances(orders, ledger, "Zefa").map(row => row.remaining), [64, 21]);
  assert.equal(sewingBills(orders, ledger)[0].amount, 85);
  assert.equal(orderAlerts(orders, [], [], [], ledger, String).get("a")?.find(alert => alert.view === "costureiras")?.detail, "Zefa · 64 pendentes");
});

test("orders removed from the sewing list stay out of sewing bills and production alerts after reload", () => {
  const ledger = readSewing([{ id: "psyzon-sewing-ledger", content: JSON.stringify({ ...readSewing([]), hiddenOrderIds: ["a"] }) }]);
  assert.deepEqual(sewingOrderBalances(orders, ledger, "Zefa").map(row => row.order.id), ["b"]);
  assert.equal(sewingBills(orders, ledger)[0].amount, 21);
  assert.ok(!orderAlerts(orders, [], [], [], ledger, String).get("a")?.some(alert => alert.view === "costureiras"));
  assert.equal(orders[0].customer, "Ana");
});

test("historical totals filter by person, year and month and keep printing separate", () => {
  const base = { id: "entry", person: "Zefa", kind: "payment", quantity: 0, amount: 10, date: "2025-12-31" } as const;
  const entries: SewingLedger["entries"] = [
    base,
    { ...base, id: "feb", amount: 30, date: "2026-02-01" },
    { ...base, id: "nov", amount: 45, date: "2026-11-11" },
    { ...base, id: "print", kind: "print", amount: 8, date: "2026-11-11" },
    { ...base, id: "other", person: "Maria", amount: 100, date: "2026-11-11" },
  ];
  assert.deepEqual(sewingEntryTotals(sewingEntriesForPeriod(entries, "Zefa")), { paid: 85, printCredit: 8, offsets: 0 });
  assert.deepEqual(sewingEntryTotals(sewingEntriesForPeriod(entries, "Zefa", "2026")), { paid: 75, printCredit: 8, offsets: 0 });
  assert.deepEqual(sewingEntryTotals(sewingEntriesForPeriod(entries, "Zefa", "2026-11")), { paid: 45, printCredit: 8, offsets: 0 });
  assert.deepEqual(sewingEntryTotals(sewingEntriesForPeriod(entries, "Zefa", "2026-12")), { paid: 0, printCredit: 0, offsets: 0 });
  assert.deepEqual(sewingEntryTotals(sewingEntriesForPeriod(entries, undefined, "2026")), { paid: 175, printCredit: 8, offsets: 0 });
});
test("renaming the default seamstress survives reload and applies to new orders", () => {
  const ledger = readSewing([
    {
      id: "psyzon-sewing-ledger",
      content: JSON.stringify({
        people: ["Maria"],
        defaultPerson: "Maria",
        assignments: {},
        rates: {},
        entries: [],
      }),
    },
  ]);
  assert.deepEqual(ledger.people, ["Maria"]);
  assert.equal(sewingBalances(orders, ledger)[0].total, 85);
});

test("manual settlements consume print credit and debt without creating a cash payment", () => {
  const ledger: SewingLedger = { people: ["Zefa"], assignments: {}, rates: {}, entries: [
    { id: "print", person: "Zefa", kind: "print", quantity: 25, amount: 100, date: "2026-11-01" },
    { id: "offset", person: "Zefa", kind: "offset", quantity: 0, amount: 40, date: "2026-11-02" },
  ] };
  assert.equal(sewingBalances(orders, ledger)[0].printCredit, 60);
  assert.equal(sewingBalances(orders, ledger)[0].balance, 45);
  assert.equal(sewingBalances(orders, ledger)[0].paid, 0);
  assert.deepEqual(sewingOrderBalances(orders, ledger, "Zefa").map(row => [row.remaining, row.offset]), [[24,40],[21,0]]);
  ledger.entries = ledger.entries.filter(item => item.id !== "offset");
  assert.equal(sewingBalances(orders, ledger)[0].balance, 85);
  assert.equal(sewingBalances(orders, ledger)[0].printCredit, 100);
});

test("physical custody accepts partial returns and rejects returns or sends exceeding available pieces", async () => {
  const { validateSewingMovement, sewingInCustody } = await import("../app/sewing-model");
  const ledger = { ...readSewing([]), movements: [{ id: "sent", person: "Zefa", orderId: "a", kind: "sent" as const, quantity: 16, date: "2026-11-01", deadline: "2026-11-12" }] };
  const returned = { id: "returned", person: "Zefa", orderId: "a", kind: "returned" as const, quantity: 10, date: "2026-11-02" };
  assert.doesNotThrow(() => validateSewingMovement(ledger, orders, returned, "2026-11-12"));
  assert.throws(() => validateSewingMovement(ledger, orders, { ...returned, quantity: 17 }, "2026-11-12"));
  assert.throws(() => validateSewingMovement(ledger, orders, { ...returned, kind: "sent", quantity: 1 }, "2026-11-12"));
  ledger.movements.push(returned);
  assert.deepEqual(sewingInCustody(ledger.movements, "a", "Zefa"), { sent: 16, returned: 10, remaining: 6 });
});
