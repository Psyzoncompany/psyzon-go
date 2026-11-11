import assert from "node:assert/strict";
import { materialBinding } from "../app/notes/material-binding";

import test from "node:test";
import { block, calculateMaterial, exportNote, newDraft, readDocument, recalculateMaterial, serializeDraft, toDraft, type NoteMaterial } from "../app/notes-model";
import { NoteSaveQueue } from "../app/notes-save-queue";
import { parseProductionOrder, sampleProductionOrder } from "../app/production-checklist";
import { materialLines, materialsCsv, materialsText, materialTotals, splitMaterialOrders, updatePurchasedMaterials } from "../app/notes/materials-model";
import { indexOrderTasks } from "../app/notes/task-model";

test("order task checklists resolve customer links and only unambiguous legacy titles", () => {
  const order = { id: "jer", customer: "JERFESSON", status: "Produção" as const };
  const customers = [{ id: "j", name: "Jerfésson" }, { id: "b", name: "Bia" }];
  const linked = { id: "linked", title: "Conferir estampa", customerId: "j", completed: true };
  const legacy = { id: "legacy", title: "Cortar camisas (Jerfésson)", completed: false };
  const tasks = [linked, legacy,
    { id: "other", title: "Estampa Jerfesson", customerId: "b", completed: false },
    { id: "multiple", title: "Separar Jerfesson e Bia", completed: false },
    { id: "partial", title: "Jerfessoniano", completed: false },
  ];
  const quote = { ...order, id: "quote", status: "Orçamento" as const };
  const delivered = { ...order, id: "delivered", status: "Entregue" as const };
  assert.deepEqual(indexOrderTasks([order, quote, delivered], customers, tasks), new Map([[order.id, [linked, legacy]]]));
  const second = { ...order, id: "second" };
  assert.deepEqual(indexOrderTasks([order, second], customers, tasks), new Map([[order.id, [linked]], [second.id, [linked]]]));
  assert.equal(indexOrderTasks([order], [...customers, { id: "duplicate", name: "Jerfesson" }], tasks).size, 0);
});

test("material links derive the order customer and reject missing or conflicting identities", () => {
  const orders = [{id:"one",customer:"ANA",product:"Camisas"}];
  const customers = [{id:"ana",name:"Ana"},{id:"bia",name:"Bia"}];
  assert.deepEqual(materialBinding("one","",orders,customers),{orderId:"one",customerId:"ana"});
  assert.deepEqual(materialBinding("","bia",orders,customers),{orderId:"",customerId:"bia"});
  assert.throws(()=>materialBinding("one","bia",orders,customers),/outro cliente/);
  assert.throws(()=>materialBinding("missing","",orders,customers),/removido/);
  assert.throws(()=>materialBinding("","missing",orders,customers),/removido/);
});
test("production checklists survive queued saves, archive and restore without dropping text", () => {
  const draft = newDraft("JERFESSON");
  draft.document.blocks = [block("Conferir tecido antes do corte.")];
  draft.document.productionChecklist = parseProductionOrder(sampleProductionOrder);
  draft.document.productionChecklist.rows[0].done = true;
  draft.document.status = "archive";
  const saved = serializeDraft(draft);
  const restored = toDraft({ id: "jerfesson", ...saved });
  assert.deepEqual(restored, draft);
  assert.equal(restored.document.productionChecklist?.rows.length, 16);
  assert.equal(restored.document.productionChecklist?.rows[0].done, true);
  assert.equal(restored.document.blocks[0].text, "Conferir tecido antes do corte.");
});

test("product photos persist separately from checklist text and can be removed", () => {
  const draft = newDraft("Pedido com foto");
  draft.document.productionChecklist = parseProductionOrder(sampleProductionOrder);
  draft.productionPhotoData = "data:image/jpeg;base64," + "A".repeat(120000);
  const saved = serializeDraft(draft);
  assert.ok(saved.content.length < 100000);
  assert.equal(saved.productionPhotoData, draft.productionPhotoData);
  const restored = toDraft({ id: "photo-note", ...saved });
  assert.equal(restored.productionPhotoData, draft.productionPhotoData);
  assert.equal(restored.document.productionChecklist?.rows.length, 16);
  restored.productionPhotoData = "";
  assert.equal(serializeDraft(restored).productionPhotoData, "");
});

