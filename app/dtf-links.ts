import { customerNameKey, type Customer } from "./finance-model";
import { documentPrefix, millis, readDocument, type BusinessNote } from "./notes-model";
import type { Order } from "./order-model";

export type DtfCustomerLink = { noteId?: string; deadline?: string; orderId?: string; photoData?: string; checklistQuantity?: number };

export function dtfDeadline(delivery: string) {
  const date = Date.parse(`${delivery}T00:00:00Z`);
  return Number.isFinite(date) ? new Date(date - 7 * 86400000).toISOString().slice(0, 10) : undefined;
}

export function indexDtfCustomerLinks(customers: Customer[], productionOrders: Order[], notes: BusinessNote[]) {
  const byName = new Map(customers.map(customer => [customerNameKey(customer.name), customer.id]));
  const orders = new Map(productionOrders.map(order => [order.id, order]));
  const result = new Map<string, DtfCustomerLink>();

  for (const order of productionOrders) {
    const id = byName.get(customerNameKey(order.customer));
    const deadline = order.status !== "Entregue" ? dtfDeadline(order.dueDate) : undefined;
    if (id && deadline && deadline < (result.get(id)?.deadline ?? "9999")) result.set(id, { deadline });
  }

  const linked = notes.flatMap(note => {
    if (!note.content.startsWith(documentPrefix)) return [];
    const { orderId, customerId, status, productionChecklist } = readDocument(note.content);
    if (status === "trash") return [];
    const order = orders.get(orderId);
    const orderCustomer = order ? byName.get(customerNameKey(order.customer)) : undefined;
    const id = customerId || orderCustomer;
    if (!id) return [];
    return [{ id, note, checklist: Boolean(productionChecklist?.rows?.length), noteDeadline: productionChecklist?.deadline, active: status === "active", order: orderCustomer === id ? order : undefined }];
  }).sort((a, b) => Number(b.checklist) - Number(a.checklist) || Number(b.active) - Number(a.active) || millis(b.note.updatedAt) - millis(a.note.updatedAt));

  for (const { id, note, order, noteDeadline } of linked) {
    const previous = result.get(id);
    if (previous?.noteId) continue;
    const linkedDeadline = order && order.status !== "Entregue" ? dtfDeadline(order.dueDate) : undefined;
    result.set(id, { noteId: note.id, deadline: linkedDeadline ?? previous?.deadline ?? dtfDeadline(noteDeadline ?? "") });
  }
  for (const customer of customers) {
    const previous = result.get(customer.id) ?? {};
    const note = notes.find(note => note.id === previous.noteId);
    const explicit = note ? orders.get(readDocument(note.content).orderId) : undefined;
    const matching = productionOrders.filter(order => customerNameKey(order.customer) === customerNameKey(customer.name));
    const active = matching.filter(order => order.status !== "Entregue");
    const candidates = active.length ? active : matching;
    const order = explicit && customerNameKey(explicit.customer) === customerNameKey(customer.name) ? explicit : candidates.length === 1 ? candidates[0] : undefined;
    if (order) result.set(customer.id, { ...previous, orderId: order.id, ...(typeof order.photoData === "string" ? { photoData: order.photoData } : {}), ...(order.checklistQuantity !== undefined ? { checklistQuantity: order.checklistQuantity } : {}) });
  }
  return result;
}
