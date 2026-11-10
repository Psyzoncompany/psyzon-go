import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ProductionSheets from "../app/ProductionSheets";
import { parseProductionOrder, productionPages, productionSummary, sampleProductionOrder, sortProductionRows, validateProductionChecklist } from "../app/production-checklist";
import { organizeProductionWithAI } from "../app/lib/server/production-organizer";
import type { ProviderCandidate } from "../app/lib/server/ai-agent";
import { productionColorFromNotes, productionColorFromProduct, productionColorInk } from "../app/production-theme";

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

test("quantity size codes identify models and preserve the number of physical shirts", () => {
  const result = parseProductionOrder("1G\n1M\n1MF\n2GF");
  assert.equal(result.rows.length, 5);
  assert.deepEqual(result.rows.map(row => [row.model, row.size]), [["Masculina", "M"], ["Masculina", "G"], ["Feminina", "M"], ["Feminina", "G"], ["Feminina", "G"]]);
  assert.ok(result.rows.every(row => row.name === "Sem nome"));
  assert.deepEqual(result.warnings, []);
  assert.equal(parseProductionOrder("1G, 1M; 1MF + 2GF").rows.length, 5);
  assert.equal(parseProductionOrder("2 x GGF\n3PP\n1G2M").rows.length, 6);
  assert.throws(() => parseProductionOrder("0G"), /500/);
  assert.throws(() => parseProductionOrder("500G\n1M"), /500/);
});

test("compact groups accept names, keep explicit sections and warn about excess names", () => {
  const result = parseProductionOrder("Feminina\n2M\nAna\nJoão\nMasculina\n1GF: Maria\n1G - Pedro\nCor: azul");
  assert.equal(result.rows.find(row => row.name === "João")?.model, "Feminina");
  assert.equal(result.rows.find(row => row.name === "Maria")?.model, "Feminina");
  assert.equal(result.rows.find(row => row.name === "Pedro")?.model, "Masculina");
  assert.equal(result.notes, "Cor: azul");
  assert.equal(parseProductionOrder("2GF\n2 unidades sem nome").rows.length, 2);
  assert.deepEqual(parseProductionOrder("FEMININA — 3 UNIDADES\n1MF\n2GF").warnings, []);
  assert.equal(parseProductionOrder("1G\nAna\nPedro").warnings.length, 1);
});

test("unnamed shirts print grouped sizes without repeated name rows or extra pages", () => {
  const checklist = parseProductionOrder("100G\n100M\n100GF\n100MF");
  const html = renderToStaticMarkup(createElement(ProductionSheets, { checklist }));
  assert.equal([...html.matchAll(/class="production-sheet production-sizes-only"/g)].length, 1);
  assert.equal([...html.matchAll(/class="production-size"/g)].length, 4);
  assert.doesNotMatch(html, /class="production-piece"|Sem nome/);
  assert.equal([...html.matchAll(/class="production-piece production-size-checks"/g)].length, 4);
  assert.equal([...html.matchAll(/<i /g)].length, 16);
  for (const stage of ["Corte", "Estampa", "Prensagem", "Embalagem"]) assert.match(html, new RegExp(`aria-label="${stage} · Masculina · Tamanho G · 100 un.`));
  assert.match(html, /400 UNIDADES/);
  const mixed = renderToStaticMarkup(createElement(ProductionSheets, { checklist: parseProductionOrder("3G\nAna") }));
  assert.match(mixed, /Ana/);
  assert.match(mixed, /2 un. sem personalização de nome/);
  assert.equal([...mixed.matchAll(/<i /g)].length, 8);
});

