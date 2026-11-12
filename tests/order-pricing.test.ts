import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isChildShirt,
  shirtTotal,
  validateShirtPrice,
} from "../app/order-pricing";
import { synchronizedOrderQuantities } from "../app/order-quantity-sync";
import { customerBalances, customerReceipt } from "../app/finance-model";
import { documentPrefix, type BusinessNote } from "../app/notes-model";
import type { Order } from "../app/order-model";
import { suggestedShirtPrice } from "../app/order-pricing";
import { sewingBalances, readSewing } from "../app/sewing-model";
test("custom child prices preserve the default discount and support free items", () => {
  assert.equal(shirtTotal(45, 17, 3), 750);
  assert.equal(shirtTotal(45, 17, 3, 35), 735);
  assert.equal(shirtTotal(60, 17, 3, 0), 840);
  assert.throws(() => validateShirtPrice(45, 17, 3, -1));
});
test("quantity brackets follow the price table and preserve manual overrides", () => {
  assert.deepEqual(
    [1, 2, 3, 5, 6, 20, 21].map(suggestedShirtPrice),
    [55, 55, 50, 50, 45, 45, 50],
  );
  const auto: Order = {
    id: "price",
    customer: "Ana",
    product: "Camisas",
    quantity: 21,
    total: 0,
    paid: 0,
    dueDate: "2026-11-20",
    status: "Produção",
    unitPrice: 45,
    pricingMode: "quantity",
  };
  assert.equal(synchronizedOrderQuantities([auto], [], [])[0].total, 1050);
  assert.equal(
    synchronizedOrderQuantities([{ ...auto, pricingMode: "manual" }], [], [])[0]
      .total,
    945,
  );
  const changed = synchronizedOrderQuantities(
    [{ ...auto, id: "a", quantity: 20 }],
    [note(Array(21).fill("M"))],
    [],
  )[0];
  assert.equal(changed.unitPrice, 50);
  assert.equal(changed.total, 1050);
});
const order: Order = {
  id: "a",
  customer: "Ana",
  product: "Camisa",
  quantity: 10,
  unitPrice: 30,
  childQuantity: 2,
  total: 290,
  paid: 100,
  dueDate: "2026-11-20",
  status: "Produção",
};
const note = (sizes: string[]): BusinessNote => ({
  id: "n",
  title: "Ana",
  category: "Produção",
  pinned: false,
  content:
    documentPrefix +
    JSON.stringify({
      version: 2,
      status: "active",
      orderId: "a",
      customerId: "",
      blocks: [],
      productionChecklist: {
        client: "Ana",
        deadline: "",
        notes: "",
        warnings: [],
        rows: sizes.map((size, i) => ({
          id: String(i),
          size,
          model: "A confirmar",
          name: "Sem nome",
          done: false,
        })),
      },
    }),
});
test("child models and ages get the discount without treating adult numeric sizes as children", () => {
  assert.ok(isChildShirt({ model: "Infantil", size: "G" }));
  assert.ok(isChildShirt({ model: "A confirmar", size: "10anos" }));
  assert.equal(isChildShirt({ model: "Masculina", size: "42" }), false);
  assert.equal(shirtTotal(30, 10, 2), 290);
  assert.equal(shirtTotal(29.99, 3, 1), 84.97);
  assert.equal(shirtTotal(3, 1, 1), 0);
  assert.throws(() => validateShirtPrice(30, 2, 3));
});
test("adding adult or child pieces changes total and receivable, then removing the checklist restores registered quantities", () => {
  const adult = synchronizedOrderQuantities(
    [order],
    [note([...Array(10).fill("M"), "10anos", "12anos"])],
    [],
  )[0];
  assert.equal(adult.quantity, 12);
  assert.equal(adult.childQuantity, 2);
  assert.equal(adult.total, 350);
  const children = synchronizedOrderQuantities(
    [order],
    [note(["M", "M", "8anos"])],
    [],
  )[0];
  assert.equal(children.total, 85);
  assert.equal(synchronizedOrderQuantities([order], [], [])[0].total, 290);
  const customer = { id: "c", name: "Ana", phone: "" };
  assert.equal(customerBalances([customer], [adult])[0].pending, 250);
  assert.equal(customerReceipt(customer, [adult]).amount, 250);
});
test("legacy manual totals stay unchanged until a unit price is supplied", () => {
  const legacy = { ...order, unitPrice: undefined, total: 500 };
  assert.equal(
    synchronizedOrderQuantities([legacy], [note(["M", "M", "10anos"])], [])[0]
      .total,
    500,
  );
});
test("polo adds fifteen to adult and child prices and uses the seven-real sewing rate", () => {
  const polo = { ...order, unitPrice: 45, shirtType: "polo" as const };
  assert.equal(synchronizedOrderQuantities([polo], [], [])[0].total, 590);
  assert.equal(sewingBalances([polo], readSewing([]))[0].total, 70);
});
