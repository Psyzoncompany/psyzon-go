import { indexDtfCustomerLinks } from "./dtf-links";
import { customerNameKey, type Customer } from "./finance-model";
import type { DtfOrder } from "./dtf-model";
import { millis, readDocument, type BusinessNote } from "./notes-model";
import type { Order } from "./order-model";

export function notePhotoOrderId(document: { orderId: string; customerId: string }, orders: Pick<Order, "id" | "customer">[], customers: Pick<Customer, "id" | "name">[]) {
  if (document.orderId) return orders.some(order => order.id === document.orderId) ? document.orderId : undefined;
  const customer = customers.find(customer => customer.id === document.customerId);
  const matches = customer ? orders.filter(order => customerNameKey(order.customer) === customerNameKey(customer.name)) : [];
  return matches.length === 1 ? matches[0].id : undefined;
}

// Explicit empty photos mean removal. Only missing legacy values use a fallback.
export function synchronizedOrderPhotos(orders: Order[], notes: BusinessNote[], dtfOrders: DtfOrder[], customers: Customer[]) {
  const links = indexDtfCustomerLinks(customers, orders, notes);
  const legacy = [...notes].sort((a,b) => millis(b.updatedAt) - millis(a.updatedAt));
  return orders.map(order => {
    if (typeof order.photoData === "string") return order;
    const note = legacy.find(note => { const document = readDocument(note.content); return notePhotoOrderId(document, orders, customers) === order.id && document.status !== "trash" && typeof note.productionPhotoData === "string"; });
    const dtf = dtfOrders.find(dtf => links.get(dtf.customerId)?.orderId === order.id && dtf.photoData);
    return { ...order, photoData: note?.productionPhotoData ?? dtf?.photoData ?? "" };
  });
}
