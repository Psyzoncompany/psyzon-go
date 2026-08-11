"use client";

import {
  Bold,
  Calculator,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  FilePlus2,
  Files,
  List,
  NotebookPen,
  Pin,
  Plus,
  Printer,
  Redo2,
  Search,
  Settings2,
  Shirt,
  SmilePlus,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { getApps } from "firebase/app";
import { addDoc, collection, deleteDoc, doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

export type NoteCategory = "Geral" | "Produção" | "Clientes" | "Compras" | "Modelagem";

export type BusinessNote = {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  pinned: boolean;
  materials?: NoteMaterial[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type NoteMaterial = {
  id: string;
  fabricType: FabricType;
  color: string;
  fabricKg: number;
  fabricCost: number;
  collarType: CollarType;
  ribanaKg: number;
  ribanaCost: number;
  ribanaPricePerKg: number;
  poloUnits: number;
  totalCost: number;
  supplier: "Costa Rica" | "Atual Têxtil";
};

type Draft = Pick<BusinessNote, "title" | "content" | "category" | "pinned"> & { materials: NoteMaterial[] };
type SaveState = "saved" | "saving" | "error";
type NoteTemplate = { title: string; category: NoteCategory; content: string };
type FabricType = "PV" | "PP" | "PIQUET";
type CollarType = "common" | "polo";

const categories: Array<NoteCategory | "Todos"> = ["Todos", "Geral", "Produção", "Clientes", "Compras", "Modelagem"];
const emptyDraft: Draft = { title: "", content: "", category: "Geral", pinned: false, materials: [] };

const templates: NoteTemplate[] = [
  {
    title: "Ordem de produção",
    category: "Produção",
    content: "PEDIDO / CLIENTE:\nMODELO:\nQUANTIDADE:\nTECIDO / COR:\nTAMANHOS:\nESTAMPAS:\nPRAZO:\n\nETAPAS\n☐ Separar tecido\n☐ Cortar\n☐ Estampar\n☐ Costurar\n☐ Revisar\n☐ Embalar\n\nOBSERVAÇÕES:\n",
  },
  {
    title: "Compra de tecido",
    category: "Compras",
    content: "FORNECEDOR:\nTECIDO:\nCOR:\nQUANTIDADE (KG):\nPREÇO POR KG:\nPREVISÃO DE PEÇAS:\nDATA DA COMPRA:\n\n☐ Conferir tonalidade\n☐ Conferir largura e gramatura\n☐ Guardar nota fiscal\n\nOBSERVAÇÕES:\n",
  },
  {
    title: "Ficha de medidas",
    category: "Modelagem",
    content: "CLIENTE / MODELO:\nTAMANHO BASE:\n\nMEDIDAS\n• Tórax:\n• Comprimento:\n• Ombro:\n• Manga:\n• Cintura:\n• Quadril:\n\nAJUSTES DE MODELAGEM:\n",
  },
  {
    title: "Conferência do pedido",
    category: "Clientes",
    content: "CLIENTE:\nPEDIDO:\nDATA DE ENTREGA:\n\n☐ Quantidade correta\n☐ Tamanhos conferidos\n☐ Estampa e posição conferidas\n☐ Acabamento revisado\n☐ Pagamento conferido\n☐ Cliente avisado\n\nPENDÊNCIAS:\n",
  },
];

function timestampValue(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function formatUpdatedAt(value: unknown) {
  const millis = timestampValue(value);
  if (!millis) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(millis));
}

function toDraft(note: BusinessNote): Draft {
  return { title: note.title, content: note.content, category: note.category, pinned: note.pinned, materials: Array.isArray(note.materials) ? note.materials : [] };
}

function titleCaseColor(value: string) {
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  return normalized ? normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1) : "Sem cor";
}

function evaluateExpression(value: string) {
  const expression = value.replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/").replace(/\s/g, "");
  const normalized = expression.startsWith("-") ? `0${expression}` : expression;
  if (!normalized || !/^\d+(?:\.\d+)?(?:[+\-*/]\d+(?:\.\d+)?)*$/.test(normalized)) throw new Error("Conta inválida");
  const tokens = normalized.match(/\d+(?:\.\d+)?|[+\-*/]/g) ?? [];
  const values: number[] = [Number(tokens[0])];
  const operators: string[] = [];

  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const nextValue = Number(tokens[index + 1]);
    if (operator === "*" || operator === "/") {
      const previous = values.pop() ?? 0;
      values.push(operator === "*" ? previous * nextValue : previous / nextValue);
    } else {
      operators.push(operator);
      values.push(nextValue);
    }
  }

  return values.slice(1).reduce((total, number, index) => operators[index] === "+" ? total + number : total - number, values[0]);
}

export default function NotesWorkspace({ uid, notes }: { uid: string; notes: BusinessNote[] }) {
  const initialNote = [...notes].sort((left, right) => Number(right.pinned) - Number(left.pinned) || timestampValue(right.updatedAt) - timestampValue(left.updatedAt))[0];
  const initialDraft: Draft = initialNote ? toDraft(initialNote) : emptyDraft;
  const [selectedId, setSelectedId] = useState(initialNote?.id ?? "");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Todos");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [editorNotice, setEditorNotice] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorTab, setCalculatorTab] = useState<"tecido" | "geral">("tecido");
  const [priceSettingsOpen, setPriceSettingsOpen] = useState(false);
  const [expression, setExpression] = useState("");
  const [calculatorError, setCalculatorError] = useState("");
  const [fabricMode, setFabricMode] = useState<"kg" | "pieces">("pieces");
  const [supplier, setSupplier] = useState<"Costa Rica" | "Atual Têxtil">("Costa Rica");
  const [fabricType, setFabricType] = useState<FabricType>("PV");
  const [fabricColor, setFabricColor] = useState("");
  const [collarType, setCollarType] = useState<CollarType>("common");
  const [fabricValue, setFabricValue] = useState("100");
  const [waste, setWaste] = useState("0");
  const [pricePerKg, setPricePerKg] = useState("");
  const [ribanaPricePerKg, setRibanaPricePerKg] = useState("90.91");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const lastSavedRef = useRef(JSON.stringify(initialDraft));

  const sortedNotes = useMemo(() => [...notes].sort((left, right) => Number(right.pinned) - Number(left.pinned) || timestampValue(right.updatedAt) - timestampValue(left.updatedAt)), [notes]);
  const filteredNotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return sortedNotes.filter((note) => {
      const materialTerms = note.materials?.map((material) => `${material.fabricType} ${material.color}`).join(" ") ?? "";
      return (category === "Todos" || note.category === category) && (!term || `${note.title} ${note.content} ${materialTerms}`.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [category, search, sortedNotes]);
  const materialsTotal = useMemo(() => draft.materials.reduce((total, material) => total + material.totalCost, 0), [draft.materials]);
  useEffect(() => {
    if (!selectedId) return;
    const serialized = JSON.stringify(draft);
    if (serialized === lastSavedRef.current) return;
    setSaveState("saving");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      try {
        await updateDoc(doc(getFirestore(getApps()[0]), "users", uid, "notes", selectedId), { ...draft, updatedAt: serverTimestamp() });
        lastSavedRef.current = serialized;
        setSaveState("saved");
      } catch (error) {
        console.error("Note autosave failed", error);
        setSaveState("error");
      }
    }, 650);
    return () => window.clearTimeout(timerRef.current);
  }, [draft, selectedId, uid]);

  const selectNote = (note: BusinessNote) => {
    const nextDraft = toDraft(note);
    setSelectedId(note.id);
    setDraft(nextDraft);
    lastSavedRef.current = JSON.stringify(nextDraft);
    setSaveState("saved");
  };

  const createNote = async (template?: NoteTemplate) => {
    const nextDraft: Draft = {
      title: template?.title ?? "Nova anotação",
      content: template?.content ?? "",
      category: template?.category ?? "Geral",
      pinned: false,
      materials: [],
    };
    const reference = await addDoc(collection(getFirestore(getApps()[0]), "users", uid, "notes"), { ...nextDraft, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    setSelectedId(reference.id);
    setDraft(nextDraft);
    lastSavedRef.current = JSON.stringify(nextDraft);
    setSaveState("saved");
  };

  const deleteNote = async () => {
    if (!selectedId || !window.confirm(`Excluir a anotação “${draft.title || "Sem título"}”?`)) return;
    const nextNote = sortedNotes.find((note) => note.id !== selectedId);
    await deleteDoc(doc(getFirestore(getApps()[0]), "users", uid, "notes", selectedId));
    if (nextNote) selectNote(nextNote);
    else {
      setSelectedId("");
      setDraft(emptyDraft);
      lastSavedRef.current = "";
    }
  };

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return setDraft((current) => ({ ...current, content: `${current.content}${text}` }));
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setDraft((current) => ({ ...current, content: `${current.content.slice(0, start)}${text}${current.content.slice(end)}` }));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const showEditorNotice = (message: string) => {
    setEditorNotice(message);
    window.setTimeout(() => setEditorNotice(""), 2200);
  };

  const wrapSelection = (prefix: string, suffix = prefix) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.content.slice(start, end) || "texto";
    const replacement = `${prefix}${selected}${suffix}`;
    setDraft((current) => ({ ...current, content: `${current.content.slice(0, start)}${replacement}${current.content.slice(end)}` }));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const materialText = (material: NoteMaterial, index: number) => {
    const collarLines = material.collarType === "common"
      ? `🟩 *Ribana – ${material.color}*\n⚖️ Quantidade: ${formatKg(material.ribanaKg)} kg\n💵 *Valor: ${formatCurrency(material.ribanaCost)}*`
      : `👕 *Gola polo – ${material.color}*\n🔢 Quantidade: ${material.poloUnits} unidades`;
    return `🧵 *MATERIAL ${index + 1}*\n\n🟢 *Malha ${material.fabricType} – ${material.color}*\n⚖️ Quantidade: ${formatKg(material.fabricKg)} kg\n\n${collarLines}\n\n💰 *CUSTO TOTAL MATERIAL ${index + 1}: ${formatCurrency(material.totalCost)}*`;
  };

  const exportedMaterials = () => {
    if (!draft.materials.length) return `${draft.title}\n\n${draft.content}`.trim();
    const blocks = draft.materials.map(materialText).join("\n\n━━━━━━━━━━━━━━━━━━\n\n");
    return `${blocks}\n\n💰 *CUSTO TOTAL GERAL: ${formatCurrency(materialsTotal)}*`;
  };

  const copyMaterials = async () => {
    await navigator.clipboard.writeText(exportedMaterials());
    setExportMenuOpen(false);
    showEditorNotice("Texto copiado para o WhatsApp");
  };

  const downloadText = () => {
    const file = new Blob([exportedMaterials()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.title || "anotacao"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
    showEditorNotice("Arquivo TXT exportado");
  };

  const duplicateLastMaterial = () => {
    const material = draft.materials.at(-1);
    if (!material) {
      setCalculatorTab("tecido");
      setCalculatorOpen(true);
      return;
    }
    setDraft((current) => ({ ...current, materials: [...current.materials, { ...material, id: crypto.randomUUID() }] }));
    showEditorNotice(`MATERIAL ${draft.materials.length + 1} duplicado`);
  };

  const removeMaterial = (id: string) => {
    setDraft((current) => ({ ...current, materials: current.materials.filter((material) => material.id !== id) }));
    showEditorNotice("Material removido e totais recalculados");
  };

  const calculate = () => {
    try {
      const result = evaluateExpression(expression);
      if (!Number.isFinite(result)) throw new Error("Conta inválida");
      setExpression(String(Number(result.toFixed(4))).replace(".", ","));
      setCalculatorError("");
    } catch {
      setCalculatorError("Confira a conta e tente novamente.");
    }
  };

  const numericFabricValue = Math.max(0, Number(fabricValue.replace(",", ".")) || 0);
  const numericWaste = Math.min(90, Math.max(0, Number(waste.replace(",", ".")) || 0));
  const efficiency = 1 - numericWaste / 100;
  const estimatedPieces = Math.floor(numericFabricValue * 4.2 * efficiency);
  const requiredKg = efficiency > 0 ? numericFabricValue / 4.2 / efficiency : 0;
  const numericPrice = Math.max(0, Number(pricePerKg.replace(",", ".")) || 0);
  const numericRibanaPrice = Math.max(0, Number(ribanaPricePerKg.replace(",", ".")) || 0);
  const calculatedOrderKg = fabricMode === "pieces" ? requiredKg : numericFabricValue;
  const totalFabricCost = calculatedOrderKg > 0 && numericPrice > 0 ? calculatedOrderKg * numericPrice : 0;
  const plannedPieces = fabricMode === "pieces" ? Math.ceil(numericFabricValue) : estimatedPieces;
  const ribanaKg = calculatedOrderKg * 0.05;
  const ribanaCost = collarType === "common" ? ribanaKg * numericRibanaPrice : 0;
  const totalOrderCost = totalFabricCost + ribanaCost;
  const costPerPiece = plannedPieces > 0 ? totalOrderCost / plannedPieces : 0;
  const formatKg = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const formatCurrency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const addMaterialToNote = () => {
    const color = titleCaseColor(fabricColor);
    if (!numericFabricValue || !selectedId || !fabricColor.trim()) return;
    const nextNumber = draft.materials.length + 1;
    const material: NoteMaterial = {
      id: crypto.randomUUID(),
      fabricType,
      color,
      fabricKg: calculatedOrderKg,
      fabricCost: totalFabricCost,
      collarType,
      ribanaKg: collarType === "common" ? ribanaKg : 0,
      ribanaCost,
      ribanaPricePerKg: numericRibanaPrice,
      poloUnits: collarType === "polo" ? plannedPieces : 0,
      totalCost: totalOrderCost,
      supplier,
    };
    setDraft((current) => ({ ...current, materials: [...current.materials, material] }));
    setCalculatorOpen(false);
    showEditorNotice(`MATERIAL ${nextNumber} adicionado e calculado`);
  };

  return (
    <div className="notes-workspace">
      <div className="page-heading compact notes-heading">
        <div><span className="eyebrow">CENTRAL DE ANOTAÇÕES</span><h1>Bloco de notas</h1><p>Produção, clientes, compras e modelagem salvos em tempo real.</p></div>
        <button className="primary" onClick={() => createNote()}><FilePlus2 size={18} /> Nova anotação</button>
      </div>

      <section className="note-template-strip" aria-label="Modelos rápidos">
        <div><Sparkles size={17} /><span><b>Modelos da confecção</b><small>Comece com uma estrutura pronta</small></span></div>
        <div>{templates.map((template) => <button key={template.title} onClick={() => createNote(template)}>{template.title}<ChevronRight size={14} /></button>)}</div>
      </section>

      <div className="notes-layout">
        <aside className="notes-sidebar panel">
          <div className="notes-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar anotações…" aria-label="Buscar anotações" /></div>
          <div className="notes-filters">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="notes-list">
            {filteredNotes.map((note) => <button key={note.id} className={selectedId === note.id ? "active" : ""} onClick={() => selectNote(note)}><span><b>{note.title || "Sem título"}</b>{note.pinned ? <Pin size={12} /> : null}</span><p>{note.materials?.length ? `${note.materials.length} ${note.materials.length === 1 ? "material" : "materiais"} · Custo total: ${formatCurrency(note.materials.reduce((total, material) => total + material.totalCost, 0))}` : note.content || "Anotação vazia"}</p><small><span>{note.category}</span>{formatUpdatedAt(note.updatedAt)}</small></button>)}
            {!filteredNotes.length && <div className="notes-empty"><NotebookPen size={24} /><b>Nenhuma anotação</b><small>Crie uma nota ou escolha um modelo.</small></div>}
          </div>
        </aside>

        <section className="note-editor panel">
          {selectedId ? <>
            <header className="note-editor-header">
              <div className={`note-save-state ${saveState}`}><span />{saveState === "saving" ? "Salvando…" : saveState === "error" ? "Falha ao salvar" : "Salvo em tempo real"}</div>
              <div><button className={draft.pinned ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, pinned: !current.pinned }))} aria-label={draft.pinned ? "Desafixar anotação" : "Fixar anotação"}><Pin size={16} /></button><button onClick={copyMaterials} aria-label="Copiar anotação"><Copy size={16} /></button><button className="danger" onClick={deleteNote} aria-label="Excluir anotação"><Trash2 size={16} /></button></div>
            </header>
            <div className="note-document-heading">
              <div><input className="note-title-input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título da anotação" aria-label="Título da anotação" /><select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as NoteCategory }))} aria-label="Categoria da anotação">{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="materials-grand-total"><small>CUSTO TOTAL</small><b>{formatCurrency(materialsTotal)}</b><span><Calculator size={13} /> Cálculo automático ativado</span></div>
            </div>
            <div className="note-actionbar">
              <button onClick={() => wrapSelection("**")}><Bold size={15} /> Negrito</button>
              <button onClick={() => insertAtCursor("🧵 ")}><SmilePlus size={15} /> Emoji</button>
              <button onClick={() => insertAtCursor("• ")}><List size={15} /> Lista</button>
              <button onClick={() => insertAtCursor(`${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())} — `)}><Clock3 size={15} /> Data</button>
              <button onClick={() => { textareaRef.current?.focus(); document.execCommand("undo"); }} aria-label="Desfazer"><Undo2 size={15} /> Desfazer</button>
              <button onClick={() => { textareaRef.current?.focus(); document.execCommand("redo"); }} aria-label="Refazer"><Redo2 size={15} /> Refazer</button>
              <span />
              <button className="add-material" onClick={() => { setCalculatorTab("tecido"); setCalculatorOpen(true); }}><Plus size={15} /> Adicionar material</button>
              <button onClick={duplicateLastMaterial}><Files size={15} /> Duplicar</button>
              <div className="note-export-wrap"><button className={exportMenuOpen ? "active" : ""} onClick={() => setExportMenuOpen((current) => !current)} aria-expanded={exportMenuOpen}><Download size={15} /> Exportar</button>{exportMenuOpen && <div className="note-export-menu"><button onClick={downloadText}><FileText size={15} /> TXT</button><button onClick={() => { setExportMenuOpen(false); window.print(); }}><Printer size={15} /> PDF / Imprimir</button></div>}</div>
              <button onClick={copyMaterials}><Copy size={15} /> Copiar</button>
            </div>
            {editorNotice && <div className="editor-notice">{editorNotice}</div>}
            <div className="note-writing-area">
              <textarea ref={textareaRef} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="Escreva uma observação para acompanhar os materiais…" aria-label="Conteúdo da anotação" />
              <div className="materials-document">
                {draft.materials.map((material, index) => <article className="material-document-card" key={material.id}>
                  <header><b>🧵 MATERIAL {index + 1}</b><div><button onClick={() => navigator.clipboard.writeText(materialText(material, index)).then(() => showEditorNotice(`MATERIAL ${index + 1} copiado`))} aria-label={`Copiar material ${index + 1}`}><Copy size={14} /></button><button onClick={() => removeMaterial(material.id)} aria-label={`Remover material ${index + 1}`}><Trash2 size={14} /></button></div></header>
                  <div className="material-line"><b>🟢 Malha {material.fabricType} – {material.color}</b><span>⚖️ Quantidade: {formatKg(material.fabricKg)} kg</span></div>
                  {material.collarType === "common" ? <div className="material-line"><b>🟩 Ribana – {material.color}</b><span>⚖️ Quantidade: {formatKg(material.ribanaKg)} kg</span><strong>💵 Valor: {formatCurrency(material.ribanaCost)}</strong></div> : <div className="material-line"><b>👕 Gola polo – {material.color}</b><span>🔢 Quantidade: {material.poloUnits} unidades</span></div>}
                  <div className="material-total-row">💰 CUSTO TOTAL MATERIAL {index + 1}: {formatCurrency(material.totalCost)}</div>
                </article>)}
                {!draft.materials.length && <button className="materials-empty" onClick={() => { setCalculatorTab("tecido"); setCalculatorOpen(true); }}><Shirt size={25} /><b>Adicione o primeiro material</b><span>A calculadora cria o bloco, numera e soma os custos automaticamente.</span></button>}
              </div>
            </div>
            <footer className="note-editor-footer"><span>{draft.materials.length} {draft.materials.length === 1 ? "material" : "materiais"}</span><span>Custo total: {formatCurrency(materialsTotal)}</span><span>Atualizado agora</span></footer>
          </> : <div className="note-editor-empty"><NotebookPen size={35} /><h2>Organize a operação</h2><p>Crie uma anotação livre ou use um modelo preparado para a confecção.</p><button className="primary" onClick={() => createNote()}><Plus size={17} /> Criar primeira anotação</button></div>}
        </section>
      </div>

      <button className="notes-calculator-fab" onClick={() => setCalculatorOpen(true)} aria-label="Abrir calculadora"><Calculator size={22} /><span>Calculadora</span></button>

      {calculatorOpen && <div className="calculator-backdrop">
        <button className="calculator-dismiss-layer" onClick={() => setCalculatorOpen(false)} aria-label="Fechar calculadora clicando fora" />
        <aside className="calculator-panel" role="dialog" aria-modal="true" aria-label="Calculadora da confecção">
          <header><div><span><Calculator size={19} /></span><div><b>Calculadora da confecção</b><small>Planejamento rápido sem sair das notas</small></div></div><button onClick={() => setCalculatorOpen(false)} aria-label="Fechar calculadora"><X size={18} /></button></header>
          <div className="calculator-tabs"><button className={calculatorTab === "tecido" ? "active" : ""} onClick={() => setCalculatorTab("tecido")}><Shirt size={16} /> Tecido e peças</button><button className={calculatorTab === "geral" ? "active" : ""} onClick={() => setCalculatorTab("geral")}><Calculator size={16} /> Calculadora</button></div>
          {calculatorTab === "tecido" ? <div className="fabric-calculator">
            <div className="fabric-rate"><Shirt size={20} /><span><small>RENDIMENTO PADRÃO</small><b>1 kg = 4,2 camisas</b></span></div>
            <div className="fabric-mode"><button className={fabricMode === "pieces" ? "active" : ""} onClick={() => setFabricMode("pieces")}>Quero produzir</button><button className={fabricMode === "kg" ? "active" : ""} onClick={() => setFabricMode("kg")}>Tenho tecido</button></div>
            <button className={`calculator-settings-toggle ${priceSettingsOpen ? "active" : ""}`} onClick={() => setPriceSettingsOpen((current) => !current)} aria-expanded={priceSettingsOpen}><Settings2 size={16} /><span><b>Configurar valores</b><small>Malha e ribana por kg</small></span><strong>{priceSettingsOpen ? "Fechar" : "Editar"}</strong></button>
            {priceSettingsOpen && <div className="price-settings" aria-label="Configuração de valores"><label>Valor da malha por kg (R$)<input type="number" min="0" step="0.01" value={pricePerKg} onChange={(event) => setPricePerKg(event.target.value)} placeholder="Informe o valor" /></label><label>Valor da ribana por kg (R$)<input type="number" min="0" step="0.01" value={ribanaPricePerKg} onChange={(event) => setRibanaPricePerKg(event.target.value)} /></label></div>}
            <div className="supplier-selector"><small>SELECIONE O FORNECEDOR</small><div><button className={supplier === "Costa Rica" ? "active" : ""} onClick={() => setSupplier("Costa Rica")} aria-pressed={supplier === "Costa Rica"}>Costa Rica</button><button className={supplier === "Atual Têxtil" ? "active" : ""} onClick={() => setSupplier("Atual Têxtil")} aria-pressed={supplier === "Atual Têxtil"}>Atual Têxtil</button></div></div>
            <div className="material-options">
              <div className="option-selector"><small>TIPO DE MALHA</small><div>{(["PV", "PP", "PIQUET"] as FabricType[]).map((type) => <button key={type} className={fabricType === type ? "active" : ""} onClick={() => setFabricType(type)} aria-pressed={fabricType === type}>{type}</button>)}</div></div>
              <label>Cor da malha<input value={fabricColor} onChange={(event) => setFabricColor(event.target.value)} placeholder="Ex.: Azul royal" /></label>
            </div>
            <div className="option-selector collar-selector"><small>TIPO DE GOLA</small><div><button className={collarType === "common" ? "active" : ""} onClick={() => setCollarType("common")} aria-pressed={collarType === "common"}>Gola comum</button><button className={collarType === "polo" ? "active" : ""} onClick={() => setCollarType("polo")} aria-pressed={collarType === "polo"}>Gola polo</button></div></div>
            <label>{fabricMode === "kg" ? "Quantidade de tecido (kg)" : "Quantidade de camisas"}<input type="number" min="0" step="0.1" value={fabricValue} onChange={(event) => setFabricValue(event.target.value)} /></label>
            <div className="fabric-row single"><label>Margem de perda (%)<input type="number" min="0" max="90" step="1" value={waste} onChange={(event) => setWaste(event.target.value)} /></label></div>
            <div className="fabric-result"><small>{fabricMode === "kg" ? "PRODUÇÃO ESTIMADA" : "TECIDO NECESSÁRIO"}</small><strong>{fabricMode === "kg" ? `${estimatedPieces} camisas` : `${requiredKg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`}</strong><p>{numericWaste ? `Já considerando ${numericWaste}% de perda.` : "Cálculo com rendimento integral do tecido."}</p></div>
            <div className="collar-result"><span>{collarType === "common" ? "Ribana necessária" : "Golas polo necessárias"}</span><b>{collarType === "common" ? `${formatKg(ribanaKg)} kg` : `${plannedPieces} unidades`}</b><small>{collarType === "common" ? `5% da malha · ${formatCurrency(numericRibanaPrice)}/kg · custo ${formatCurrency(ribanaCost)}` : "1 gola por camisa"}</small></div>
            {(collarType === "common" || totalFabricCost > 0) && <div className="cost-summary">{collarType === "common" && <div className="cost-result ribana"><span>Valor total da ribana</span><b>{formatCurrency(ribanaCost)}</b></div>}{totalFabricCost > 0 && <><div className="cost-result"><span>Valor total da malha</span><b>{formatCurrency(totalFabricCost)}</b></div><div className="cost-result"><span>Custo estimado por camisa</span><b>{formatCurrency(costPerPiece)}</b></div><div className="cost-result total"><span>Custo total do pedido</span><b>{formatCurrency(totalOrderCost)}</b></div></>}</div>}
            <button className="calculator-copy supplier-export" onClick={addMaterialToNote} disabled={!numericFabricValue || !selectedId || !fabricColor.trim()}><FilePlus2 size={16} /> Adicionar como MATERIAL {draft.materials.length + 1}</button>
          </div> : <div className="general-calculator">
            <div className="calculator-display"><small>CONTA</small><strong>{expression || "0"}</strong>{calculatorError && <span>{calculatorError}</span>}</div>
            <div className="calculator-keys">{["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", ","].map((key) => <button key={key} className={["÷", "×", "−", "+", "="].includes(key) ? "operator" : ""} onClick={() => { if (key === "C") { setExpression(""); setCalculatorError(""); } else if (key === "⌫") setExpression((current) => current.slice(0, -1)); else if (key === "=") calculate(); else { const value = key === "−" ? "-" : key; setExpression((current) => `${current}${value}`); setCalculatorError(""); } }}>{key}</button>)}</div>
          </div>}
        </aside>
      </div>}
    </div>
  );
}
