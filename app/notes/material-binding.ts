import { customerNameKey } from "../finance-model";
import type { NoteMaterial } from "../notes-model";
export type MaterialTarget = { id: string; title: string; orderId: string; customerId: string; materials: NoteMaterial[] };
export type MaterialProductionOrder = { id: string; customer: string; product: string; quantity?: number };
export type MaterialCustomer = { id: string; name: string };
export type MaterialSaveInput = { noteId: string; title: string; orderId: string; customerId: string; material?: NoteMaterial };

export function materialBinding(orderId: string, customerId: string, orders: MaterialProductionOrder[], customers: MaterialCustomer[]) {
  const order = orders.find(order => order.id === orderId);
  const customer = customers.find(customer => customer.id === customerId);
  if (orderId && !order) throw new Error("O pedido foi removido. Selecione outro pedido.");
  if (customerId && !customer) throw new Error("O cliente foi removido. Selecione outro cliente.");
  if (order && customer && customerNameKey(order.customer) !== customerNameKey(customer.name)) throw new Error("O pedido pertence a outro cliente. Confira o vínculo.");
  return { orderId: order?.id ?? "", customerId: customer?.id ?? (order ? customers.find(customer => customerNameKey(customer.name) === customerNameKey(order.customer))?.id ?? "" : "") };
}
