import { billDueDate, billIsSettled, type Bill } from "../finance-model";

export type FinanceTone = "open" | "soon" | "late" | "paid";
export type FinanceStatus = { tone: FinanceTone; label: string };
export function financeStatus(bill: Bill, today: string, month: string, undated = false): FinanceStatus {
  if (billIsSettled(bill, month)) return { tone: "paid", label: bill.direction === "receivable" ? "Recebida" : "Pago" };
  if (undated) return { tone: "open", label: "Em aberto · sem data" };
  const due = billDueDate(bill, month);
  const days = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  if (days < 0) return { tone: "late", label: `Atrasado há ${Math.abs(days)} dia${days === -1 ? "" : "s"}` };
  if (days === 0) return { tone: "soon", label: "Vence hoje" };
  if (days === 1) return { tone: "soon", label: "Vence amanhã" };
  if (days <= 3) return { tone: "soon", label: `Vence em ${days} dias` };
  return { tone: "open", label: "Em aberto" };
}
export function recurrenceLabel(bill: Bill, month: string) {
  if (bill.billingType === "fixed") return "Mensal";
  if (bill.billingType !== "installment") return "Única";
  const total = bill.totalInstallments ?? 1;
  const number = Math.min(total, (bill.paidInstallments ?? 0) + (billIsSettled(bill, month) ? 0 : 1));
  return `Parcela ${Math.max(1, number)}/${total}`;
}
export function sortedBills(bills: Bill[], month: string, undatedIds = new Set<string>()) {
  return [...bills].sort((a, b) => (undatedIds.has(a.id) ? "9999-12-31" : billDueDate(a, month)).localeCompare(undatedIds.has(b.id) ? "9999-12-31" : billDueDate(b, month)) || a.description.localeCompare(b.description, "pt-BR"));
}
export const financeDate = (value: string) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "Sem data";
