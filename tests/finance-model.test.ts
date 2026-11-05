import assert from "node:assert/strict";
import test from "node:test";
import { billDueDate, billIsSettled, customerAdjustments, customerBalances, type Bill } from "../app/finance-model";
import { viewFromHash } from "../app/useViewHistory";

test("customer corrections preserve historical orders and include subsequent purchases", () => {
  const orders = [{ customer: "ANA", total: 880, paid: 520 }];
  const adjustments = customerAdjustments(1000, 200, orders);
  const customers = [{ id: "ana", name: "ANA", phone: "", ...adjustments }];
  assert.equal(customerBalances(customers, orders)[0].total, 1000);
  assert.equal(customerBalances(customers, orders)[0].pending, 200);
  const next = customerBalances(customers, [...orders, { customer: "ANA", total: 100, paid: 20 }])[0];
  assert.equal(next.total, 1100);
  assert.equal(next.pending, 280);
  assert.equal(orders[0].paid, 520);
});

test("zero adjustments are respected, invalid balances rejected, and deletion survives order derivation", () => {
  const orders = [{ customer: "CLIENTE / A", total: 880, paid: 520 }];
  const generated = customerBalances([], orders)[0];
  assert.ok(!generated.id.includes("/"));
  const customers = [{ ...generated, archived: true, ...customerAdjustments(0, 0, orders) }];
  const result = customerBalances(customers, orders);
  assert.equal(result[0].total, 0);
  assert.equal(result[0].pending, 0);
  assert.equal(result.filter((item) => !item.archived).length, 0);
  for (const [total, pending] of [[-1, 0], [100, 101], [NaN, 0], [10, Infinity]]) assert.throws(() => customerAdjustments(total, pending, orders));
});

const bill = (overrides: Partial<Bill> = {}): Bill => ({ id: "rent", description: "Aluguel", amount: 500, account: "business", billingType: "fixed", dueDay: 31, category: "Estrutura", ...overrides });

test("monthly bills reopen next month and clamp due dates to short months", () => {
  const paid = bill({ lastPaidMonth: "2026-11" });
  assert.equal(billIsSettled(paid, "2026-11"), true);
  assert.equal(billIsSettled(paid, "2026-12"), false);
  assert.equal(billDueDate(paid, "2026-02"), "2026-02-28");
  assert.equal(billDueDate(paid, "2028-02"), "2028-02-29");
});

test("one-time bills stay settled and completed installments do not reopen", () => {
  const once = bill({ billingType: "once", dueDate: "2026-11-20", settled: true, direction: "receivable" });
  assert.equal(billIsSettled(once, "2027-01"), true);
  assert.equal(billDueDate(once, "2027-01"), "2026-11-20");
  assert.equal(billIsSettled(bill({ billingType: "installment", totalInstallments: 2, paidInstallments: 2 }), "2027-01"), true);
  assert.equal(billIsSettled(bill({ billingType: "installment", totalInstallments: 2, paidInstallments: 1, lastPaidMonth: "2026-11" }), "2026-12"), false);
});

test("browser history restores available pages and ignores removed views", () => {
  for (const view of ["inicio", "producao", "notas", "clientes", "financeiro", "mais"]) assert.equal(viewFromHash(`#${view}`), view);
  for (const view of ["ai", "pessoal", "unknown", ""]) assert.equal(viewFromHash(`#${view}`), "inicio");
});
