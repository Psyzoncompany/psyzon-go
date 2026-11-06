import { currency, decimal, type NoteMaterial } from "../notes-model";

export type MaterialOrder = {
  id: string;
  title: string;
  client: string;
  materials: NoteMaterial[];
  purchasedIds?: string[];
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
