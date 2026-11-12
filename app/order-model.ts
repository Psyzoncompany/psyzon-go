export const productionStages = ["Orçamento", "Aguardando material", "Produção", "Pronto"] as const;
export const orderStatuses = [...productionStages, "Entregue"] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderDtfStatus = { none: "Não precisa de DTF", pending: "Precisa pedir DTF", requested: "DTF já pedido" } as const;
export type OrderDtfStatus = keyof typeof orderDtfStatus;

export function normalizeOrderStatus(status: unknown): OrderStatus {
  if (status === "Aprovado") return "Aguardando material";
  if (status === "Finalização") return "Produção";
  return orderStatuses.find(stage => stage === status) ?? "Orçamento";
}

export function nextOrderStatus(status: OrderStatus): OrderStatus | undefined {
  return orderStatuses[orderStatuses.indexOf(status) + 1];
}

export type Order = {
  id: string;
  customer: string;
  phone?: string;
  product: string;
  quantity: number;
  unitPrice?: number;
  childUnitPrice?: number | null;
  dtfCost?: number | null;
  otherCost?: number | null;
  pricingMode?: "quantity" | "manual";
  shirtType?: "standard" | "polo";
  childQuantity?: number;
  checklistChildQuantity?: number;
  checklistQuantity?: number;
  total: number;
  paid: number;
  receivable?: number;
  dueDate: string;
  status: OrderStatus;
  notes?: string;
  photoData?: string;
  dtfStatus?: OrderDtfStatus;
  createdAt?: unknown;
  deliveredAt?: string | null;
  paymentDueDate?: string | null;
  lastChargedAt?: string | null;
  costsConfirmedAt?: string | null;
  costsFingerprint?: string | null;
  customerMaterial?: boolean;
};

export function dtfAlertDays(order: Pick<Order, "dtfStatus" | "dueDate" | "status">, today: string) {
  if (order.dtfStatus !== "pending" || order.status === "Entregue") return undefined;
  const days = (Date.parse(`${order.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return Number.isFinite(days) && days <= 7 ? days : undefined;
}

export function dueLabel(dateString: string, status: OrderStatus, today = new Date()) {
  if (status === "Entregue") return "Entregue";
  const day = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const due = Date.parse(`${dateString}T00:00:00Z`);
  if (!Number.isFinite(due)) return "Sem prazo";
  const days = (due - day) / 86400000;
  if (days < 0) return `Atrasado ${Math.abs(days)} ${days === -1 ? "dia" : "dias"}`;
  if (days === 0) return "Entrega hoje";
  if (days === 1) return "Entrega amanhã";
  return `Entrega em ${days} dias`;
}

export function dueTone(dateString: string, status: OrderStatus, today?: Date) {
  const label = dueLabel(dateString, status, today);
  if (label.startsWith("Atrasado")) return "danger";
  return label === "Entrega hoje" || label === "Entrega amanhã" ? "warning" : "normal";
}

export function urgentOrder(order: Pick<Order,"dueDate"|"status">, today: string) {
  const days=(Date.parse(order.dueDate)-Date.parse(today))/86400000;
  return order.status!=="Entregue" && days<=2;
}
