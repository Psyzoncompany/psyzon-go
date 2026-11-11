import { millis, readDocument, type BusinessNote } from "./notes-model";
import { notePhotoOrderId } from "./order-photo-sync";
import type { Customer } from "./finance-model";
import type { Order } from "./order-model";
import { validateProductionChecklist } from "./production-checklist";
import {
  isChildShirt,
  shirtTotal,
  suggestedShirtPrice,
  poloExtra,
} from "./order-pricing";

export function synchronizedOrderQuantities(
  orders: Order[],
  notes: BusinessNote[],
  customers: Pick<Customer, "id" | "name">[],
): Order[] {
  const counts = new Map<string, number>();
  const children = new Map<string, number>();
  const selected = new Set<string>();
  for (const note of [...notes].sort(
    (a, b) => millis(b.updatedAt) - millis(a.updatedAt),
  )) {
    const document = readDocument(note.content);
    if (document.status === "trash" || !document.productionChecklist) continue;
    const orderId = notePhotoOrderId(document, orders, customers);
    if (!orderId || selected.has(orderId)) continue;
    selected.add(orderId);
    if (!document.productionChecklist.rows?.length) continue;
    try {
      const rows = validateProductionChecklist(
        document.productionChecklist,
      ).rows;
      counts.set(orderId, rows.length);
      children.set(orderId, rows.filter(isChildShirt).length);
    } catch {
      /* Invalid legacy checklists cannot replace the registered quantity. */
    }
  }
  return orders.map((order) => {
    const effective = counts.has(order.id)
      ? {
          ...order,
          quantity: counts.get(order.id)!,
          checklistQuantity: counts.get(order.id)!,
          childQuantity: children.get(order.id)!,
          checklistChildQuantity: children.get(order.id)!,
        }
      : order;
    if (effective.unitPrice === undefined) return effective;
    const unitPrice =
      effective.pricingMode === "quantity"
        ? suggestedShirtPrice(effective.quantity)
        : effective.unitPrice;
    return {
      ...effective,
      unitPrice,
      total: shirtTotal(
        unitPrice + poloExtra(effective.shirtType, effective.product),
        effective.quantity,
        Math.min(effective.childQuantity || 0, effective.quantity),
      ),
    };
  });
}
