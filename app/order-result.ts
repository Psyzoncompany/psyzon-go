import { roundMoney } from "./finance-model";
import type { Order } from "./order-model";
import type { MaterialOrder } from "./notes/materials-model";

type Expense = { id?: string; orderId?: string; type: string; amount: number; source?: string; category?: string };
export type OrderCosts = { purchasedMaterial?: number; plannedMaterial?: number; otherExpenses: number; unreviewedMaterials?: number; expenseFingerprint?: string; expenseMismatch?: boolean };

export function indexOrderCosts(materials: MaterialOrder[], expenses: Expense[]) {
  const byOrder = new Map<string, OrderCosts>();
  const materialExpenses = new Set<string>();
  for (const note of materials) for (const item of note.materials) {
    if (note.purchasedIds?.includes(item.id) && item.actualCost !== undefined) item.linkedExpenseIds?.forEach(id => { if (expenses.some(expense => expense.id === id && expense.orderId === note.productionOrderId && expense.type === "expense" && expense.source !== "customer_refund" && expense.category !== "Costura")) materialExpenses.add(id); });
  }
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
      if (purchased.has(item.id)) {
        costs.purchasedMaterial = (costs.purchasedMaterial ?? 0) + (item.actualCost ?? item.totalCost) + (item.purchaseFreight ?? 0);
        if (item.actualCost === undefined) costs.unreviewedMaterials = (costs.unreviewedMaterials ?? 0) + 1;
        if (item.linkedExpenseIds?.length) {
          const linked = expenses.filter(expense => item.linkedExpenseIds!.includes(expense.id ?? "") && expense.orderId === note.productionOrderId && expense.type === "expense" && expense.source !== "customer_refund" && expense.category !== "Costura");
          const sum = roundMoney(linked.reduce((sum, expense) => sum + expense.amount, 0));
          if (linked.length !== item.linkedExpenseIds.length || sum !== item.linkedExpenseAmount) costs.expenseMismatch = true;
        }
      }
      else costs.plannedMaterial = (costs.plannedMaterial ?? 0) + item.totalCost;
    }
  }
  for (const item of expenses) {
    if (item.orderId && item.type === "expense" && item.source !== "customer_refund" && !materialExpenses.has(item.id ?? "")) get(item.orderId).otherExpenses += item.amount;
  }
  for (const [id, costs] of byOrder) costs.expenseFingerprint = JSON.stringify(expenses.filter(item => item.orderId === id && item.type === "expense" && item.source !== "customer_refund").map(item => [item.id, item.amount]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
  return byOrder;
}

export function orderResult(order: Order, costs: OrderCosts | undefined, sewing: number | undefined) {
  const material = costs?.purchasedMaterial ?? (order.customerMaterial ? 0 : undefined);
  const dtf = order.dtfCost ?? undefined;
  const other = roundMoney((order.otherCost ?? 0) + (costs?.otherExpenses ?? 0));
  const total = roundMoney((material ?? 0) + (sewing ?? 0) + (dtf ?? 0) + other);
  const result = roundMoney(order.total - total);
  const missing = [
    ...(material === undefined ? ["Material comprado sem valor registrado"] : []),
    ...(costs?.unreviewedMaterials ? ["Valor real de material não conferido"] : []),
    ...(costs?.plannedMaterial != null ? ["Compra de material pendente"] : []),
    ...(costs?.expenseMismatch ? ["Pagamento de material alterado após a conferência"] : []),
    ...(sewing === undefined ? ["Custo de costura não definido"] : []),
    ...(dtf === undefined && order.dtfStatus !== "none" ? ["Custo de DTF não informado"] : []),
  ];
  const fingerprint = JSON.stringify([order.quantity, order.total, material ?? null, costs?.plannedMaterial ?? null, costs?.unreviewedMaterials ?? 0, sewing ?? null, dtf ?? null, order.dtfStatus ?? null, other, costs?.expenseFingerprint ?? "[]"]);
  return {
    material, sewing, dtf, other, total, result,
    plannedMaterial: costs?.plannedMaterial,
    receivedAfterCosts: roundMoney(order.paid - total),
    margin: order.total > 0 ? result / order.total * 100 : null,
    missing, fingerprint,
    confirmed: missing.length === 0 && order.costsFingerprint === fingerprint && !!order.costsConfirmedAt,
  };
}
