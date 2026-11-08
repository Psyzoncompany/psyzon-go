import { block, newDraft, serializeDraft, toDraft, type BusinessNote, type StoredNote } from "../notes-model";
import { roundMoney, type Bill } from "../finance-model";
import type { Task } from "./task-model";

export const restockPrefix = "stock-replenishment-";
export type RestockInput = { text: string; amount: number; purchaseDate: string };
export type RestockItem = Task & { amount: number; purchaseDate: string };
export type RestockChange = { type: "edit"; text: string; amount?: number; purchaseDate?: string } | { type: "toggle"; completed: boolean } | { type: "remove" };

export function newRestockNote(input: string | RestockInput): StoredNote {
  const text = typeof input === "string" ? input : input.text;
  const draft = newDraft();
  draft.category = "Compras";
  if (typeof input !== "string") draft.document.restock = validRestockDetails(input);
  const clean = restockText(text);
  draft.title = clean.split("\n")[0].slice(0, 200);
  draft.document.blocks = [{ ...block(clean, "check"), done: false }];
  return serializeDraft(draft);
}

function restockText(text: string) {
  const clean = text.trim();
  if (!clean || clean.length > 2000) throw new Error("Escreva um item de até 2.000 caracteres.");
  return clean;
}

export function restockTasks(notes: BusinessNote[]): RestockItem[] {
  return notes.flatMap(note => {
    if (!note.id.startsWith(restockPrefix)) return [];
    const draft = toDraft(note);
    if (draft.document.status !== "active") return [];
    const checks = draft.document.blocks.filter(item => item.type === "check");
    const title = draft.document.blocks.map(item => item.text).join("\n").trim() || note.title;
    const details = draft.document.restock;
    return [{ amount: Number.isFinite(details?.amount) && details!.amount >= 0 ? roundMoney(details!.amount) : 0, purchaseDate: validDate(details?.purchaseDate ?? "") ? details?.purchaseDate ?? "" : "", id: note.id, title, completed: checks.length > 0 && checks.every(item => item.done), createdAt: note.createdAt, completedAt: note.updatedAt }];
  });
}

export function changeRestockNote(note: BusinessNote, change: RestockChange): StoredNote {
  if (!note.id.startsWith(restockPrefix)) throw new Error("Item de reposição inválido.");
  const draft = toDraft(note);
  if (draft.document.status !== "active") throw new Error("Este item já foi removido ou arquivado.");
  if (change.type === "remove") draft.document.status = "trash";
  else if (change.type === "edit") {
    const clean = restockText(change.text);
    draft.document.restock = validRestockDetails({ amount: change.amount ?? draft.document.restock?.amount ?? 0, purchaseDate: change.purchaseDate ?? draft.document.restock?.purchaseDate ?? "" });
    draft.title = clean.split("\n")[0].slice(0, 200);
    const completed = draft.document.blocks.some(item => item.type === "check") && draft.document.blocks.filter(item => item.type === "check").every(item => item.done);
    draft.document.blocks = [{ ...block(clean, "check"), done: completed }];
  } else {
    const hasCheck = draft.document.blocks.some(item => item.type === "check");
    draft.document.blocks = draft.document.blocks.map((item, index) => item.type === "check" || (!hasCheck && index === 0) ? { ...item, type: "check", done: change.completed } : item);
  }
  return serializeDraft(draft);
}

function validDate(value: string) {
  return value === "" || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);
}
function validRestockDetails(value: { amount: number; purchaseDate: string }) {
  if (!Number.isFinite(value.amount) || value.amount < 0 || value.amount > 100000000 || !validDate(value.purchaseDate)) throw new Error("Confira o valor e a data da compra.");
  return { amount: roundMoney(value.amount), purchaseDate: value.purchaseDate };
}
export function restockBills(items: RestockItem[]): Bill[] {
  return items.filter(item => !item.completed && item.amount > 0).map(item => ({ id: item.id, description: `Reposição · ${item.title.split("\n")[0]}`, amount: item.amount, account: "business", billingType: "once", direction: "payable", dueDay: Number(item.purchaseDate.slice(-2)) || 1, ...(item.purchaseDate ? { dueDate: item.purchaseDate } : {}), settled: false, category: "Reposição de estoque" }));
}
export function restockAlerts(items: RestockItem[], today: string) {
  return items.filter(item => !item.completed && item.purchaseDate && item.purchaseDate <= today).map(item => ({ id: `restock-${item.id}`, title: `Comprar · ${item.title.split("\n")[0]}`, detail: item.purchaseDate < today ? "Compra pendente desde " + item.purchaseDate.split("-").reverse().join("/") : "Compra programada para hoje", tone: item.purchaseDate < today ? "danger" as const : "warning" as const, view: "reposicao" as const }));
}
