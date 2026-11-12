import { roundMoney } from "./finance-model";
import { historyDate } from "./history-model";
import type { Task } from "./notes/task-model";
import type { OrderAlert } from "./order-alerts";
import type { Order } from "./order-model";

type PaymentRecord = { id: string; orderId?: string; type: string; amount: number; source?: string; transactionDate?: string; createdAt?: unknown };
export type OrderPayment = { id: string; date: string; amount: number; refund: boolean };

export function indexOrderPayments(records: PaymentRecord[]) {
  const byOrder = new Map<string, OrderPayment[]>();
  for (const record of records) {
    const refund = record.type === "expense" && record.source === "customer_refund";
    if (!record.orderId || (record.type !== "income" && !refund) || record.amount <= 0) continue;
    const entries = byOrder.get(record.orderId) ?? [];
    entries.push({ id: record.id, date: historyDate(record.transactionDate || record.createdAt), amount: record.amount, refund });
    byOrder.set(record.orderId, entries);
  }
  for (const entries of byOrder.values()) entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return byOrder;
}

export function nextOrderAction(order: Order, alerts: OrderAlert[], tasks: Task[]) {
  if (order.status === "Orçamento") return;
  const pending = roundMoney(order.receivable ?? Math.max(0, order.total - order.paid));
  if (order.status === "Entregue") return pending > 0 ? { title: "Cobrar saldo", view: "financeiro" as const, pending } : undefined;
  const production = alerts.find(alert => alert.view === "materiais") ?? alerts.find(alert => alert.view === "dtf");
  if (production) return production;
  const task = tasks.find(item => !item.completed);
  if (task) return { title: task.title, view: "afazeres" as const };
  if (order.status === "Pronto" && pending > 0)
    return { title: "Cobrar saldo", view: "financeiro" as const, pending };
  const sewing = alerts.find(alert => alert.view === "costureiras");
  if (sewing) return sewing;
  return { title: order.status === "Pronto" ? "Combinar entrega" : "Acompanhar produção", view: "producao" as const };
}
