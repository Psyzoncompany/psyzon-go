import { millis, readDocument, type BusinessNote } from "./notes-model";
import { notePhotoOrderId } from "./order-photo-sync";
import type { Customer } from "./finance-model";
import type { Order } from "./order-model";
import { validateProductionChecklist, type ProductionChecklist } from "./production-checklist";
import {
  isChildShirt,
  poloPieces,
  shirtOrderPrice,
  suggestedShirtPrice,
} from "./order-pricing";

export function synchronizedOrderQuantities(
  orders: Order[],
  notes: BusinessNote[],
  customers: Pick<Customer, "id" | "name">[],
): Order[] {
  const counts = new Map<string, number>();
  const children = new Map<string, number>();
  const collars = new Map<string, ProductionChecklist>();
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
      const checklist = validateProductionChecklist(
        document.productionChecklist,
      );
      const rows = checklist.rows;
      counts.set(orderId, rows.length);
      children.set(orderId, rows.filter(isChildShirt).length);
      if (checklist.defaultCollar || rows.some(row => row.collar)) collars.set(orderId, checklist);
    } catch {
      /* Invalid legacy checklists cannot replace the registered quantity. */
    }
  }
  return orders.map((order) => {
    if (order.orderKind === "collection") return order;
    const { checklistPoloQuantity: _previousCollars, ...registered } = order;
    const checklist = collars.get(order.id);
    const fallbackPolos = poloPieces({ ...order, quantity: counts.get(order.id) ?? order.quantity });
    const checklistPoloQuantity = checklist?.rows.filter((row, index) =>
      (row.collar ?? checklist.defaultCollar ?? (index < fallbackPolos ? "polo" : "common")) === "polo").length;
    const effective = counts.has(order.id)
      ? {
          ...registered,
          quantity: counts.get(order.id)!,
          checklistQuantity: counts.get(order.id)!,
          childQuantity: children.get(order.id)!,
          checklistChildQuantity: children.get(order.id)!,
          ...(checklistPoloQuantity !== undefined ? { checklistPoloQuantity } : {}),
        }
      : registered;
    if (effective.orderKind || effective.unitPrice === undefined) return effective;
    const unitPrice =
      effective.pricingMode === "quantity"
        ? suggestedShirtPrice(effective.quantity)
        : effective.unitPrice;
    return {
      ...effective,
      unitPrice,
      total: shirtOrderPrice({ ...effective, unitPrice, childQuantity: Math.min(effective.childQuantity || 0, effective.quantity) }).total,
    };
  });
}
