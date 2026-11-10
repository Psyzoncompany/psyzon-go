import assert from "node:assert/strict";
import test from "node:test";
import { billDueDate, billIsSettled, billPaymentId, billReversal, billSettlementAfterEdit, currentBillExpense, customerAdjustments, customerBalances, customerReceipt, financialSummary, nextMonthPayables, orderReceivables, type Bill } from "../app/finance-model";
import { noteFromHash, viewFromHash } from "../app/useViewHistory";
import { dtfAlertDays, nextOrderStatus, normalizeOrderStatus, orderStatuses, type Order } from "../app/order-model";
import { changeDtfPrints, dtfForCustomer, dtfOverdue, dtfPending, dtfPhotos, dtfTitle, dtfTotal, packDtfPhotos, readDtfPrints, validateDtf, type DtfInput, type DtfPrint } from "../app/dtf-model";
import { dtfDeadline, indexDtfCustomerLinks } from "../app/dtf-links";
import { synchronizedOrderPhotos, notePhotoOrderId } from "../app/order-photo-sync";
import { documentPrefix, type BusinessNote } from "../app/notes-model";
import { fabricHistoryEntry, historyDate, historyRows, historyTotals, legacyFabricPurchases, materialHistoryId, pendingFabric, type HistoryEntry } from "../app/history-model";

test("order photos share one source, recover legacy photos and keep removal and order identity", () => {
  const order: Order = { id: "one", customer: "ANA", product: "Camisa", quantity: 1, total: 0, paid: 0, dueDate: "2026-12-01", status: "Produção" };
  const customers = [{ id: "ana", name: "ANA" }];
  const note: BusinessNote = { id: "note", title: "Lista", category: "Produção", pinned: false, productionPhotoData: "legacy", content: documentPrefix + JSON.stringify({ version: 2, blocks: [], status: "active", orderId: "one", customerId: "ana" }) };
  assert.equal(synchronizedOrderPhotos([order], [note], [], customers)[0].photoData, "legacy");
  assert.equal(synchronizedOrderPhotos([{ ...order, photoData: "current" }], [note], [], customers)[0].photoData, "current");
  assert.equal(synchronizedOrderPhotos([{ ...order, photoData: "" }], [note], [], customers)[0].photoData, "");
  assert.equal(notePhotoOrderId({ orderId: "", customerId: "ana" }, [order], customers), "one");
  const two = { ...order, id: "two" };
  assert.equal(notePhotoOrderId({ orderId: "", customerId: "ana" }, [order, two], customers), undefined);
  assert.equal(indexDtfCustomerLinks(customers, [order, two], []).get("ana")?.orderId, undefined);
  assert.equal(synchronizedOrderPhotos([order, two], [note], [], customers)[1].photoData, "");
  assert.equal(indexDtfCustomerLinks(customers, [order, two], [note]).get("ana")?.orderId, "one");
});

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

test("the next-month payable forecast rolls over the year and respects due dates and remaining installments", () => {
  const installment = bill({ billingType: "installment", totalInstallments: 3, paidInstallments: 2, amount: 100 });
  const once = bill({ billingType: "once", dueDate: "2027-01-10", amount: 40.25 });
  const result = nextMonthPayables([
    bill(),
    once,
    { ...once, dueDate: "2026-12-01" },
    { ...once, settled: true },
    { ...once, direction: "receivable" },
    installment,
    { ...installment, lastPaidMonth: "2026-12" },
    { ...installment, paidInstallments: 1 },
    { ...installment, paidInstallments: 3 },
    { ...installment, lastPaidMonth: "2027-01" },
  ], "2026-12");
  assert.deepEqual(result, { label: "janeiro de 2027", total: 740.25 });
  assert.equal(viewFromHash("#afazeres"), "afazeres");
  assert.equal(viewFromHash("#reposicao"), "reposicao");
});