test("AI receives expanded codes and keeps the female suffix for unnamed shirts", async () => {
  const checklist = parseProductionOrder("1G\n1M\n1MF\n2GF");
  const result = await organizeProductionWithAI("1G\n1M\n1MF\n2GF", [candidate(checklist)]);
  assert.equal(result.rows.filter(row => /feminina/i.test(row.model)).length, 3);
  assert.equal(result.rows.length, 5);
  const interleaved = parseProductionOrder("1GF\n1M\n1G");
  const reordered = await organizeProductionWithAI("1GF\n1M\n1G", [candidate(interleaved)]);
  assert.deepEqual(reordered.rows.map(row => [row.model, row.size]), interleaved.rows.map(row => [row.model, row.size]));
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

test("imported lists, saved pieces, summaries and print pages share ascending size order", () => {
  const checklist = parseProductionOrder("MASCULINA\nGG\nLucas\nP\nEnzo\nG\nJoão\nPP\nPedro\nM\nJeferson\nFEMININA\nG\nViviane\nP\nVitória");
  assert.deepEqual(checklist.rows.map(row => row.size), ["PP", "P", "M", "G", "GG", "P", "G"]);
  const rows = [
    { id: "g", model: "Masculina", size: "G", name: "João", done: true },
    { id: "m", model: "Feminina", size: "M", name: "Lara", done: false },
    { id: "p", model: "Masculina", size: "P", name: "Enzo", done: false },
    { id: "p2", model: "Masculina", size: "P", name: "Lucas", done: true },
    { id: "pp", model: "Feminina", size: "PP", name: "Ana", done: false },
  ];
  const sorted = sortProductionRows(rows);
  assert.deepEqual(sorted.map(row => row.id), ["p", "p2", "g", "pp", "m"]);
  assert.equal(sorted.find(row => row.id === "g"), rows[0]);
  assert.equal(sorted.find(row => row.id === "p2")?.done, true);
  assert.deepEqual(rows.map(row => row.id), ["g", "m", "p", "p2", "pp"]);
  assert.deepEqual(productionPages(rows).flat(2).map(row => row.id), sorted.map(row => row.id));
  assert.deepEqual(productionSummary(rows).map(item => item.size), ["PP", "P", "M", "G"]);
  assert.deepEqual(sortProductionRows([...rows, { id: "new", model: "Masculina", size: "PP", name: "Sem nome", done: false }]).map(row => row.id), ["new", "p", "p2", "g", "pp", "m"]);
});

test("numeric sizes, ages and extended sizes sort naturally and keep custom sizes", () => {
  const sizes = ["G10", "A confirmar", "12 anos", "6 anos", "G2", "G1", "XGG", "GG", "G", "M", "P", "PP", "Sob medida", "Único", "Especial"];
  const rows = sizes.map((size, index) => ({ id: String(index), model: "Geral", size, name: "Sem nome", done: false }));
  assert.deepEqual(sortProductionRows(rows).map(row => row.size), ["6 anos", "12 anos", "PP", "P", "M", "G", "GG", "XGG", "G1", "G2", "G10", "Único", "Sob medida", "Especial", "A confirmar"]);
});

test("printed size summaries keep masculine, feminine and child quantities in their own model", () => {
  const checklist = parseProductionOrder("MASCULINA\nM\nJoão\nP\nEnzo\nP\nLucas\nFEMININA\nP\nAna\nINFANTIL\nP\nPedro\nM\nMaria");
  const html = renderToStaticMarkup(createElement(ProductionSheets, { checklist }));
  const summaries = [...html.matchAll(/<section class="production-summary-model">([\s\S]*?)<\/section>/g)].map(match => match[1]);
  assert.equal(summaries.length, 3);
  assert.match(summaries[0], /<span>MASCULINA<\/span><b>3 un\.<\/b>/);
  assert.match(summaries[0], /<small>P<\/small><b>2 un\.<\/b>/);
  assert.match(summaries[0], /<small>M<\/small><b>1 un\.<\/b>/);
  assert.match(summaries[1], /<span>FEMININA<\/span><b>1 un\.<\/b>/);
  assert.match(summaries[1], /<small>P<\/small><b>1 un\.<\/b>/);
  assert.match(summaries[2], /<span>INFANTIL<\/span><b>2 un\.<\/b>/);
  assert.match(summaries[2], /<small>P<\/small><b>1 un\.<\/b>/);
  assert.match(summaries[2], /<small>M<\/small><b>1 un\.<\/b>/);
});

test("each printed name has independent cut, print, pressing and packaging checkboxes on every page", () => {
  const checklist = parseProductionOrder(sampleProductionOrder);
  checklist.rows[0].done = true;
  const html = renderToStaticMarkup(createElement(ProductionSheets, { checklist }));
  const pieces = [...html.matchAll(/<div class="production-piece">([\s\S]*?)<\/div>/g)].map(match => match[1]);
  assert.equal(pieces.length, 15);
  for (const piece of pieces) {
    assert.equal([...piece.matchAll(/<i /g)].length, 4);
    for (const stage of ["Corte", "Estampa", "Prensagem", "Embalagem"]) assert.ok(piece.includes(`aria-label="${stage} · `));
    assert.doesNotMatch(piece, /✓/);
  }
  const many = { ...checklist, rows: Array.from({ length: 64 }, (_, index) => ({ id: String(index), model: "Masculina", size: "M", name: `Pessoa ${index + 1}`, done: false })) };
  const longHtml = renderToStaticMarkup(createElement(ProductionSheets, { checklist: many }));
  assert.equal([...longHtml.matchAll(/<i /g)].length, 64 * 4);
});

test("the print theme follows the shirt color and ignores artwork colors", () => {
  assert.equal(productionColorFromProduct("CAMISETA IGREJA - PRETA")?.hex, "#18181b");
  assert.equal(productionColorFromProduct("Camiseta Igreja - Azul Marinho")?.hex, "#172b4d");
  assert.equal(productionColorFromNotes("Cor da estampa: verde\n**Cor da camisa:** branca")?.hex, "#ffffff");
  assert.equal(productionColorFromNotes("Cor da estampa: azul"), undefined);
  assert.equal(productionColorFromNotes("Cor: preta e branca"), undefined);
  assert.equal(productionColorFromNotes("Cor da camisa: #FFDD00")?.hex, "#ffdd00");
  const checklist = parseProductionOrder("Tamanho P (1)\nJoão\nCor da camisa: vermelha");
  assert.equal(checklist.rows.length, 1);
  assert.equal(productionColorFromNotes(checklist.notes)?.hex, "#bd252e");
  assert.equal(productionColorInk("#18181b"), "#ffffff");
  assert.equal(productionColorInk("#ffffff"), "#000000");
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


test("unspecified models default to masculine for every name and the PDF keeps one model", () => {
  const checklist = parseProductionOrder("P\nAna\nJoão\nM\nMaria");
  assert.ok(checklist.rows.every(row => row.model === "Masculina"));
  const html = renderToStaticMarkup(createElement(ProductionSheets, { checklist }));
  assert.equal([...html.matchAll(/class="production-summary-model"/g)].length, 1);
  assert.doesNotMatch(html, /Feminina/i);
  const explicit = parseProductionOrder("Feminina:\nP\nJoão\nMasculina:\nM\nAna");
  assert.equal(explicit.rows.find(row => row.name === "João")?.model, "Feminina");
  assert.equal(explicit.rows.find(row => row.name === "Ana")?.model, "Masculina");
});

test("AI cannot infer female models from names, including mixed sections and inline table specifications", async () => {
  const text = "P\nAna\nJoão\nFeminina:\nM\nMaria";
  const output = { client: "", deadline: "", notes: "", warnings: [], rows: [
    { name: "Ana", model: "Feminina", size: "P" },
    { name: "João", model: "Masculina", size: "P" },
    { name: "Maria", model: "Masculina", size: "M" },
  ] };
  const result = await organizeProductionWithAI(text, [candidate(output)]);
  assert.equal(result.rows.find(row => row.name === "Ana")?.model, "Masculina");
  assert.equal(result.rows.find(row => row.name === "João")?.model, "Masculina");
  assert.equal(result.rows.find(row => row.name === "Maria")?.model, "Feminina");
  const table = await organizeProductionWithAI("Nome | Tamanho | Modelo\nAna | P | Feminina\nJoão | P |\nMaria | M |", [candidate(output)]);
  assert.equal(table.rows.find(row => row.name === "Ana")?.model, "Feminina");
  assert.equal(table.rows.find(row => row.name === "Maria")?.model, "Masculina");
});

test("split sizes retain the complete quantity and continue without another model heading", () => {
  const checklist = parseProductionOrder("Masculina\nP\n" + Array.from({ length: 7 }, (_, i) => `Pessoa P${i}`).join("\n") + "\nM\n" + Array.from({ length: 6 }, (_, i) => `Pessoa M${i}`).join("\n") + "\nG\n" + Array.from({ length: 6 }, (_, i) => `Pessoa G${i}`).join("\n"));
  const html = renderToStaticMarkup(createElement(ProductionSheets, { checklist }));
  const mHeaders = [...html.matchAll(/<h3><span>TAMANHO M[\s\S]*?<\/h3>/g)].map(match => match[0]);
  assert.equal(mHeaders.length, 2);
  assert.ok(mHeaders.every(header => header.includes("<b>6 un.</b>")));
  assert.ok(mHeaders[1].includes("continuação"));
  assert.equal([...html.matchAll(/<h2><span>Masculina<\/span>/g)].length, 1);
  assert.match(html, /<h2><span>Masculina<\/span><b>19 un\.<\/b><\/h2>/);
  assert.equal([...html.matchAll(/class="production-piece"/g)].length, 19);
});
