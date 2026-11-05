export type NoteCategory = "Geral" | "Produção" | "Clientes" | "Compras" | "Modelagem";
export const categories: NoteCategory[] = ["Geral", "Produção", "Clientes", "Compras", "Modelagem"];
export type NoteMaterial = {
  id: string; fabricType: "PV" | "PP" | "PIQUET" | "Algodão" | "Dry Fit";
  color: string; collarColor?: string; fabricKg: number; fabricCost: number;
  collarType: "common" | "polo"; ribanaKg: number; ribanaCost: number;
  ribanaPricePerKg: number; poloUnits: number; poloPricePerUnit?: number;
  poloCost?: number; totalCost: number; supplier: string;
  fabricPricePerKg?: number; yieldPerKg?: number; ribanaPercent?: number;
};
export type BusinessNote = { id: string; title: string; content: string; category: NoteCategory; pinned: boolean; materials?: NoteMaterial[]; createdAt?: unknown; updatedAt?: unknown };
export type TextBlock = { id: string; type: "paragraph" | "heading" | "bullet" | "check"; text: string; bold?: boolean; done?: boolean };
export type NoteDocument = { version: 2; blocks: TextBlock[]; status: "active" | "archive" | "trash"; orderId: string; customerId: string };
export type NoteDraft = Pick<BusinessNote, "title" | "category" | "pinned"> & { document: NoteDocument; materials: NoteMaterial[] };
export type StoredNote = Pick<BusinessNote, "title" | "content" | "category" | "pinned"> & { materials: NoteMaterial[] };
export const documentPrefix = "psyzon-note@2\n";
export const makeId = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
export const block = (text = "", type: TextBlock["type"] = "paragraph"): TextBlock => ({ id: makeId(), type, text });
export const emptyDocument = (): NoteDocument => ({ version: 2, blocks: [block()], status: "active", orderId: "", customerId: "" });
export const newDraft = (title = ""): NoteDraft => ({ title, category: "Geral", pinned: false, materials: [], document: emptyDocument() });
export function millis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && "seconds" in value && typeof value.seconds === "number") return value.seconds * 1000;
  return typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) || 0 : 0;
}
export const currency = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function readDocument(content: string, materials: NoteMaterial[] = []): NoteDocument {
  if (content.startsWith(documentPrefix)) {
    try {
      const parsed = JSON.parse(content.slice(documentPrefix.length));
      if (parsed.version === 2 && Array.isArray(parsed.blocks) && parsed.blocks.every((b: TextBlock) => typeof b.id === "string" && typeof b.text === "string" && ["paragraph", "heading", "bullet", "check"].includes(b.type))) {
        return { ...emptyDocument(), ...parsed, blocks: parsed.blocks.length ? parsed.blocks : [block()] };
      }
    } catch { /* Keep unreadable content as text, never discard it. */ }
  }
  // Legacy text remains untouched except for generated material lines whose data is already stored.
  let text = content;
  if (materials.length && /🧵\s*\*?MATERIAL\s+\d+/i.test(content)) {
    text = content.split("\n").filter(line => !/^(?:🧵\s*\*?MATERIAL\s+\d+\*?|🏭\s*Fornecedor:.*|🟢\s*\*?Malha\s+.*|🟩\s*Ribana\s*[–-].*|👕\s*Gola polo.*|(?:⚖️|🔢)\s*Quantidade:.*|💰\s*Custo total do material:.*|─{5,})\s*$/i.test(line.trim())).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const blocks = text.split("\n").map(line => {
    const checked = line.match(/^(?:☐|☑|✅|\[[ xX]\])\s*(.*)$/);
    if (checked) return { ...block(checked[1], "check"), done: /^(?:☑|✅|\[[xX]\])/.test(line) };
    if (/^[•*-]\s/.test(line)) return block(line.replace(/^[•*-]\s/, ""), "bullet");
    if (/^#{1,3}\s/.test(line)) return block(line.replace(/^#{1,3}\s/, ""), "heading");
    return { ...block(line.replace(/^\*\*(.*)\*\*$/, "$1")), bold: /^\*\*.*\*\*$/.test(line) };
  });
  return { ...emptyDocument(), blocks: blocks.length ? blocks : [block()] };
}
export function toDraft(note: BusinessNote): NoteDraft {
  const materials = (note.materials ?? []).map(m => ({ ...m, collarColor: m.collarColor || m.color, supplier: m.supplier || "Costa Rica" }));
  return { title: note.title, category: note.category, pinned: note.pinned, materials, document: readDocument(note.content, materials) };
}
export function serializeDraft(draft: NoteDraft): StoredNote {
  return { title: draft.title, category: draft.category, pinned: draft.pinned, content: documentPrefix + JSON.stringify(draft.document), materials: draft.materials };
}
export const plainText = (draft: NoteDraft) => draft.document.blocks.map(b => `${b.type === "check" ? b.done ? "☑ " : "☐ " : b.type === "bullet" ? "• " : ""}${b.text}`).join("\n");
export function recalculateMaterial(m: NoteMaterial): NoteMaterial {
  const fabricPricePerKg = m.fabricPricePerKg ?? (m.fabricKg > 0 ? m.fabricCost / m.fabricKg : 0);
  const fabricCost = m.fabricKg * fabricPricePerKg;
  const ribanaCost = m.collarType === "common" ? m.ribanaKg * m.ribanaPricePerKg : 0;
  const poloCost = m.collarType === "polo" ? m.poloUnits * (m.poloPricePerUnit ?? 0) : 0;
  return { ...m, fabricPricePerKg, fabricCost, ribanaCost, poloCost, totalCost: fabricCost + ribanaCost + poloCost };
}
export type Calculation = { mode: "pieces" | "kg"; quantity: number; yieldPerKg: number; waste: number; ribanaPercent: number; fabricPrice: number; ribanaPrice: number; poloPrice: number; poloQuantity?: number; collarType: "common" | "polo" };
export function calculateMaterial(c: Calculation) {
  if (![c.quantity, c.yieldPerKg, c.waste, c.ribanaPercent, c.fabricPrice, c.ribanaPrice, c.poloPrice].every(Number.isFinite) || c.quantity <= 0 || c.yieldPerKg <= 0 || c.waste < 0 || c.waste >= 100 || c.ribanaPercent < 0 || c.ribanaPercent > 100 || Math.min(c.fabricPrice, c.ribanaPrice, c.poloPrice) < 0 || (c.mode === "pieces" && !Number.isInteger(c.quantity)) || (c.poloQuantity !== undefined && (!Number.isInteger(c.poloQuantity) || c.poloQuantity < 0))) throw new Error("Confira quantidades, rendimento e preços. Camisas e conjuntos devem ser inteiros.");
  const efficiency = 1 - c.waste / 100;
  const kg = c.mode === "pieces" ? c.quantity / c.yieldPerKg / efficiency : c.quantity;
  const pieces = c.mode === "pieces" ? c.quantity : Math.floor(kg * c.yieldPerKg * efficiency);
  const ribanaKg = c.collarType === "common" ? kg * c.ribanaPercent / 100 : 0;
  const poloUnits = c.collarType === "polo" ? c.poloQuantity ?? pieces : 0;
  const fabricCost = kg * c.fabricPrice, ribanaCost = ribanaKg * c.ribanaPrice, poloCost = poloUnits * c.poloPrice;
  const total = fabricCost + ribanaCost + poloCost;
  return { kg, pieces, ribanaKg, poloUnits, fabricCost, ribanaCost, poloCost, total, perPiece: pieces ? total / pieces : 0 };
}
export function supplierGroups(materials: NoteMaterial[]) {
  return [...new Set(materials.map(m => m.supplier))].map(supplier => ({ supplier, materials: materials.filter(m => m.supplier === supplier) }));
}
export function exportNote(draft: NoteDraft, options: { prices: boolean; supplier?: string }) {
  const groups = supplierGroups(draft.materials).filter(g => !options.supplier || g.supplier === options.supplier);
  const lines = options.supplier ? [`PEDIDO DE MATERIAL — ${options.supplier}`] : [draft.title || "Sem título", plainText(draft)];
  for (const group of groups) {
    lines.push("", `FORNECEDOR: ${group.supplier}`);
    for (const m of group.materials) {
      lines.push(`Malha ${m.fabricType} — ${m.color}: ${decimal(m.fabricKg)} kg`);
      lines.push(m.collarType === "common" ? `Ribana — ${m.collarColor || m.color}: ${decimal(m.ribanaKg)} kg` : `Gola polo + punho — ${m.collarColor || m.color}: ${m.poloUnits} conjuntos`);
      if (options.prices) lines.push(`Subtotal: ${currency(m.totalCost)}`);
      lines.push("");
    }
    if (options.prices) lines.push(`Total ${group.supplier}: ${currency(group.materials.reduce((sum, m) => sum + m.totalCost, 0))}`);
  }
  if (options.prices && groups.length > 1) lines.push("", `TOTAL DE MATERIAIS: ${currency(groups.flatMap(g => g.materials).reduce((sum, m) => sum + m.totalCost, 0))}`);
  return lines.join("\n").trim();
}
export const templates = [
  { title: "Anotação livre", category: "Geral" as NoteCategory, lines: [] },
  { title: "Compra de malha", category: "Compras" as NoteCategory, lines: ["Conferir disponibilidade das cores antes de fechar a compra.", "☐ Confirmar estoque com o fornecedor", "☐ Conferir cor da gola e do punho", "☐ Confirmar prazo de entrega"] },
  { title: "Lista de corte", category: "Produção" as NoteCategory, lines: ["# Lista de corte", "Cliente:", "Modelo e tecido:", "PP:   P:   M:   G:   GG:   G1:", "☐ Conferir quantidades", "☐ Separar tecido", "☐ Cortar e identificar peças"] },
  { title: "Medidas do cliente", category: "Modelagem" as NoteCategory, lines: ["Cliente:", "Modelo:", "Largura:", "Comprimento:", "Manga:", "Observações:", "☐ Confirmar medidas com o cliente"] },
];
