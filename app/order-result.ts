import { roundMoney } from "./finance-model";
import type { Order } from "./order-model";
import type { MaterialOrder } from "./notes/materials-model";

type Expense = { orderId?: string; type: string; amount: number; source?: string };
export type OrderCosts = { purchasedMaterial?: number; plannedMaterial?: number; otherExpenses: number };

export function indexOrderCosts(materials: MaterialOrder[], expenses: Expense[]) {
  const byOrder = new Map<string, OrderCosts>();
  const get = (id: string): OrderCosts => {
    const costs = byOrder.get(id) ?? { otherExpenses: 0 };
    byOrder.set(id, costs);
    return costs;
  };
  for (const note of materials) {
    if (!note.productionOrderId) continue;
    const costs = get(note.productionOrderId);
    const purchased = new Set(note.purchasedIds);
    for (const item of note.materials) {
      if (purchased.has(item.id)) costs.purchasedMaterial = (costs.purchasedMaterial ?? 0) + item.totalCost;
      else costs.plannedMaterial = (costs.plannedMaterial ?? 0) + item.totalCost;
    }
  }
  for (const item of expenses) {
    if (item.orderId && item.type === "expense" && item.source !== "customer_refund") get(item.orderId).otherExpenses += item.amount;
  }
  return byOrder;
}

export function orderResult(order: Order, costs: OrderCosts | undefined, sewing: number | undefined) {
  const material = costs?.purchasedMaterial;
  const dtf = order.dtfCost ?? undefined;
  const other = roundMoney((order.otherCost ?? 0) + (costs?.otherExpenses ?? 0));
  const total = roundMoney((material ?? 0) + (sewing ?? 0) + (dtf ?? 0) + other);
  const result = roundMoney(order.total - total);
  return {
    material, sewing, dtf, other, total, result,
    plannedMaterial: costs?.plannedMaterial,
    receivedAfterCosts: roundMoney(order.paid - total),
    margin: order.total > 0 ? result / order.total * 100 : null,
  };
}