test("history separates order dates in Bahia, open due dates, actual payments, and manual counts", () => {
  const order: Order = { id: "camisas", customer: "Ana", product: "Camisas", quantity: 16, total: 800, paid: 800, dueDate: "2026-11-09", status: "Entregue", createdAt: "2026-11-01T01:30:00Z" };
  assert.equal(historyDate(order.createdAt), "2026-10-31");
  const entries: HistoryEntry[] = [{ id: "old", source: "manual", kind: "orders", title: "Anotações", date: "2026-10-03", quantity: 4, amount: 0, supplier: "", notes: "" }];
  const bills = [bill(), bill({ id: "outubro", billingType: "once", dueDate: "2026-10-20", amount: 123 }), bill({ id: "cliente", direction: "receivable" })];
  const paid = { id: "paid", type: "expense", source: "bill", description: "Energia", amount: 249.50, transactionDate: "2026-10-21" };
  const rows = historyRows([order], bills, [paid, { ...paid, id: "recebido", type: "income" }], entries, "2026-11");
  assert.deepEqual(historyTotals(rows.filter(row => row.date.startsWith("2026-10"))), { orders: 5, payable: 123, payableCount: 1, paid: 249.50, fabric: 0, fabricAmount: 0 });
  assert.equal(historyTotals(rows.filter(row => row.date.startsWith("2026-11"))).payable, 500);
  assert.equal(historyTotals(historyRows([order], bills, [], entries, "2026-11")).paid, 0);
  assert.equal(viewFromHash("#historico"), "historico");
});

test("fabric history freezes the purchased fabric weight and cost and identifies undated purchases", () => {
  const material = { id: "malha", fabricType: "PV", color: "Azul", supplier: "Loja", fabricKg: 2.5, fabricCost: 112.344, collarType: "common", ribanaKg: .2, ribanaCost: 10, ribanaPricePerKg: 50, poloUnits: 0, totalCost: 122.344 } as const;
  const note: BusinessNote = { id: "ana", title: "Camisas da Ana", content: "", category: "Compras", pinned: false, materials: [material], purchasedMaterialIds: ["malha"] };
  const entry = fabricHistoryEntry(note, material, "2026-10-31");
  assert.ok(entry);
  assert.equal(entry.quantity, 2.5);
  assert.equal(entry.amount, 112.34);
  assert.deepEqual(legacyFabricPurchases([note], []), [{ id: "ana", title: note.title, quantity: 2.5, materialIds: ["malha"] }]);
  assert.deepEqual(legacyFabricPurchases([note], [{ ...entry, id: materialHistoryId(note.id, material.id) }]), []);
  assert.equal(pendingFabric([note, { ...note, id: "pending", purchasedMaterialIds: [] }]), 2.5);
});

test("deleting a customer removes only their debt from all live totals and keeps historical orders", () => {
  const orders = [{ id: "old", customer: " JOÃO  SILVA ", total: 880, paid: 520 }, { id: "live", customer: "Ana", total: 200, paid: 100 }];
  const customers = [{ id: "joao", name: "João Silva", phone: "", archived: true }];
  const balances = customerBalances(customers, orders);
  const summary = financialSummary(balances, [bill({ direction: "receivable", amount: 75 })], "2026-11");
  assert.equal(summary.pending, 175);
  assert.deepEqual(summary.debtors.map(customer => customer.name), ["Ana"]);
  assert.equal(orderReceivables(balances, orders).get("old"), 0);
  assert.equal(orders[0].paid, 520);
});

