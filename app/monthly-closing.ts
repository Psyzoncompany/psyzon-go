import { customerBalances, financialSummary, roundMoney, type Bill, type Customer } from "./finance-model";
import { historyDate } from "./history-model";
import type { Order } from "./order-model";
import type { BusinessNote } from "./notes-model";
import { operationCosts } from "./operations-data";
import { orderResult } from "./order-result";
import { sewingBills, sewingEntriesForPeriod, sewingEntryTotals } from "./sewing-model";
import { restockBills, restockTasks } from "./notes/restock-model";

export type ClosingTransaction = { id: string; type: string; account: string; description: string; amount: number; source?: string; orderId?: string; transactionDate?: string; createdAt?: unknown };
export type ClosingData = { orders: Order[]; notes: BusinessNote[]; customers: Customer[]; transactions: ClosingTransaction[]; bills: Bill[] };
export function monthlyClosing(data: ClosingData, month: string, today: string) {
  const { orders, notes, customers, transactions, bills } = data;
  const operations = operationCosts(orders, notes, customers, transactions);
  const movements = transactions.filter(item => item.account === "business" && historyDate(item.transactionDate || item.createdAt).startsWith(month));
  const delivered = orders.filter(order => order.status === "Entregue" && order.deliveredAt?.startsWith(month)).map(order => {
    const result = orderResult(order, operations.costs.get(order.id), operations.sewing.get(order.id));
    return { id: order.id, customer: order.customer, product: order.product, date: order.deliveredAt!, sale: order.total, received: order.paid, costs: result.total, result: result.result, confirmed: result.confirmed, pending: result.missing.length ? result.missing : result.confirmed ? [] : ["Conferência de custos não confirmada"] };
  }).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const purchases = notes.flatMap(note => (note.materials ?? []).filter(item => note.purchasedMaterialIds?.includes(item.id) && item.actualCost !== undefined && item.purchaseDate?.startsWith(month)).map(item => ({
    id: note.id + "/" + item.id, title: item.fabricType + " · " + item.color, supplier: item.supplier, amount: roundMoney(item.actualCost! + (item.purchaseFreight ?? 0)), date: item.purchaseDate!,
  })));
  const missingPurchases = notes.flatMap(note => (note.materials ?? []).filter(item => note.purchasedMaterialIds?.includes(item.id) && (item.actualCost === undefined || !item.purchaseDate)).map(item => ({ title: note.title + " · " + item.fabricType, detail: "Compra sem custo real ou data conferida" })));
  const totals = sewingEntryTotals(sewingEntriesForPeriod(operations.ledger.entries, undefined, month));
  const accounts = financialSummary(customerBalances(customers, orders), [...bills, ...restockBills(restockTasks(notes)), ...sewingBills(orders, operations.ledger)], today.slice(0,7));
  const sum = (values: number[]) => roundMoney(values.reduce((a,b) => a + b, 0));
  const income = movements.filter(item => item.type === "income");
  const refunds = movements.filter(item => item.type === "expense" && item.source === "customer_refund");
  const pending = [
    ...delivered.filter(order => !order.confirmed).map(order => ({ title: order.customer + " · " + order.product, detail: order.pending.join(" · ") })),
    ...missingPurchases,
    ...orders.filter(order => order.status === "Entregue" && !order.deliveredAt).map(order => ({ title: order.customer, detail: "Pedido entregue sem data registrada" })),
  ];
  return {
    month, reviewedOn: today,
    totals: {
      delivered: delivered.length, sales: sum(delivered.map(order => order.sale)),
      received: sum(income.map(item => item.amount)), refunds: sum(refunds.map(item => item.amount)),
      sewingPaid: totals.paid, sewingCreditUsed: totals.offsets,
      purchases: sum(purchases.map(item => item.amount)),
      verifiedResult: sum(delivered.filter(order => order.confirmed).map(order => order.result)),
      unverifiedOrders: delivered.filter(order => !order.confirmed).length,
      payableAtReview: accounts.toPay, receivableAtReview: accounts.pending,
    },
    delivered, purchases,
    sewingPayments: sewingEntriesForPeriod(operations.ledger.entries, undefined, month).filter(item => item.kind === "payment" || item.kind === "offset").map(item => ({ id: item.id, person: item.person, date: item.date, amount: item.amount, kind: item.kind })),
    receipts: income.map(item => ({ id: item.id, description: item.description, amount: item.amount, date: historyDate(item.transactionDate || item.createdAt) })).sort((a,b) => a.id.localeCompare(b.id)),
    pending,
  };
}
export type MonthlyClosingReport = ReturnType<typeof monthlyClosing>;
