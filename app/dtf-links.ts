import { customerNameKey, type Customer } from "./finance-model";
import { documentPrefix, millis, readDocument, type BusinessNote } from "./notes-model";
import type { Order } from "./order-model";
import { dtfForCustomer, readDtfPrints, type DtfOrder } from "./dtf-model";

export type DtfCustomerLink = { noteId?: string; deadline?: string; orderId?: string; photoData?: string; checklistQuantity?: number };

export function dtfDeadline(delivery: string) {
  const date = Date.parse(`${delivery}T00:00:00Z`);
  return Number.isFinite(date) ? new Date(date - 7 * 86400000).toISOString().slice(0, 10) : undefined;
}

const productionDtfPrefix = "production-";
export const productionDtfId = (orderId: string) => productionDtfPrefix + orderId;
export const dtfSourceOrderId = (dtfId: string) => dtfId.startsWith(productionDtfPrefix) ? dtfId.slice(productionDtfPrefix.length) : "";

export function dtfCanBeQueued(order: Order) {
  return !order.orderKind && order.dtfStatus === "pending" && order.status !== "Orçamento" && order.status !== "Entregue";
}

export function missingProductionDtf(orders: Order[], customers: Customer[], notes: BusinessNote[], saved: DtfOrder[]): DtfOrder[] {
  const savedIds = new Set(saved.map(order => order.id));
  const missing = orders.filter(order => dtfCanBeQueued(order) && !savedIds.has(productionDtfId(order.id)));
  if (!missing.length) return [];
  const links = indexDtfCustomerLinks(customers, orders, notes);
  const activeByCustomer = new Map<string, number>();
  for (const order of orders) {
    if (order.orderKind || order.status === "Orçamento" || order.status === "Entregue") continue;
    const key = customerNameKey(order.customer);
    activeByCustomer.set(key, (activeByCustomer.get(key) ?? 0) + 1);
  }
  return missing.flatMap(order => {
    const id = productionDtfId(order.id);
    const key = customerNameKey(order.customer);
    const customer = customers.find(item => customerNameKey(item.name) === key);
    if (customer && saved.some(dtf => !dtfSourceOrderId(dtf.id) && [dtf, ...readDtfPrints(dtf.printsData)].some(item =>
      dtfForCustomer(item, customer) && (customerNameKey(item.title) === customerNameKey(order.product) ||
        (dtf.stage !== "Entregue" && activeByCustomer.get(key) === 1 && links.get(customer.id)?.orderId === order.id))))) return [];
    return [{
      id, title: order.product.trim().slice(0, 160), customerId: customer?.id ?? `legacy-${encodeURIComponent(key)}`, customerName: order.customer.slice(0, 120),
      phone: (order.phone || customer?.phone || "").slice(0, 40), dueDate: dtfDeadline(order.dueDate) ?? "",
      stage: "Aguardando arte", quantity: Math.min(order.quantity, 10000), lengthCm: 0, widthCm: 0,
      priceCents: 0, paidCents: 0, artworkUrl: "", notes: "", photoData: "",
    }];
  });
}

export function indexDtfCustomerLinks(customers: Customer[], productionOrders: Order[], notes: BusinessNote[]) {
  const byName = new Map(customers.map(customer => [customerNameKey(customer.name), customer.id]));
  const specialIds = new Set(productionOrders.filter(order => order.orderKind).map(order => order.id));
  const eligible = productionOrders.filter(order => !order.orderKind);
  const orders = new Map(eligible.map(order => [order.id, order]));
  const result = new Map<string, DtfCustomerLink>();

  for (const order of eligible) {
    const id = byName.get(customerNameKey(order.customer));
    const deadline = order.status !== "Entregue" ? dtfDeadline(order.dueDate) : undefined;
    if (id && deadline && deadline < (result.get(id)?.deadline ?? "9999")) result.set(id, { deadline });
  }

  const linked = notes.flatMap(note => {
    if (!note.content.startsWith(documentPrefix)) return [];
    const { orderId, customerId, status, productionChecklist } = readDocument(note.content);
    if (status === "trash" || specialIds.has(orderId)) return [];
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
    const matching = eligible.filter(order => customerNameKey(order.customer) === customerNameKey(customer.name));
    const active = matching.filter(order => order.status !== "Entregue");
    const candidates = active.length ? active : matching;
    const order = explicit && customerNameKey(explicit.customer) === customerNameKey(customer.name) ? explicit : candidates.length === 1 ? candidates[0] : undefined;
    if (order) result.set(customer.id, { ...previous, orderId: order.id, ...(typeof order.photoData === "string" ? { photoData: order.photoData } : {}), ...(order.checklistQuantity !== undefined ? { checklistQuantity: order.checklistQuantity } : {}) });
  }
  return result;
}
