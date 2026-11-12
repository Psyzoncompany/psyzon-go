import type { Order } from "./order-model";
import { readDocument, type BusinessNote } from "./notes-model";
import { notePhotoOrderId } from "./order-photo-sync";
import { dtfForCustomer, readDtfPrints, type DtfOrder } from "./dtf-model";
import { indexDtfCustomerLinks } from "./dtf-links";
import { customerNameKey, type Customer } from "./finance-model";
import { sewingOrderBalances, type SewingLedger } from "./sewing-model";
import { extraFabricKg } from "./material-forecast";
import { decimal } from "./notes-model";

export type OrderAlert = {
  title: string;
  detail: string;
  view: "materiais" | "dtf" | "costureiras";
  id?: string;
};

export function orderAlerts(orders: Order[], notes: BusinessNote[], customers: Customer[], dtfOrders: DtfOrder[], sewing: SewingLedger, money: (value: number) => string) {
  const result = new Map<string, OrderAlert[]>();
  const add = (id: string, alert: OrderAlert) => {
    const list = result.get(id) ?? [];
    list.push(alert);
    result.set(id, list);
  };
  const materials = new Map<string, { total: number; pending: number; extra: number }>();
  const quantities = new Map(orders.map(order => [order.id,order.quantity]));
  for (const note of notes) {
    if (!note.materials?.length) continue;
    const document = readDocument(note.content);
    if (document.status === "trash") continue;
    const id = notePhotoOrderId(document, orders, customers);
    if (!id) continue;
    const counts = materials.get(id) ?? { total: 0, pending: 0, extra: 0 };
    const purchased = new Set(note.purchasedMaterialIds);
    counts.total += note.materials.length;
    counts.pending += note.materials.filter(item => !purchased.has(item.id)).length;
    counts.extra += note.materials.filter(item=>purchased.has(item.id)).reduce((sum,item)=>sum+extraFabricKg(item,quantities.get(id)),0);
    materials.set(id, counts);
  }
  const links = indexDtfCustomerLinks(customers, orders, notes);
  const prints = dtfOrders.map(dtf => ({ dtf, items: [dtf, ...readDtfPrints(dtf.printsData)] }));
  for (const order of orders) {
    if (order.status === "Entregue" || order.status === "Orçamento") continue;
    const material = materials.get(order.id);
    if (material && material.extra >= .005) {
      add(order.id, { title: "Revisar malha adicional", detail: `${decimal(material.extra)} kg de previsão adicional`, view: "materiais" });
    } else if (material?.pending) {
      add(order.id, { title: "Pedir material", detail: `${material.pending} ${material.pending === 1 ? "item pendente" : "itens pendentes"} em Materiais`, view: "materiais" });
    } else if (!material?.total && order.status === "Aguardando material") {
      add(order.id, { title: "Conferir material", detail: "Nenhum material cadastrado para este pedido.", view: "materiais" });
    }
    const client = customers.find(customer => !customer.archived && links.get(customer.id)?.orderId === order.id);
    const destination = client ?? customers.find(customer => !customer.archived && customerNameKey(customer.name) === customerNameKey(order.customer));
    const linked = client ? prints.filter(({ items }) => items.some(item => dtfForCustomer(item, client))) : [];
    if (order.dtfStatus === "pending" && !linked.length) {
      add(order.id, { title: "Pedir estampa DTF", detail: "O pedido está marcado como Precisa pedir DTF.", view: "dtf", id: destination?.id });
    } else if (order.dtfStatus !== "none" && linked.some(({ dtf }) => !["Pronto", "Entregue"].includes(dtf.stage))) {
      add(order.id, { title: "Acompanhar estampa DTF", detail: "Há DTF vinculado aguardando conclusão.", view: "dtf", id: client?.id });
    } else if (client && order.dtfStatus !== "none" && linked.some(({ dtf, items }) => dtf.stage === "Pronto" &&
      items.some(item => dtfForCustomer(item, client) && item.separated !== true))) {
      add(order.id, { title: "Separar estampa DTF", detail: "Há estampas prontas ainda por separar.", view: "dtf", id: client.id });
    }
  }
  for (const person of sewing.people) {
    for (const { order, remaining } of sewingOrderBalances(orders, sewing, person)) {
      if (remaining > 0) add(order.id, { title: "Pagar costureira", detail: `${person} · ${money(remaining)} pendentes`, view: "costureiras" });
    }
  }
  return result;
}
