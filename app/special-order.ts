import { roundMoney } from "./finance-model";
import type { Order, SpecialOrderKind } from "./order-model";

export function readSpecialOrder(form: FormData, kind: SpecialOrderKind): Pick<Order, "orderKind" | "product" | "quantity" | "total" | "dtfStatus" | "paymentDueDate" | "dueDate"> {
  const collection = kind === "collection";
  const product = String(form.get("product") ?? "").trim();
  const quantity = collection ? 0 : Number(form.get("quantity"));
  const raw = String(form.get("total") ?? "").trim();
  const total = Number(raw);
  const dueDate = collection ? "" : String(form.get("dueDate") ?? "");
  const paymentDueDate = String(form.get("paymentDueDate") ?? "") || null;
  if (!product || product.length > 160) throw new Error("Confira a descrição.");
  if (!Number.isInteger(quantity) || (!collection && quantity < 1) || quantity > 1000000) throw new Error("Confira a quantidade de peças.");
  if (!raw || !Number.isFinite(total) || total < (collection ? .01 : 0) || total > 100000000) throw new Error("Confira o valor total.");
  const isDate = (value: string) => {
    const parsed = new Date(value + "T12:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if ((!collection && !isDate(dueDate)) || (paymentDueDate && !isDate(paymentDueDate))) throw new Error("Confira as datas informadas.");
  return { orderKind: kind, product, quantity, total: roundMoney(total), dtfStatus: "none", paymentDueDate, dueDate };
}
