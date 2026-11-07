export type ProductionRow = { id: string; model: string; size: string; name: string; done: boolean };
export type ProductionChecklist = { client: string; deadline: string; notes: string; rows: ProductionRow[]; warnings: string[] };

const sizeCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const standardSizes = ["PP", "P", "M", "G", "GG", "XGG"];

function sizeOrder(size: string): [number, number, string] {
  const label = size.trim().toLocaleUpperCase("pt-BR").replace(/^TAMANHO\s+/, "").replace(/\s+/g, " ");
  const numeric = label.match(/^(\d+)(?:\s*ANOS?)?$/);
  if (numeric) return [0, Number(numeric[1]), label];
  const standard = standardSizes.indexOf(label);
  if (standard !== -1) return [1, standard, label];
  const extended = label.match(/^G(\d+)$/);
  if (extended) return [1, 5 + Number(extended[1]), label];
  if (label === "ÚNICO" || label === "UNICO") return [2, 0, label];
  if (label === "SOB MEDIDA") return [3, 0, label];
  if (!label || label === "A CONFIRMAR") return [5, 0, label];
  return [4, 0, label];
}

function compareSizes(first: string, second: string) {
  const a = sizeOrder(first);
  const b = sizeOrder(second);
  return a[0] - b[0] || a[1] - b[1] || sizeCollator.compare(a[2], b[2]);
}

export function sortProductionRows(rows: ProductionRow[]) {
  const models = new Map<string, number>();
  rows.forEach(row => { if (!models.has(row.model)) models.set(row.model, models.size); });
  return [...rows].sort((a, b) => models.get(a.model)! - models.get(b.model)! || compareSizes(a.size, b.size));
}
export const sampleProductionOrder = `MASCULINA — 8 UNIDADES
Tamanho P (2)
- Enzo
- João Vítor
Tamanho M (3)
- Jeferson
- Vinícius
- Wandres
Tamanho G (1)
- João Pedro
Tamanho GG (2)
- Edivan
- Lucas
FEMININA — 8 UNIDADES
Tamanho P (5)
- Vitória
- Graziele
- Lara
- Jemina
- 1 unidade sem nome
Tamanho M (1)
- Eluisa
Tamanho G (2)
- Viviane
- Sabrina`;

