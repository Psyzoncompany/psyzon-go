import assert from "node:assert/strict";
import test from "node:test";
import { parseProductionOrder, productionPages, productionSummary, sampleProductionOrder, validateProductionChecklist } from "../app/production-checklist";
import { organizeProductionWithAI } from "../app/lib/server/production-organizer";
import type { ProviderCandidate } from "../app/lib/server/ai-agent";

test("JERFESSON has 16 shirts, eight per model, with one unnamed shirt", () => {
  const checklist = parseProductionOrder(sampleProductionOrder);
  assert.equal(checklist.rows.length, 16);
  assert.equal(checklist.rows.filter((row) => /masculina/i.test(row.model)).length, 8);
  assert.equal(checklist.rows.filter((row) => /feminina/i.test(row.model)).length, 8);
  assert.equal(checklist.rows.filter((row) => row.name === "Sem nome").length, 1);
  assert.deepEqual(productionSummary(checklist.rows), [{ size: "P", quantity: 7 }, { size: "M", quantity: 4 }, { size: "G", quantity: 3 }, { size: "GG", quantity: 2 }]);
  assert.deepEqual(checklist.warnings, []);
  assert.ok(checklist.rows.some((row) => row.name === "João Vítor"));
});

test("parser flags mismatched counts and duplicates without dropping names", () => {
  const checklist = parseProductionOrder("MASCULINA — 3 UNIDADES\nTamanho P (3)\n- João\n- João\nTamanho M (2)\n- 2 unidades sem nome\nCor: azul");
  assert.equal(checklist.rows.length, 4);
  assert.equal(checklist.rows.filter((row) => row.name === "João").length, 2);
  assert.equal(checklist.rows.filter((row) => row.name === "Sem nome").length, 2);
  assert.ok(checklist.warnings.some((warning) => warning.includes("aparece 2")));
  assert.ok(checklist.warnings.some((warning) => warning.includes("informado 3, encontrados 2")));
  assert.equal(checklist.notes, "Cor: azul");
});

test("checklists reject malformed and oversized data", () => {
  assert.throws(() => parseProductionOrder(""));
  assert.throws(() => parseProductionOrder("P\n501 unidades sem nome"));
  assert.throws(() => validateProductionChecklist({ rows: [{ name: "João", model: 5, size: "P" }] }));
  assert.throws(() => validateProductionChecklist({ rows: Array(501).fill({}) }));
});

test("printing preserves every piece across columns and pages", () => {
  assert.equal(productionPages(parseProductionOrder(sampleProductionOrder).rows).length, 1);
  const rows = Array.from({ length: 64 }, (_, index) => ({ id: String(index), model: "Masculina", size: index % 2 ? "P" : "M", name: `Pessoa ${index + 1}`, done: false }));
  const pages = productionPages(rows);
  assert.ok(pages.length > 1);
  assert.deepEqual(pages.flat(2).map((row) => row.id).sort(), rows.map((row) => row.id).sort());
});

function candidate(output: unknown, family: "groq" | "deepseek" = "groq"): ProviderCandidate {
  return { id: family, family, label: family, provider: { model: "test-model", create: async (_input, _instructions, tools) => { assert.deepEqual(tools, []); return { id: "test", status: "completed", functionCalls: [], outputText: JSON.stringify(output), usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }; }, continue: async () => { throw new Error("Unexpected continuation"); } } };
}

test("AI output is validated and invented names trigger fallback", async () => {
  const good = parseProductionOrder(sampleProductionOrder);
  const bad = { ...good, rows: [{ ...good.rows[0], name: "Nome inventado" }] };
  const result = await organizeProductionWithAI(sampleProductionOrder, [candidate(bad), candidate(good, "deepseek")]);
  assert.equal(result.rows.length, 16);
  await assert.rejects(organizeProductionWithAI(sampleProductionOrder, [candidate(bad)]), /PRODUCTION_AI_UNAVAILABLE/);
  await assert.rejects(organizeProductionWithAI(sampleProductionOrder, []), /PRODUCTION_AI_NOT_CONFIGURED/);
});
