import type { ProductionRow } from "./production-checklist";
export function poloExtra(type: string | undefined, product = "") {
  return (type ? type === "polo" : /\bpolo\b/i.test(product)) ? 15 : 0;
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
) {
  const cents = Math.round(unitPrice * 100);
  return (
    ((quantity - children) * cents + children * Math.max(0, cents - 500)) / 100
  );
}
export function validateShirtPrice(
  price: number,
  quantity: number,
  children: number,
) {
  if (
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 1000000 ||
    !Number.isInteger(children) ||
    children < 0 ||
    children > quantity ||
    shirtTotal(price, quantity, children) > 100000000
  )
    throw new Error("Confira o preço por camisa e a quantidade infantil.");
}