export function parseProductionOrder(text: string): ProductionChecklist {
  if (!text.trim() || text.length > 30000) throw new Error("Cole uma lista de até 30 mil caracteres.");
  const rows: ProductionRow[] = []; const warnings: string[] = []; const notes: string[] = [];
  let model = "Geral"; let size = "A confirmar"; let client = ""; let deadline = "";
  const expected: Array<{ label: string; count: number; start: number; end?: number; level: "model" | "size" }> = [];
  const close = (level: "model" | "size") => expected.filter((item) => item.end === undefined && (level === "model" || item.level === "size")).forEach((item) => { item.end = rows.length; });
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[•\-*]+\s*/, "").replace(/\*\*/g, "");
    if (!line) continue;
    if (/^(cliente|pedido)\s*:/i.test(line)) { client = line.split(":").slice(1).join(":").trim(); continue; }
    if (/^(prazo|entrega)\s*:/i.test(line)) { const value = line.split(":").slice(1).join(":").trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(value)) deadline = value; else notes.push(line); continue; }
    const heading = line.match(/^(masculin[ao]|feminin[ao]|infantil|unissex|manga curta(?:\s*[-–—]\s*padrão)?|manga comprida|sob medida|modelo\s+.+?)(?:\s*[-–—:]\s*(\d+)\s*(?:unidades?|un\.?))?$/i);
    if (heading) { close("model"); model = heading[1]; size = "A confirmar"; if (heading[2]) expected.push({ label: model, count: Number(heading[2]), start: rows.length, level: "model" }); continue; }
    const sizeHeading = line.match(/^(?:tamanho\s+)?(XGG|GG|G\d|PP|P|M|G|\d+\s*anos?|sob medida|único)\s*(?:\((\d+)\)|[-–—|:]\s*(\d+)\s*(?:unidades?|un\.?))?$/i);
    if (sizeHeading) { close("size"); size = sizeHeading[1].toLocaleUpperCase("pt-BR"); const count = sizeHeading[2] ?? sizeHeading[3]; if (count) expected.push({ label: `${model} / ${size}`, count: Number(count), start: rows.length, level: "size" }); continue; }
    if (/^(observa[çc][õo]es?|aten[çc][ãa]o|cor(?: d[ao]s? [^:]+)?|malha|tecido|estampa)\s*:/i.test(line) || size === "A confirmar") { notes.push(line); continue; }
    const unnamed = line.match(/^(\d+)\s*(?:unidades?|un\.?)?\s*sem nome$/i);
    const quantity = unnamed ? Number(unnamed[1]) : 1;
    if (!quantity || rows.length + quantity > 500) throw new Error("A lista deve ter entre 1 e 500 peças.");
    for (let index = 0; index < quantity; index++) rows.push({ id: `piece-${rows.length + 1}`, model, size, name: unnamed ? "Sem nome" : line.replace(/^\d+[.)]\s*/, ""), done: false });
  }
  close("model");
  for (const item of expected) { const actual = (item.end ?? rows.length) - item.start; if (actual !== item.count) warnings.push(`${item.label}: informado ${item.count}, encontrados ${actual}. Confira a lista.`); }
  if (!rows.length) throw new Error("Não encontrei nomes por tamanho. Use o exemplo ou tente organizar com IA.");
  const counts = new Map<string, number>();
  rows.filter((row) => row.name.toLocaleLowerCase("pt-BR") !== "sem nome").forEach((row) => counts.set(row.name, (counts.get(row.name) ?? 0) + 1));
  counts.forEach((count, name) => { if (count > 1) warnings.push(`${name} aparece ${count} vezes. Confira se são peças diferentes.`); });
  return validateProductionChecklist({ client, deadline, notes: notes.join("\n"), rows, warnings });
}

export function validateProductionChecklist(value: unknown): ProductionChecklist {
  if (!value || typeof value !== "object") throw new Error("Checklist inválido.");
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.rows) || data.rows.length < 1 || data.rows.length > 500) throw new Error("A lista deve ter entre 1 e 500 peças.");
  const string = (input: unknown, max: number) => { if (typeof input !== "string" || input.length > max) throw new Error("O checklist contém um campo inválido."); return input.trim(); };
  return { client: string(data.client ?? "", 120), deadline: string(data.deadline ?? "", 10), notes: string(data.notes ?? "", 4000), warnings: Array.isArray(data.warnings) ? data.warnings.slice(0, 30).map((warning) => string(warning, 300)) : [], rows: sortProductionRows(data.rows.map((value, index) => { if (!value || typeof value !== "object") throw new Error("Peça inválida."); const row = value as Record<string, unknown>; return { id: `piece-${index + 1}`, model: string(row.model, 80), size: string(row.size, 40), name: string(row.name, 160) || "Sem nome", done: row.done === true }; })) };
}

export function productionSummary(rows: ProductionRow[]) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(row.size, (map.get(row.size) ?? 0) + 1));
  return [...map].sort(([a], [b]) => compareSizes(a, b)).map(([size, quantity]) => ({ size, quantity }));
}

export function productionPages(rows: ProductionRow[]) {
  const ordered = sortProductionRows(rows);
  const pages: ProductionRow[][][] = [[[], []]];
  let page = 0; let column = 0; let used = 0;
  for (const row of ordered) {
    let previous = pages[page][column].at(-1);
    const weight = () => 1 + Math.max(0, Math.ceil(row.name.length / 38) - 1) * .6 + (previous?.model !== row.model ? 1.5 : 0) + (previous?.model !== row.model || previous?.size !== row.size ? 1.2 : 0);
    if (used + weight() > 15 && pages[page][column].length) {
      if (column === 0) column = 1;
      else { page += 1; column = 0; pages.push([[], []]); }
      used = 0; previous = undefined;
    }
    used += weight(); pages[page][column].push(row);
  }
  return pages;
}
