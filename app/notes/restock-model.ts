import { block, newDraft, serializeDraft, toDraft, type BusinessNote, type StoredNote } from "../notes-model";
import type { Task } from "./task-model";

export const restockPrefix = "stock-replenishment-";
export type RestockChange = { type: "edit"; text: string } | { type: "toggle"; completed: boolean } | { type: "remove" };

export function newRestockNote(text: string): StoredNote {
  const draft = newDraft();
  draft.category = "Compras";
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

export function restockTasks(notes: BusinessNote[]): Task[] {
  return notes.flatMap(note => {
    if (!note.id.startsWith(restockPrefix)) return [];
    const draft = toDraft(note);
    if (draft.document.status !== "active") return [];
    const checks = draft.document.blocks.filter(item => item.type === "check");
    const title = draft.document.blocks.map(item => item.text).join("\n").trim() || note.title;
    return [{ id: note.id, title, completed: checks.length > 0 && checks.every(item => item.done), createdAt: note.createdAt, completedAt: note.updatedAt }];
  });
}

export function changeRestockNote(note: BusinessNote, change: RestockChange): StoredNote {
  if (!note.id.startsWith(restockPrefix)) throw new Error("Item de reposição inválido.");
  const draft = toDraft(note);
  if (draft.document.status !== "active") throw new Error("Este item já foi removido ou arquivado.");
  if (change.type === "remove") draft.document.status = "trash";
  else if (change.type === "edit") {
    const clean = restockText(change.text);
    draft.title = clean.split("\n")[0].slice(0, 200);
    const completed = draft.document.blocks.some(item => item.type === "check") && draft.document.blocks.filter(item => item.type === "check").every(item => item.done);
    draft.document.blocks = [{ ...block(clean, "check"), done: completed }];
  } else {
    const hasCheck = draft.document.blocks.some(item => item.type === "check");
    draft.document.blocks = draft.document.blocks.map((item, index) => item.type === "check" || (!hasCheck && index === 0) ? { ...item, type: "check", done: change.completed } : item);
  }
  return serializeDraft(draft);
}