test("receipts update orders and preserve the rest of the adjusted customer balance", () => {
  const orders = [{ id: "one", customer: "Ana", total: 200, paid: 100 }, { id: "two", customer: "Ana", total: 150, paid: 0 }];
  const customer = { id: "ana", name: "Ana", phone: "", pendingAdjustment: -125 };
  const receipt = customerReceipt(customer, orders);
  assert.equal(receipt.amount, 125);
  assert.deepEqual(receipt.payments, [{ orderId: "one", amount: 100, paid: 200 }, { orderId: "two", amount: 25, paid: 25 }]);
  const after = orders.map((order, index) => ({ ...order, paid: receipt.payments[index].paid }));
  const updatedCustomer = { ...customer, ...receipt.adjustments };
  assert.equal(financialSummary(customerBalances([updatedCustomer], after), []).pending, 0);
  assert.equal(financialSummary(customerBalances([updatedCustomer], [...after, { customer: "Ana", total: 150, paid: 0 }]), []).pending, 150);
  assert.throws(() => customerReceipt({ ...customer, archived: true }, orders));
});

test("changing recurrence keeps a bill settled for the period already paid", () => {
  const month = new Date().toLocaleDateString("sv-SE").slice(0, 7);
  const original = bill({ lastPaidMonth: month });
  const changed = { ...original, billingType: "once" as const, ...billSettlementAfterEdit(original, "once") };
  assert.equal(billIsSettled(changed, month), true);
});

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

test("undoing a bill payment finds only its own expense and restores the previous installment", () => {
  const paid = bill({ billingType: "installment", paidInstallments: 2, totalInstallments: 2, lastPaidMonth: "2026-11" });
  const payment = { id: billPaymentId(paid.id, "2026-11"), type: "expense", source: "bill", billId: paid.id, transactionDate: "2026-11-06" };
  const older = { ...payment, id: billPaymentId(paid.id, "2026-10"), transactionDate: "2026-10-06" };
  const unrelated = { ...payment, source: "pluggy" };
  assert.equal(currentBillExpense(paid, [unrelated, older, payment]), payment);
  assert.equal(currentBillExpense(paid, [unrelated, older]), undefined);
  const reversal = billReversal(paid, [unrelated, older, payment]);
  assert.deepEqual(reversal, { lastPaidMonth: "2026-10", settled: false, paidInstallments: 1 });
  assert.equal(financialSummary([], [{ ...paid, ...reversal }], "2026-11").toPay, paid.amount);
  const once = { ...payment, id: billPaymentId(paid.id, "once") };
  assert.equal(currentBillExpense(paid, [once]), once);
  assert.equal(currentBillExpense(paid, [{ ...once, transactionDate: "2026-10-06" }]), undefined);
  assert.equal(billIsSettled({ ...paid, billingType: "once", settled: true, ...billReversal({ ...paid, billingType: "once" }, [once]) }, "2026-11"), false);
});

test("browser history restores available pages and ignores removed views", () => {
  for (const view of ["inicio", "producao", "notas", "clientes", "financeiro", "mais"]) assert.equal(viewFromHash(`#${view}`), view);
  for (const view of ["ai", "pessoal", "unknown", ""]) assert.equal(viewFromHash(`#${view}`), "inicio");
});

test("linked notes keep their ID in browser history without affecting other views", () => {
  const hash = `#notas?nota=${encodeURIComponent("pedido #1")}`;
  assert.equal(viewFromHash(hash), "notas");
  assert.equal(noteFromHash(hash), "pedido #1");
  assert.equal(noteFromHash("#notas"), "");
  assert.equal(noteFromHash("#producao?nota=123"), "");
});

test("legacy order stages remain visible and the next action skips retired stages", () => {
  assert.deepEqual(orderStatuses, ["Orçamento", "Aguardando material", "Produção", "Pronto", "Entregue"]);
  assert.equal(normalizeOrderStatus("Aprovado"), "Aguardando material");
  assert.equal(normalizeOrderStatus("Finalização"), "Produção");
  assert.equal(nextOrderStatus("Orçamento"), "Aguardando material");
  assert.equal(nextOrderStatus("Produção"), "Pronto");
  assert.equal(nextOrderStatus("Pronto"), "Entregue");
  assert.equal(nextOrderStatus("Entregue"), undefined);
});

