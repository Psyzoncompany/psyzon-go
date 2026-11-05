export type Customer = {
  id: string;
  name: string;
  phone: string;
  company?: string;
  totalAdjustment?: number;
  pendingAdjustment?: number;
  archived?: boolean;
};

export type CustomerOrder = { customer: string; phone?: string; total: number; paid: number };
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
  customers.forEach((customer) => map.set(customer.name, { ...customer, total: customer.totalAdjustment ?? 0, pending: customer.pendingAdjustment ?? 0, orderCount: 0 }));
  orders.forEach((order) => {
    const customer = map.get(order.customer) ?? { id: `legacy-${encodeURIComponent(order.customer)}`, name: order.customer, phone: order.phone ?? "", total: 0, pending: 0, orderCount: 0 };
    customer.total += order.total;
    customer.pending += Math.max(0, order.total - order.paid);
    customer.orderCount += 1;
    map.set(order.customer, customer);
  });
  return [...map.values()].map((customer) => ({ ...customer, total: Math.max(0, Math.round(customer.total * 100) / 100), pending: Math.max(0, Math.round(customer.pending * 100) / 100) }));
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

export function billDueDate(bill: Bill, month = localDateValue().slice(0, 7)) {
  if (bill.billingType === "once" && bill.dueDate) return bill.dueDate;
  const [year, monthNumber] = month.split("-").map(Number);
  const day = Math.min(bill.dueDay, new Date(year, monthNumber, 0).getDate());
  return `${month}-${String(day).padStart(2, "0")}`;
}
