import type { ProductionRow } from "./production-checklist";
import type { Order, ShirtType } from "./order-model";

export const poloSurcharge = 15;

export function poloExtra(type: string | undefined, product = "") {
  return (type ? type === "polo" : /\bpolo\b/i.test(product)) ? poloSurcharge : 0;
}

type ShirtMix = Pick<Order, "shirtType" | "poloQuantity" | "quantity"> & { product?: string };
type ShirtPricing = ShirtMix & Pick<Order, "childQuantity" | "childUnitPrice"> & { unitPrice: number };

export function poloPieces(order: ShirtMix) {
  if (order.shirtType === "mixed") return Math.min(order.quantity, Math.max(0, order.poloQuantity ?? 0));
  return poloExtra(order.shirtType, order.product) ? order.quantity : 0;
}

export function readShirtMix(form: FormData): { shirtType: ShirtType; poloQuantity: number | null } {
  const type = form.get("shirtType");
  if (type === "mixed") {
    const quantity = form.get("poloQuantity");
    return { shirtType: type, poloQuantity: quantity === null || quantity === "" ? null : Number(quantity) };
  }
  return { shirtType: type === "polo" ? "polo" : "standard", poloQuantity: null };
}

export function shirtOrderPrice(order: ShirtPricing) {
  const adult = order.unitPrice + poloExtra(order.shirtType, order.product);
  const child = order.childUnitPrice ?? Math.max(0, adult - 5);
  const extra = order.shirtType === "mixed" ? poloPieces(order) * poloSurcharge : 0;
  const base = shirtTotal(adult, order.quantity, order.childQuantity ?? 0, order.childUnitPrice);
  return { adult, child, total: Math.round((base + extra) * 100) / 100 };
}

export function validateShirtOrderPrice(order: ShirtPricing) {
  if (order.shirtType === "mixed" && (order.poloQuantity == null || !Number.isInteger(order.poloQuantity) || order.poloQuantity < 0 || order.poloQuantity > order.quantity))
    throw new Error("Informe quantas peças têm gola polo, dentro da quantidade total.");
  validateShirtPrice(order.unitPrice + poloExtra(order.shirtType, order.product), order.quantity, order.childQuantity ?? 0, order.childUnitPrice);
  if (shirtOrderPrice(order).total > 100000000) throw new Error("Confira o valor total do pedido.");
}
export function suggestedShirtPrice(quantity: number) {
  if (quantity <= 2) return 55;
  if (quantity <= 5) return 50;
  if (quantity <= 20) return 45;
  return 50;
}
export function isChildShirt(row: Pick<ProductionRow, "model" | "size">) {
  if (/infantil|crian|kids|baby/i.test(row.model)) return true;
  const age = row.size.trim().match(/^([0-9]{1,2})\s*(?:anos?)?$/i);
  return !!age && Number(age[1]) <= 16;
}
export function shirtTotal(
  unitPrice: number,
  quantity: number,
  children: number,
  childUnitPrice?: number | null,
) {
  const cents = Math.round(unitPrice * 100);
  return (
    ((quantity - children) * cents + children * (childUnitPrice == null ? Math.max(0, cents - 500) : Math.round(childUnitPrice * 100))) / 100
  );
}
export function validateShirtPrice(
  price: number,
  quantity: number,
  children: number,
  childUnitPrice?: number | null,
) {
  if (
    !Number.isFinite(price) ||
    price < 0 ||
    (childUnitPrice != null && (!Number.isFinite(childUnitPrice) || childUnitPrice < 0 || childUnitPrice > 100000000)) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 1000000 ||
    !Number.isInteger(children) ||
    children < 0 ||
    children > quantity ||
    shirtTotal(price, quantity, children, childUnitPrice) > 100000000
  )
    throw new Error("Confira o preço por camisa e a quantidade infantil.");
}