test("DTF orders round fractional meters in cents and retain customer identity", () => {
  const input: DtfInput = { title: "Estampas", customerId: "legacy-ana", customerName: "Ana", phone: "", lengthCm: 125, widthCm: 58, priceCents: 102, paidCents: 28, dueDate: "2026-11-04", stage: "Em impressão", artworkUrl: "https://example.com/arte", notes: "", photoData: "" };
  validateDtf(input);
  assert.equal(dtfTotal(input), 1.28);
  assert.equal(dtfPending(input), 1);
  assert.equal(dtfForCustomer(input, { id: "new-id", name: "Ána" }), true);
  assert.equal(dtfForCustomer({ ...input, customerId: "" }, { id: "new-id", name: "Ana" }), false);
  assert.equal(dtfOverdue(input, "2026-11-06"), true);
  assert.equal(dtfOverdue({ ...input, stage: "Entregue" }, "2026-11-06"), false);
  assert.throws(() => validateDtf({ ...input, paidCents: 129 }));
  assert.throws(() => validateDtf({ ...input, artworkUrl: "javascript:alert(1)" }));
});

test("quick DTF orders support blank inputs and multiple photos alongside legacy covers", () => {
  const empty: DtfInput = { title: "", customerId: "", customerName: "", phone: "", lengthCm: 0, widthCm: 0, priceCents: 0, paidCents: 0, dueDate: "", stage: "Aguardando arte", artworkUrl: "", notes: "", photoData: "", quantity: 0 };
  validateDtf(empty);
  assert.equal(dtfTitle({ ...empty, id: "123456789" }), "Pedido DTF");
  assert.throws(() => validateDtf({ ...empty, quantity: 1.5 }));
  const cover = "data:image/jpeg;base64,AA==";
  const extra = "data:image/jpeg;base64,BB==";
  assert.deepEqual(dtfPhotos({ photoData: cover }), [cover]);
  assert.deepEqual(dtfPhotos(packDtfPhotos([cover, extra])), [cover, extra]);
  assert.deepEqual(dtfPhotos({ photoData: cover, referencePhotos: '["https://example.com/photo"]' }), [cover]);
  assert.throws(() => packDtfPhotos(Array(9).fill(cover)));
});

test("DTF customer links prefer the names checklist and follow the linked production delivery", () => {
  const customers = [{ id: "ana", name: "ANA", phone: "" }, { id: "jef", name: "Jefersson", phone: "" }];
  const base: Order = { id: "one", customer: "Ana", product: "Camisas", dueDate: "2026-12-04", quantity: 16, total: 0, paid: 0, status: "Produção" };
  const notes: BusinessNote[] = [
    { id: "plain", title: "Nota geral", category: "Clientes", pinned: false, updatedAt: 100, content: documentPrefix + JSON.stringify({ version: 2, status: "active", customerId: "ana", blocks: [] }) },
    { id: "names", title: "Nomes", category: "Produção", pinned: false, updatedAt: 10, content: documentPrefix + JSON.stringify({ version: 2, status: "archive", orderId: "one", blocks: [], productionChecklist: { deadline: "2026-11-20", rows: [{ name: "João" }] } }) },
  ];
  const links = indexDtfCustomerLinks(customers, [base, { ...base, id: "two", dueDate: "2026-11-20" }, { ...base, id: "jef-1", customer: " JEFERSSON ", dueDate: "2026-11-15" }], notes);
  assert.equal(dtfDeadline("2026-01-03"), "2025-12-27");
  assert.deepEqual(links.get("ana"), { noteId: "names", deadline: "2026-11-27", orderId: "one" });
  assert.deepEqual(links.get("jef"), { deadline: "2026-11-08", orderId: "jef-1" });
  assert.equal(indexDtfCustomerLinks(customers, [{ ...base, dueDate: "2026-12-05" }], notes).get("ana")?.deadline, "2026-11-28");
});

