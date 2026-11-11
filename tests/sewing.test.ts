import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readSewing,
  sewingBalances,
  sewingOrderBalances,
  sewingBills,
  type SewingLedger,
} from "../app/sewing-model";
import type { Order } from "../app/order-model";
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
test("legacy payments and print credits settle only their actual amounts", () => {
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
    [46, 21],
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
    [46, 0],
  );
  assert.equal(sewingBills(orders, ledger)[0].amount, 46);
  assert.equal(sewingBalances(orders, ledger)[0].paid, 31);
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
test("surplus printing remains a credit without becoming a cash payment", () => {
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
  assert.equal(sewingBalances(orders, ledger)[0].balance, -15);
  assert.equal(sewingBalances(orders, ledger)[0].paid, 0);
  assert.ok(
    sewingOrderBalances(orders, ledger, "Zefa").every(
      (row) => row.remaining === 0,
    ),
  );
  assert.deepEqual(sewingBills(orders, ledger), []);
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
