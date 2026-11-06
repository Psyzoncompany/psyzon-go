export type Customer = {
  id: string;
  name: string;
  phone: string;
  company?: string;
  totalAdjustment?: number;
  pendingAdjustment?: number;
  archived?: boolean;
};

export type CustomerOrder = { id?: string; customer: string; phone?: string; total: number; paid: number };
export type CustomerBalance = Customer & { total: number; pending: number; orderCount: number };
export type Bill = {
  id: string;
  description: string;
  amount: number;
  account: "business" | "personal";
  billingType: "fixed" | "installment" | "once";
  direction?: "payable" | "receivable";
  dueDay: number;
  dueDate?: string;
  settled?: boolean;
  category: string;
  totalInstallments?: number;
  paidInstallments?: number;
  lastPaidMonth?: string;
  createdAt?: unknown;
};

export function customerBalances(customers: Customer[], orders: CustomerOrder[]): CustomerBalance[] {
  const map = new Map<string, CustomerBalance>();
  customers.forEach((customer) => {
    const key = customerNameKey(customer.name);
    const previous = map.get(key);
    if (!previous || (previous.archived && !customer.archived)) map.set(key, { ...customer, total: customer.totalAdjustment ?? 0, pending: customer.pendingAdjustment ?? 0, orderCount: 0 });
  });
  orders.forEach((order) => {
    const key = customerNameKey(order.customer);
    const customer = map.get(key) ?? { id: `legacy-${encodeURIComponent(key)}`, name: order.customer, phone: order.phone ?? "", total: 0, pending: 0, orderCount: 0 };
    customer.total += order.total;
    customer.pending += Math.max(0, order.total - order.paid);
    customer.orderCount += 1;
    map.set(key, customer);
  });
  return [...map.values()].map((customer) => ({ ...customer, total: Math.max(0, Math.round(customer.total * 100) / 100), pending: Math.max(0, Math.round(customer.pending * 100) / 100) }));
}

export function customerNameKey(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function financialSummary(customers: CustomerBalance[], bills: Bill[], month = localDateValue().slice(0, 7)) {
  const debtors = customers.filter((customer) => !customer.archived && customer.pending > 0);
  const open = bills.filter((bill) => !billIsSettled(bill, month));
  const payable = open.filter((bill) => bill.direction !== "receivable");
  const receivable = open.filter((bill) => bill.direction === "receivable");
  return { debtors, payable, receivable, pending: roundMoney(debtors.reduce((sum, customer) => sum + customer.pending, 0) + receivable.reduce((sum, bill) => sum + bill.amount, 0)), toPay: roundMoney(payable.reduce((sum, bill) => sum + bill.amount, 0)) };
}

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function orderReceivables(customers: CustomerBalance[], orders: CustomerOrder[]) {
  const remaining = new Map(customers.map((customer) => [customerNameKey(customer.name), customer.archived ? 0 : customer.pending]));
  const result = new Map<string, number>();
  for (const order of orders) {
    const key = customerNameKey(order.customer);
    const amount = roundMoney(Math.min(Math.max(0, remaining.get(key) ?? 0), Math.max(0, order.total - order.paid)));
    if (order.id) result.set(order.id, amount);
    remaining.set(key, roundMoney((remaining.get(key) ?? 0) - amount));
  }
  return result;
}

export function customerReceipt(customer: Customer, orders: CustomerOrder[]) {
  const balance = customerBalances([customer], orders)[0];
  if (!balance || balance.archived || balance.pending <= 0) throw new Error("Este cliente não possui saldo a receber.");
  let remaining = balance.pending;
  const payments: Array<{ orderId: string; amount: number; paid: number }> = [];
  const updated = orders.map((order) => {
    if (!order.id) throw new Error("Pedido sem identificação.");
    const amount = roundMoney(Math.min(remaining, Math.max(0, order.total - order.paid)));
    remaining = roundMoney(remaining - amount);
    if (amount > 0) payments.push({ orderId: order.id, amount, paid: roundMoney(order.paid + amount) });
    return { ...order, paid: roundMoney(order.paid + amount) };
  });
  return { amount: balance.pending, payments, unallocated: remaining, adjustments: customerAdjustments(balance.total, 0, updated) };
}

export function billSettlementAfterEdit(bill: Bill, nextType: Bill["billingType"]) {
  if (bill.billingType === nextType) return {};
  return { paidInstallments: 0, settled: nextType === "once" && billIsSettled(bill) };
}

export function customerAdjustments(total: number, pending: number, orders: CustomerOrder[]) {
  if (![total, pending].every((value) => Number.isFinite(value) && value >= 0 && value <= 100000000) || pending > total) throw new Error("O saldo pendente deve estar entre zero e o total comprado.");
  return {
    totalAdjustment: Math.round((total - orders.reduce((sum, order) => sum + order.total, 0)) * 100) / 100,
    pendingAdjustment: Math.round((pending - orders.reduce((sum, order) => sum + Math.max(0, order.total - order.paid), 0)) * 100) / 100,
  };
}

export function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function billIsSettled(bill: Bill, month = localDateValue().slice(0, 7)) {
  return bill.billingType === "once" ? Boolean(bill.settled)
    : bill.lastPaidMonth === month || (bill.billingType === "installment" && (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1));
}

type BillExpense = { id: string; billId?: string; source?: string; type: string; transactionDate?: string };

export const billPaymentId = (billId: string, period: string) => `bill-${billId}-${period}`;

export function currentBillExpense<T extends BillExpense>(bill: Pick<Bill, "id" | "lastPaidMonth">, transactions: T[]) {
  const linked = transactions.filter(item => item.type === "expense" && item.source === "bill" && item.billId === bill.id);
  const period = bill.lastPaidMonth;
  const monthly = period ? linked.find(item => item.id === billPaymentId(bill.id, period)) : undefined;
  return monthly ?? linked.find(item => item.id === billPaymentId(bill.id, "once") && (!period || item.transactionDate?.slice(0, 7) === period));
}

export function billReversal(bill: Bill, transactions: BillExpense[]) {
  const previous = transactions.flatMap(item => {
    const period = item.transactionDate?.slice(0, 7);
    return item.source === "bill" && item.billId === bill.id && period && /^\d{4}-\d{2}$/.test(period) && bill.lastPaidMonth && period < bill.lastPaidMonth ? [period] : [];
  }).sort().at(-1);
  return { lastPaidMonth: previous, settled: false, ...(bill.billingType === "installment" ? { paidInstallments: Math.max(0, (bill.paidInstallments ?? 0) - 1) } : {}) };
}

export function billDueDate(bill: Bill, month = localDateValue().slice(0, 7)) {
  if (bill.billingType === "once" && bill.dueDate) return bill.dueDate;
  const [year, monthNumber] = month.split("-").map(Number);
  const day = Math.min(bill.dueDay, new Date(year, monthNumber, 0).getDate());
  return `${month}-${String(day).padStart(2, "0")}`;
}
