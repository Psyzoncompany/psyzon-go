export const productionStages = ["Orçamento", "Aguardando material", "Produção", "Pronto"] as const;
export const orderStatuses = [...productionStages, "Entregue"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

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
  total: number;
  paid: number;
  receivable?: number;
  dueDate: string;
  status: OrderStatus;
  notes?: string;
  photoData?: string;
  createdAt?: unknown;
};

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