test("the DTF deadline alert starts seven days out and stops when requested or delivered", () => {
  const order: Pick<Order, "dtfStatus" | "dueDate" | "status"> = { dtfStatus: "pending", dueDate: "2026-11-13", status: "Produção" };
  assert.equal(dtfAlertDays(order, "2026-11-05"), undefined);
  assert.equal(dtfAlertDays(order, "2026-11-06"), 7);
  assert.equal(dtfAlertDays(order, "2026-11-13"), 0);
  assert.equal(dtfAlertDays(order, "2026-11-14"), -1);
  assert.equal(dtfAlertDays({ ...order, dtfStatus: "requested" }, "2026-11-06"), undefined);
  assert.equal(dtfAlertDays({ ...order, status: "Entregue" }, "2026-11-06"), undefined);
  assert.equal(dtfAlertDays({ ...order, dtfStatus: undefined }, "2026-11-06"), undefined);
});

test("DTF prints preserve separation when their details are edited", () => {
  const print: DtfPrint = { id: "logo-a", title: "Logo", customerId: "", customerName: "Avulso", quantity: 3, photoData: "", separated: false };
  const first = changeDtfPrints(undefined, { type: "add", print });
  const separated = changeDtfPrints(first, { type: "separate", id: print.id, separated: true });
  const edited = changeDtfPrints(separated, { type: "edit", print: { ...print, quantity: 4 } });
  assert.deepEqual(readDtfPrints(edited), [{ ...print, quantity: 4, separated: true }]);
  assert.deepEqual(readDtfPrints(changeDtfPrints(edited, { type: "delete", id: print.id })), []);
  assert.throws(() => changeDtfPrints(undefined, { type: "add", print: { ...print, photoData: "https://example.com/invalid.svg" } }));
});

test("premium finance statuses use actual dates, paid state and monthly recurrence", async () => {
  const { financeStatus, recurrenceLabel, sortedBills } = await import("../app/finance/presentation");
  const make = (date: string) => bill({ id: date, billingType: "once", dueDate: date, settled: false });
  assert.equal(financeStatus(make("2026-11-07"), "2026-11-08", "2026-11").tone, "late");
  assert.equal(financeStatus(make("2026-11-08"), "2026-11-08", "2026-11").label, "Vence hoje");
  assert.equal(financeStatus(make("2026-11-09"), "2026-11-08", "2026-11").label, "Vence amanhã");
  assert.equal(financeStatus(make("2026-11-11"), "2026-11-08", "2026-11").tone, "soon");
  assert.equal(financeStatus(make("2026-11-12"), "2026-11-08", "2026-11").tone, "open");
  assert.equal(financeStatus({ ...make("2026-11-01"), settled: true }, "2026-11-08", "2026-11").tone, "paid");
  assert.equal(financeStatus(make("2026-11-01"), "2026-11-08", "2026-11", true).tone, "open");
  const monthly = bill({ dueDay: 2, lastPaidMonth: "2026-11" });
  assert.equal(financeStatus(monthly, "2026-11-08", "2026-11").tone, "paid");
  assert.equal(financeStatus(monthly, "2026-12-08", "2026-12").tone, "late");
  const installment = bill({ billingType: "installment", totalInstallments: 5, paidInstallments: 1, lastPaidMonth: "2026-11" });
  assert.equal(recurrenceLabel(installment, "2026-11"), "Parcela 1/5");
  assert.equal(recurrenceLabel(installment, "2026-12"), "Parcela 2/5");
  const list = [make("2026-12-01"), make("2026-11-09"), make("2026-11-07")];
  assert.deepEqual(sortedBills(list, "2026-11").map(item => item.id), ["2026-11-07", "2026-11-09", "2026-12-01"]);
  assert.equal(list[0].id, "2026-12-01");
  assert.equal(sortedBills(list, "2026-11", new Set(["2026-11-07"])).at(-1)?.id, "2026-11-07");
});
