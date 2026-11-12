import { billDueDate, customerBalances, customerNameKey, financialSummary, roundMoney, type Bill, type Customer } from "../../finance-model";
import { sortedBills } from "../../finance/presentation";
import type { Order } from "../../order-model";
import type { AIFinanceReport } from "../../ai/types";

export function openFinanceReport(orders: Order[], customers: Customer[], bills: Bill[], derivedBills: Bill[], date: string, query = ""): AIFinanceReport {
  const month = date.slice(0, 7);
  const { debtors, payable, receivable } = financialSummary(customerBalances(customers, orders), [...bills, ...derivedBills], month);
  const undated = new Set(derivedBills.filter(bill => !bill.dueDate).map(bill => bill.id));
  const search = customerNameKey(query);
  const matching = (value: string) => customerNameKey(value).includes(search);
  const entries = (items: Bill[]) => sortedBills(items.filter(bill => matching(`${bill.description} ${bill.category}`)), month, undated)
    .map(bill => ({
      id: bill.id,
      description: bill.description,
      dueDate: undated.has(bill.id) ? null : billDueDate(bill, month),
      amount: bill.amount,
      category: bill.account === "personal" ? `${bill.category} · Pessoal` : bill.category,
    }));
  const payables = entries(payable);
  const receivables = [...entries(receivable), ...debtors.filter(customer => matching(customer.name))
    .sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name, "pt-BR"))
    .map(customer => ({ id: `customer-${customer.id}`, description: customer.name, dueDate: null, amount: customer.pending, category: "Saldo do cliente" }))];
  const total = (items: typeof payables) => roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  return {
    asOf: date,
    overdueTotal: total(payables.filter(item => item.dueDate && item.dueDate < date)),
    totalPayables: total(payables),
    totalReceivables: total(receivables),
    payableCount: payables.length,
    receivableCount: receivables.length,
    payables: payables.slice(0, 25),
    receivables: receivables.slice(0, 25),
  };
}
