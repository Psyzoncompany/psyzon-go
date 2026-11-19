import { billDueDate, billIsSettled, type Bill } from "./finance-model";
import { restockAlerts, type RestockItem } from "./notes/restock-model";
import { dtfAlertDays, dueLabel, type Order } from "./order-model";
import type { ReminderAttentionItem } from "./notification-content";
import type { View } from "./useViewHistory";

export type AppNotification = ReminderAttentionItem & {
  id: string;
  tone: "danger" | "warning" | "info";
  view: View;
  orderId?: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function pendingNotifications(orders: Order[], bills: Bill[], stockItems: RestockItem[], day: string) {
  const today = new Date(`${day}T12:00:00`);
  const todayTime = Date.parse(`${day}T00:00:00Z`);
  const month = day.slice(0, 7);
  const items: AppNotification[] = [];

  orders.forEach((order) => {
    if (order.orderKind === "collection" || order.status === "Entregue" || order.status === "Orçamento") return;
    const dtfDays = dtfAlertDays(order, day);
    if (dtfDays !== undefined) items.push({ id: `dtf-${order.id}`, orderId: order.id, title: `Pedir DTF · ${order.customer}`, detail: `${order.product} · ${dueLabel(order.dueDate, order.status, today)}`, tone: dtfDays <= 0 ? "danger" : "warning", view: "producao" });
    const due = Date.parse(`${order.dueDate}T00:00:00Z`);
    const days = (due - todayTime) / 86400000;
    if (days <= 2) items.push({
      id: `order-${order.id}`,
      orderId: order.id,
      title: days < 0 ? `Pedido atrasado · ${order.customer}` : days === 0 ? `Entrega hoje · ${order.customer}` : `Entrega próxima · ${order.customer}`,
      detail: `${order.product} · ${dueLabel(order.dueDate, order.status, today)}`,
      tone: days < 0 ? "danger" : "warning",
      view: "producao",
    });
  });

  bills.forEach((bill) => {
    if (billIsSettled(bill, month)) return;
    const dueDate = billDueDate(bill, month);
    const days = (Date.parse(`${dueDate}T00:00:00Z`) - todayTime) / 86400000;
    const action = bill.direction === "receivable" ? "a receber" : "a pagar";
    if (days <= 3) {
      const timing = days < 0 ? "em atraso" : days === 0 ? "vence hoje" : "vence em breve";
      const systemDetail = `${timing.charAt(0).toUpperCase()}${timing.slice(1)} · ${dueDate.slice(8, 10)}/${dueDate.slice(5, 7)}`;
      items.push({
        id: `bill-${bill.id}`,
        title: `${bill.description} · ${action}`,
        detail: `${money.format(bill.amount)} · ${systemDetail}`,
        systemDetail,
        tone: days < 0 ? "danger" : "warning",
        view: "financeiro",
      });
    }
  });

  items.push(...restockAlerts(stockItems, day));
  return items.sort((a, b) => (a.tone === "danger" ? -1 : 1) - (b.tone === "danger" ? -1 : 1));
}
