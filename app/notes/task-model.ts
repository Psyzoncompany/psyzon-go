import { customerNameKey, type Customer } from "../finance-model";
import type { Order } from "../order-model";

export type Task = { id: string; title: string; completed: boolean; customerId?: string; createdAt?: unknown; completedAt?: unknown };

const nameWords = (value: string) => customerNameKey(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function indexOrderTasks(orders: Pick<Order, "id" | "customer" | "status">[], customers: Pick<Customer, "id" | "name" | "archived">[], tasks: Task[]) {
  const activeByName = new Map<string, string[]>();
  const knownNames = new Set<string>();
  const customersByName = new Map<string, string[]>();
  for (const order of orders) {
    const name = nameWords(order.customer);
    if (!name) continue;
    knownNames.add(name);
    if (order.status === "Orçamento" || order.status === "Entregue") continue;
    const active = activeByName.get(name) ?? [];
    active.push(order.id);
    activeByName.set(name, active);
  }
  for (const customer of customers) {
    const name = nameWords(customer.name);
    if (!name) continue;
    knownNames.add(name);
    if (customer.archived) continue;
    const ids = customersByName.get(name) ?? [];
    ids.push(customer.id);
    customersByName.set(name, ids);
  }
  const ordersByCustomer = new Map<string, string[]>();
  for (const [name, ids] of customersByName) {
    const active = activeByName.get(name);
    if (ids.length === 1 && active) ordersByCustomer.set(ids[0], active);
  }

  const result = new Map<string, Task[]>();
  for (const task of tasks) {
    let orderIds = task.customerId ? ordersByCustomer.get(task.customerId) : undefined;
    if (!task.customerId) {
      // Old tasks can mention the client without storing a link. Only use a unique match.
      const title = ` ${nameWords(task.title)} `;
      const matches = [...knownNames].filter(name => title.includes(` ${name} `));
      const active = matches.length === 1 ? activeByName.get(matches[0]) : undefined;
      if (active?.length === 1 && (customersByName.get(matches[0])?.length ?? 0) < 2) orderIds = active;
    }
    for (const orderId of orderIds ?? []) {
      const linked = result.get(orderId) ?? [];
      linked.push(task);
      result.set(orderId, linked);
    }
  }
  return result;
}
