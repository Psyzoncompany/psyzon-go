import assert from "node:assert/strict";
import test from "node:test";
import { buildReminderContent } from "../app/notification-content";

const items = [
  { title: "Pedido atrasado · Cliente A", detail: "Uniformes · Atrasado 2 dias", view: "producao" },
  { title: "Energia · a pagar", detail: "R$ 150,00 · Vence hoje", systemDetail: "Vence hoje · 18/11", view: "financeiro" },
  { title: "Pedir DTF · Cliente B", detail: "Camisas · Entrega amanhã", view: "producao" },
  { title: "Comprar · Malha PV", detail: "Compra programada para hoje", view: "reposicao" },
];

test("a notification with four pending items names all four", () => {
  const content = buildReminderContent(items, "");
  assert.equal(content.title, items[0].title);
  assert.equal(content.destination, "producao");
  assert.deepEqual(content.body.split("\n"), [items[0].detail, ...items.slice(1).map(item => `• ${item.title}`)]);
});

test("system notifications use the due date without displaying financial amounts", () => {
  assert.equal(buildReminderContent([items[1]], "").body, "Vence hoje · 18/11");
  assert.match(buildReminderContent([...items, items[0]], "").body, /\+ 1 outra pendência$/);
  assert.equal(buildReminderContent([], "Confira os pedidos de hoje.").body, "Confira os pedidos de hoje.");
});