const material: NoteMaterial = { id: "pv-1", supplier: "Atual Têxtil", fabricType: "PV", color: "Azul celeste", collarColor: "Branco", fabricKg: 3.93, fabricCost: 172.527, collarType: "common", ribanaKg: .2, ribanaCost: 10.6, ribanaPricePerKg: 53, poloUnits: 0, totalCost: 183.127 };
test("completing a materials order covers only the items checked and leaves new materials pending", () => {
  const next = { ...material, id: "pv-2" };
  const orders = [{ id: "note", title: "Compra", client: "Ana", materials: [material, next], purchasedIds: updatePurchasedMaterials([material, next], ["deleted"], [material.id], true) }];
  assert.deepEqual(orders[0].purchasedIds, [material.id]);
  assert.deepEqual(splitMaterialOrders(orders, false)[0].materials, [next]);
  assert.deepEqual(splitMaterialOrders(orders, true)[0].materials, [material]);
  assert.deepEqual(updatePurchasedMaterials([material, next], orders[0].purchasedIds, [material.id], false), []);
});

test("the materials report separates kilos and polo sets and safely exports prices", () => {
  const polo: NoteMaterial = { ...material, id: "polo", collarType: "polo", poloUnits: 10, poloPricePerUnit: 2.5, poloCost: 25, supplier: "Costa Rica" };
  const lines = materialLines({ id: "note", title: '=SUM(1,2) "quoted"', client: "Ana", materials: [material, polo] });
  const totals = materialTotals(lines);
  assert.equal(totals.kg, 8.06);
  assert.equal(totals.sets, 10);
  assert.equal(totals.cost.toFixed(2), "380.65");
  assert.match(materialsText(lines, "Materiais", true), /Gola polo \+ punho · Branco · 10 conj\./);
  assert.doesNotMatch(materialsText(lines, "Materiais", false), /R\$/);
  assert.match(materialsCsv(lines, true), /"'=SUM\(1,2\) ""quoted"""/);
  assert.match(materialsCsv(lines, true), /"3,93";"kg";"43,90"/);
  assert.doesNotMatch(materialsCsv(lines, false), /Valor unitário/);
});
test("legacy migration preserves notes, checklists and stored financial precision", () => {
  const note = { id: "old", title: "Compra", category: "Compras" as const, pinned: true, materials: [material], content: "Confirmar preço e valor do frete com João.\n\n🧵 MATERIAL 1\n🏭 Fornecedor: Atual Têxtil\n\n🟢 Malha PV – Azul celeste\n⚖️ Quantidade: 3,93 kg\n\n🟩 Ribana – Branco\n⚖️ Quantidade: 0,20 kg\n\n💰 Custo total do material: R$ 183,13\nObservação extra: conferir lote!\n☐ Conferir entrega" };
  const draft = toDraft(note);
  assert.deepEqual(draft.materials[0], material);
  assert.equal(draft.document.blocks.filter(b => b.type === "check").length, 1);
  const exported = exportNote(draft, { prices: false });
  assert.match(exported, /Confirmar preço e valor do frete com João/);
  assert.match(exported, /Observação extra: conferir lote!/);
  assert.doesNotMatch(exported, /R\$/);
  assert.match(exported, /Ribana — Branco/);
  const saved = serializeDraft(draft);
  assert.deepEqual(toDraft({ id: "old", ...saved }), draft);
  assert.equal(saved.materials[0].totalCost, 183.127);
});
test("document actions round trip without extra Firestore fields and invalid JSON is retained", () => {
  const draft = newDraft("Notas"); draft.document.status = "trash"; draft.document.orderId = "order-1";
  draft.document.blocks = [{ ...block("Confirmar valor do frete", "check"), done: true, bold: true }];
  const saved = serializeDraft(draft);
  assert.deepEqual(Object.keys(saved).sort(), ["title", "content", "category", "pinned", "materials"].sort());
  assert.deepEqual(readDocument(saved.content), draft.document);
  const corrupt = "psyzon-note@2\n{invalid";
  assert.equal(readDocument(corrupt).blocks.map(b => b.text).join("\n"), corrupt);
});
test("exports isolate suppliers and only suppress structured prices", () => {
  const draft = newDraft("Pedido"); draft.document.blocks = [block("Valor do frete a combinar. Preço sujeito à confirmação.")];
  draft.materials = [material, { ...material, id: "pv-2", supplier: "Costa Rica", totalCost: 100 }];
  const noPrices = exportNote(draft, { prices: false });
  assert.match(noPrices, /Valor do frete a combinar/); assert.match(noPrices, /Preço sujeito/); assert.doesNotMatch(noPrices, /R\$/);
  const supplierOnly = exportNote(draft, { prices: true, supplier: "Costa Rica" });
  assert.match(supplierOnly, /Costa Rica/); assert.doesNotMatch(supplierOnly, /Atual Têxtil/); assert.match(supplierOnly, /100,00/); assert.doesNotMatch(supplierOnly, /frete/);
});
test("yield, losses, ribana and polo calculations use supplied profiles", () => {
  const base = { mode: "pieces" as const, quantity: 100, yieldPerKg: 4, waste: 20, ribanaPercent: 8, fabricPrice: 40, ribanaPrice: 50, poloPrice: 3, collarType: "common" as const };
  const result = calculateMaterial(base);
  assert.equal(result.kg, 31.25); assert.equal(result.ribanaKg, 2.5); assert.equal(result.total, 1375); assert.equal(result.perPiece, 13.75);
  const polo = calculateMaterial({ ...base, collarType: "polo", poloQuantity: 95 });
  assert.equal(polo.ribanaKg, 0); assert.equal(polo.poloCost, 285); assert.equal(polo.total, 1535);
  const stock = calculateMaterial({ ...base, mode: "kg", quantity: 10 }); assert.equal(stock.pieces, 32);
  assert.throws(() => calculateMaterial({ ...base, quantity: 2.5 })); assert.throws(() => calculateMaterial({ ...base, yieldPerKg: 0 })); assert.throws(() => calculateMaterial({ ...base, waste: 100 }));
});
test("material edits retain unit price and recalculate both collar types", () => {
  const edited = recalculateMaterial({ ...material, fabricPricePerKg: 43.9, fabricKg: 10, ribanaKg: .5 });
  assert.equal(edited.totalCost, 465.5);
  const polo = recalculateMaterial({ ...edited, collarType: "polo", poloUnits: 10, poloPricePerUnit: 2.5 }); assert.equal(polo.totalCost, 464);
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
test("save queue serializes overlapping edits and flushes pending work when leaving the editor", async () => {
  const first = deferred(), writes: string[] = [], recovery = new Map<string, string>();
  const q = new NoteSaveQueue<string>(async (_id, value) => { writes.push(value); if (value === "old") await first.promise; }, (id, value) => { if (value === null) recovery.delete(id); else recovery.set(id, value); }, () => {}, 10000);
  q.stage("a", "old"); const running = q.flush("a");
  q.stage("a", "latest"); q.stage("b", "another note");
  assert.equal(recovery.get("a"), "latest"); first.resolve(); await running; await q.flushAll();
  assert.deepEqual(writes.filter(v => v !== "another note"), ["old", "latest"]); assert.ok(writes.includes("another note")); assert.equal(recovery.size, 0); assert.equal(q.isPending("a"), false);
});
test("failed writes retain recoverable text and retry the latest edit", async () => {
  let fail = true; const values: string[] = []; let local: string | null = null;
  const q = new NoteSaveQueue<string>(async (_id, value) => { if (fail) throw new Error("offline"); values.push(value); }, (_id, value) => { local = value; }, () => {}, 10000);
  q.stage("a", "draft"); await q.flushAll(); assert.equal(local, "draft"); assert.equal(q.getStatuses().a, "error");
  q.stage("a", "revised"); fail = false; await q.flushAll(); assert.deepEqual(values, ["revised"]); assert.equal(local, null); assert.equal(q.getStatuses().a, "saved");
});

test("stock replenishment survives reload, editing, completion and recoverable removal independently of ordinary notes", async () => {
  const { newRestockNote, changeRestockNote, restockTasks, restockPrefix } = await import("../app/notes/restock-model");
  let note = { id: restockPrefix + "pv", ...newRestockNote("Malha PV preta — 5 kg\nConfirmar lote com o fornecedor."), createdAt: 123, updatedAt: 456 };
  const original = { id: "customer-note", ...serializeDraft(newDraft("Pedido de cliente")) };
  assert.deepEqual(restockTasks([original, note]).map(item => item.title), ["Malha PV preta — 5 kg\nConfirmar lote com o fornecedor."]);
  assert.equal(restockTasks([note])[0].completed, false);
  note = { ...note, ...changeRestockNote(note, { type: "toggle", completed: true }) };
  note = { ...note, ...changeRestockNote(note, { type: "edit", text: "Malha PV preta — 7 kg\nMesmo lote." }) };
  assert.equal(restockTasks([JSON.parse(JSON.stringify(note))])[0].completed, true);
  assert.equal(restockTasks([note])[0].title, "Malha PV preta — 7 kg\nMesmo lote.");
  note = { ...note, ...changeRestockNote(note, { type: "toggle", completed: false }) };
  assert.equal(restockTasks([note])[0].completed, false);
  note = { ...note, ...changeRestockNote(note, { type: "remove" }) };
  assert.equal(restockTasks([note]).length, 0);
  const draft = toDraft(note);
  assert.equal(draft.document.status, "trash");
  draft.document.status = "active";
  assert.equal(restockTasks([{ ...note, ...serializeDraft(draft) }]).length, 1);
  assert.throws(() => newRestockNote(" "));
  assert.throws(() => newRestockNote("a".repeat(2001)));
  assert.throws(() => changeRestockNote(original, { type: "remove" }));
  assert.throws(() => changeRestockNote(note, { type: "toggle", completed: true }));
});

test("stock values feed payables once, follow edits and completion, and dates trigger only due reminders", async () => {
  const { newRestockNote, changeRestockNote, restockTasks, restockPrefix, restockBills, restockAlerts } = await import("../app/notes/restock-model");
  const { financialSummary, nextMonthPayables } = await import("../app/finance-model");
  let first = { id: restockPrefix + "a", ...newRestockNote({ text: "Fotolito A4", amount: 100.10, purchaseDate: "2026-11-08" }) };
  const second = { id: restockPrefix + "b", ...newRestockNote({ text: "Malha PV", amount: 50.20, purchaseDate: "2026-12-01" }) };
  const legacy = { id: restockPrefix + "old", ...newRestockNote("Papel sem preço cadastrado") };
  const read = () => restockTasks([first, second, legacy]);
  assert.equal(financialSummary([], restockBills(read()), "2026-11").toPay, 150.30);
  assert.equal(nextMonthPayables(restockBills(read()), "2026-11").total, 50.20);
  assert.equal(restockAlerts(read(), "2026-11-07").length, 0);
  assert.equal(restockAlerts(read(), "2026-11-08")[0].view, "reposicao");
  assert.equal(restockAlerts(read(), "2026-11-09")[0].tone, "danger");
  first = { ...first, ...changeRestockNote(first, { type: "edit", text: "Fotolito", amount: 0, purchaseDate: "" }) };
  assert.equal(financialSummary([], restockBills(read()), "2026-11").toPay, 50.20);
  assert.equal(restockAlerts(read(), "2026-11-09").length, 0);
  first = { ...first, ...changeRestockNote(first, { type: "edit", text: "Fotolito", amount: 20, purchaseDate: "2026-11-08" }) };
  first = { ...first, ...changeRestockNote(first, { type: "toggle", completed: true }) };
  assert.equal(financialSummary([], restockBills(read()), "2026-11").toPay, 50.20);
  assert.equal(restockTasks([JSON.parse(JSON.stringify(first))])[0].amount, 20);
  assert.throws(() => newRestockNote({ text: "Item", amount: -1, purchaseDate: "" }));
  assert.throws(() => newRestockNote({ text: "Item", amount: NaN, purchaseDate: "" }));
  assert.throws(() => newRestockNote({ text: "Item", amount: 1, purchaseDate: "2026-02-31" }));
  assert.throws(() => newRestockNote({ text: "Item", amount: 1, purchaseDate: "2026-99-99" }));
});
