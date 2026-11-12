import { currency, decimal, type NoteDraft, type NoteMaterial } from "../notes-model";
import { extraFabricKg, forecastMaterial } from "../material-forecast";
import { notePhotoOrderId } from "../order-photo-sync";
import { customerNameKey } from "../finance-model";

export type MaterialOrder = {
  id: string;
  productionOrderId?: string;
  purchaseDueDate?: string;
  title: string;
  client: string;
  materials: NoteMaterial[];
  purchasedIds?: string[];
  extraFabricKg?: number;
  additionalFabric?: Array<{ supplier: string; fabric: string; color: string; kg: number }>;
};

export type MaterialLine = {
  orderId: string;
  order: string;
  client: string;
  supplier: string;
  material: string;
  color: string;
  quantity: number;
  unit: "kg" | "conj.";
  price: number;
  cost: number;
};

type MaterialNote = { id: string; draft: NoteDraft; purchasedIds?: string[] };
type LinkedOrder = { id: string; customer: string; quantity?: number; dueDate?: string };
type LinkedCustomer = { id: string; name: string };

export function materialOrdersFromNotes(notes: MaterialNote[], orders: LinkedOrder[], customers: LinkedCustomer[]): MaterialOrder[] {
  const ordersById = new Map(orders.map(order => [order.id, order]));
  const customersById = new Map(customers.map(customer => [customer.id, customer.name]));
  return notes.filter(({ draft }) => draft.materials.length && draft.document.status !== "trash").map(({ id, draft, purchasedIds }) => {
    const { document, materials, title } = draft;
    const linkedId = notePhotoOrderId(document, orders, customers);
    const quantity = linkedId ? ordersById.get(linkedId)?.quantity : undefined;
    const purchased = new Set(purchasedIds);
    return {
      id,
      productionOrderId: linkedId,
      purchaseDueDate: materialPurchaseDeadline(linkedId ? ordersById.get(linkedId)?.dueDate : undefined),
      title: title || "Anotação sem título",
      client: ordersById.get(document.orderId)?.customer || customersById.get(document.customerId) || "",
      materials: materials.map(material => purchased.has(material.id) ? material : forecastMaterial(material, quantity)),
      purchasedIds,
      extraFabricKg: materials.filter(material => purchased.has(material.id)).reduce((sum, material) => sum + extraFabricKg(material, quantity), 0),
      additionalFabric: materials.filter(material => purchased.has(material.id)).flatMap(material => {
        const kg = extraFabricKg(material, quantity);
        return kg >= .005 ? [{ supplier: material.supplier || "Costa Rica", fabric: material.fabricType, color: material.color, kg }] : [];
      }),
    };
  });
}

