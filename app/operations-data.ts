import type { Order } from "./order-model";
import type { Customer } from "./finance-model";
import { toDraft, type BusinessNote } from "./notes-model";
import { materialOrdersFromNotes } from "./notes/materials-model";
import { readSewing, sewingNoteId, sewingOrderBalances } from "./sewing-model";
import { restockPrefix } from "./notes/restock-model";
import { indexOrderCosts } from "./order-result";

export function operationCosts(orders: Order[], notes: BusinessNote[], customers: Customer[], transactions: Parameters<typeof indexOrderCosts>[1]) {
  const materials = materialOrdersFromNotes(notes.filter(note => note.materials?.length && note.id !== sewingNoteId && !note.id.startsWith(restockPrefix))
    .map(note => ({ id: note.id, draft: toDraft(note), purchasedIds: note.purchasedMaterialIds })), orders, customers.filter(customer => !customer.archived));
  const ledger = readSewing(notes);
  const sewing = new Map(ledger.people.flatMap(person => sewingOrderBalances(orders, ledger, person).map(row => [row.order.id, row.cost] as const)));
  for (const id of ledger.hiddenOrderIds ?? []) sewing.set(id, 0);
  return { materials, costs: indexOrderCosts(materials, transactions), sewing, ledger };
}