export function materialPurchaseDeadline(delivery?: string) {
  if (!delivery || !/^\d{4}-\d{2}-\d{2}$/.test(delivery)) return undefined;
  const date = new Date(delivery + "T12:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== delivery) return undefined;
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

export function fabricShoppingList(orders: MaterialOrder[], productionOrders: Array<{ id: string; customer: string; product: string; status?: string }>) {
  const active = new Map(productionOrders.filter(order => order.status && !["Orçamento", "Pronto", "Entregue"].includes(order.status)).map(order => [order.id, order]));
  const groups = new Map<string, { supplier: string; fabric: string; color: string; kg: number; orders: Map<string, { noteId: string; label: string; kg: number }> }>();
  for (const note of orders) {
    const order = active.get(note.productionOrderId ?? "");
    if (!order) continue;
    const purchased = new Set(note.purchasedIds);
    const needs = [
      ...note.materials.filter(material => !purchased.has(material.id)).map(material => ({
        supplier: material.supplier || "Costa Rica", fabric: material.fabricType, color: material.color, kg: material.fabricKg,
      })),
      ...(note.additionalFabric ?? []),
    ];
    for (const { supplier, fabric, color, kg } of needs) {
      if (!(kg > 0)) continue;
      const key = JSON.stringify([supplier, fabric, color].map(customerNameKey));
      const group = groups.get(key) ?? { supplier, fabric, color, kg: 0, orders: new Map() };
      group.kg += kg;
      const previous = group.orders.get(order.id);
      group.orders.set(order.id, { noteId: previous?.noteId ?? note.id, label: `${order.customer} · ${order.product}`, kg: (previous?.kg ?? 0) + kg });
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => a.supplier.localeCompare(b.supplier, "pt-BR") || a.fabric.localeCompare(b.fabric, "pt-BR") || a.color.localeCompare(b.color, "pt-BR"));
}

export function splitMaterialOrders(orders: MaterialOrder[], completed: boolean) {
  return orders.flatMap(order => {
    const purchased = new Set(order.purchasedIds);
    const materials = order.materials.filter(material => purchased.has(material.id) === completed);
    return materials.length ? [{ ...order, materials }] : [];
  });
}

export function updatePurchasedMaterials(materials: Pick<NoteMaterial, "id">[], previous: string[] | undefined, ids: string[], completed: boolean) {
  const selected = new Set(ids);
  const purchased = new Set(previous);
  return [...new Set(materials.map(material => material.id))].filter(id => selected.has(id) ? completed : purchased.has(id));
}

export function materialLines(order: MaterialOrder): MaterialLine[] {
  return order.materials.flatMap(item => {
    const base = { orderId: order.id, order: order.title, client: order.client, supplier: item.supplier || "Costa Rica" };
    const fabric: MaterialLine = { ...base, material: `Malha ${item.fabricType}`, color: item.color, quantity: item.fabricKg, unit: "kg", price: item.fabricPricePerKg ?? (item.fabricKg ? item.fabricCost / item.fabricKg : 0), cost: item.fabricCost };
    const collar: MaterialLine = item.collarType === "polo"
      ? { ...base, material: "Gola polo + punho", color: item.collarColor || item.color, quantity: item.poloUnits, unit: "conj.", price: item.poloPricePerUnit ?? (item.poloUnits ? (item.poloCost ?? item.totalCost - item.fabricCost) / item.poloUnits : 0), cost: item.poloCost ?? item.totalCost - item.fabricCost }
      : { ...base, material: "Ribana", color: item.collarColor || item.color, quantity: item.ribanaKg, unit: "kg", price: item.ribanaPricePerKg, cost: item.ribanaCost };
    return collar.quantity > 0 ? [fabric, collar] : [fabric];
  });
}

export function materialTotals(lines: MaterialLine[]) {
  return lines.reduce((totals, line) => {
    totals[line.unit === "kg" ? "kg" : "sets"] += line.quantity;
    totals.cost += line.cost;
    return totals;
  }, { kg: 0, sets: 0, cost: 0 });
}

export const materialQuantity = (line: MaterialLine) => `${line.unit === "kg" ? decimal(line.quantity) : line.quantity} ${line.unit}`;

export function groupMaterialLines(lines: MaterialLine[]) {
  const groups = new Map<string, MaterialLine[]>();
  for (const line of lines) {
    const group = groups.get(line.supplier);
    if (group) group.push(line);
    else groups.set(line.supplier, [line]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
}

export function materialsText(lines: MaterialLine[], title: string, prices: boolean) {
  const groups = groupMaterialLines(lines);
  return [title.toLocaleUpperCase("pt-BR"), ...groups.flatMap(([supplier, items]) => [
    "", supplier,
    ...items.map(item => `• ${item.material} · ${item.color} · ${materialQuantity(item)}${prices ? ` · ${currency(item.price)}/${item.unit} · ${currency(item.cost)}` : ""} (${item.order}${item.client ? ` / ${item.client}` : ""})`),
    ...(prices ? [`Subtotal: ${currency(materialTotals(items).cost)}`] : []),
  ]), ...(prices ? ["", `TOTAL: ${currency(materialTotals(lines).cost)}`] : [])].join("\n");
}

export function materialsCsv(lines: MaterialLine[], prices: boolean) {
  const cell = (value: string) => `"${(/^\s*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const number = (value: number) => value.toFixed(2).replace(".", ",");
  const rows = [["Pedido", "Cliente", "Fornecedor", "Material", "Cor", "Quantidade", "Unidade", ...(prices ? ["Valor unitário (R$)", "Subtotal (R$)"] : [])],
    ...lines.map(line => [line.order, line.client, line.supplier, line.material, line.color, number(line.quantity), line.unit, ...(prices ? [number(line.price), number(line.cost)] : [])])];
  return "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n");
}
