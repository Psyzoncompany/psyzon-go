"use client";

import {
  Calculator,
  Check,
  CheckSquare,
  ChevronRight,
  Clock3,
  Copy,
  FilePlus2,
  List,
  NotebookPen,
  Pin,
  Plus,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { getApps } from "firebase/app";
import { addDoc, collection, deleteDoc, doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

export type NoteCategory = "Geral" | "Produção" | "Clientes" | "Compras" | "Modelagem";

export type BusinessNote = {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  pinned: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type Draft = Pick<BusinessNote, "title" | "content" | "category" | "pinned">;
type SaveState = "saved" | "saving" | "error";
type NoteTemplate = { title: string; category: NoteCategory; content: string };

const categories: Array<NoteCategory | "Todos"> = ["Todos", "Geral", "Produção", "Clientes", "Compras", "Modelagem"];
const emptyDraft: Draft = { title: "", content: "", category: "Geral", pinned: false };

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
  const initialDraft: Draft = initialNote ? { title: initialNote.title, content: initialNote.content, category: initialNote.category, pinned: initialNote.pinned } : emptyDraft;
  const [selectedId, setSelectedId] = useState(initialNote?.id ?? "");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("Todos");
  const [newTask, setNewTask] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorTab, setCalculatorTab] = useState<"tecido" | "geral">("tecido");
  const [expression, setExpression] = useState("");
  const [calculatorError, setCalculatorError] = useState("");
  const [fabricMode, setFabricMode] = useState<"kg" | "pieces">("pieces");
  const [supplier, setSupplier] = useState<"Costa Rica" | "Atual Têxtil">("Costa Rica");
  const [fabricValue, setFabricValue] = useState("100");
  const [waste, setWaste] = useState("0");
  const [pricePerKg, setPricePerKg] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const lastSavedRef = useRef(JSON.stringify(initialDraft));

  const sortedNotes = useMemo(() => [...notes].sort((left, right) => Number(right.pinned) - Number(left.pinned) || timestampValue(right.updatedAt) - timestampValue(left.updatedAt)), [notes]);
  const filteredNotes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return sortedNotes.filter((note) => (category === "Todos" || note.category === category) && (!term || `${note.title} ${note.content}`.toLocaleLowerCase("pt-BR").includes(term)));
  }, [category, search, sortedNotes]);
  const noteTasks = useMemo(() => draft.content.split("\n").map((line, index) => {
    const match = line.match(/^([☐☑])\s+(.+)$/);
    return match ? { index, done: match[1] === "☑", text: match[2] } : null;
  }).filter((task): task is { index: number; done: boolean; text: string } => task !== null), [draft.content]);
  const noteListItems = useMemo(() => draft.content.split("\n").map((line) => line.match(/^(?:•|-)\s+(.+)$/)?.[1]).filter((item): item is string => Boolean(item)), [draft.content]);
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
    const nextDraft = { title: note.title, content: note.content, category: note.category, pinned: note.pinned };
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

  const addInteractiveTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const task = newTask.trim();
    if (!task) return;
    setDraft((current) => ({ ...current, content: `${current.content}${current.content && !current.content.endsWith("\n") ? "\n" : ""}☐ ${task}` }));
    setNewTask("");
  };

  const toggleTask = (lineIndex: number, done: boolean) => {
    setDraft((current) => {
      const lines = current.content.split("\n");
      lines[lineIndex] = lines[lineIndex].replace(/^[☐☑]/, done ? "☐" : "☑");
      return { ...current, content: lines.join("\n") };
    });
  };

  const removeTask = (lineIndex: number) => {
    setDraft((current) => {
      const lines = current.content.split("\n");
      lines.splice(lineIndex, 1);
      return { ...current, content: lines.join("\n") };
    });
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
  const costPerPiece = efficiency > 0 ? numericPrice / 4.2 / efficiency : 0;

  const exportSupplierOrder = async () => {
    if (!numericFabricValue) return;
    const plannedPieces = fabricMode === "pieces" ? Math.ceil(numericFabricValue) : estimatedPieces;
    const orderKg = fabricMode === "pieces" ? requiredKg : numericFabricValue;
    const estimatedTotal = numericPrice > 0 ? orderKg * numericPrice : 0;
    const formattedKg = orderKg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedPrice = numericPrice > 0 ? numericPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "A confirmar";
    const formattedTotal = estimatedTotal > 0 ? estimatedTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "A confirmar";
    await createNote({
      title: `Pedido ${supplier} • ${plannedPieces} camisas`,
      category: "Compras",
      content: `PEDIDO DE TECIDO PARA FORNECEDOR\n\nDATA: ${new Intl.DateTimeFormat("pt-BR").format(new Date())}\nFORNECEDOR: ${supplier}\nCONTATO:\nTECIDO:\nCOR:\nGRAMATURA / LARGURA:\n\nQUANTIDADE A PEDIR: ${formattedKg} kg\nPRODUÇÃO PLANEJADA: ${plannedPieces} camisas\nRENDIMENTO UTILIZADO: 1 kg = 4,2 camisas\nMARGEM DE PERDA: ${numericWaste}%\nPREÇO POR KG: ${formattedPrice}\nTOTAL ESTIMADO: ${formattedTotal}\n\nPRAZO DE ENTREGA:\nFORMA DE PAGAMENTO:\n\nCONFERÊNCIA\n☐ Confirmar disponibilidade e tonalidade\n☐ Confirmar gramatura e largura\n☐ Confirmar valor do frete\n☐ Confirmar prazo de entrega\n☐ Guardar nota fiscal\n\nOBSERVAÇÕES:\n`,
    });
    setCalculatorOpen(false);
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
            {filteredNotes.map((note) => <button key={note.id} className={selectedId === note.id ? "active" : ""} onClick={() => selectNote(note)}><span><b>{note.title || "Sem título"}</b>{note.pinned ? <Pin size={12} /> : null}</span><p>{note.content || "Anotação vazia"}</p><small><span>{note.category}</span>{formatUpdatedAt(note.updatedAt)}</small></button>)}
            {!filteredNotes.length && <div className="notes-empty"><NotebookPen size={24} /><b>Nenhuma anotação</b><small>Crie uma nota ou escolha um modelo.</small></div>}
          </div>
        </aside>

        <section className="note-editor panel">
          {selectedId ? <>
            <header className="note-editor-header">
              <div className={`note-save-state ${saveState}`}><span />{saveState === "saving" ? "Salvando…" : saveState === "error" ? "Falha ao salvar" : "Salvo em tempo real"}</div>
              <div><button className={draft.pinned ? "active" : ""} onClick={() => setDraft((current) => ({ ...current, pinned: !current.pinned }))} aria-label={draft.pinned ? "Desafixar anotação" : "Fixar anotação"}><Pin size={16} /></button><button onClick={() => navigator.clipboard.writeText(`${draft.title}\n\n${draft.content}`)} aria-label="Copiar anotação"><Copy size={16} /></button><button className="danger" onClick={deleteNote} aria-label="Excluir anotação"><Trash2 size={16} /></button></div>
            </header>
            <input className="note-title-input" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Título da anotação" aria-label="Título da anotação" />
            <div className="note-toolbar">
              <select value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value as NoteCategory }))} aria-label="Categoria da anotação">{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select>
              <span />
              <button onClick={() => insertAtCursor("☐ ")}><CheckSquare size={15} /> Tarefa</button>
              <button onClick={() => insertAtCursor("• ")}><List size={15} /> Lista</button>
              <button onClick={() => insertAtCursor(`${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())} — `)}><Clock3 size={15} /> Data</button>
            </div>
            <textarea ref={textareaRef} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="Escreva detalhes do pedido, medidas, materiais, tarefas e observações…" aria-label="Conteúdo da anotação" />
            <div className="note-organizer">
              <section className="interactive-task-card">
                <header><span><CheckSquare size={16} /></span><div><b>Tarefas interativas</b><small>{noteTasks.filter((task) => task.done).length} de {noteTasks.length} concluídas</small></div></header>
                <form onSubmit={addInteractiveTask}><input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Adicionar tarefa…" aria-label="Nova tarefa" /><button type="submit" aria-label="Adicionar tarefa"><Plus size={16} /></button></form>
                <div className="interactive-task-list">
                  {noteTasks.map((task) => <div key={`${task.index}-${task.text}`} className={task.done ? "done" : ""}><label><input type="checkbox" checked={task.done} onChange={() => toggleTask(task.index, task.done)} /><span><Check size={12} /></span><b>{task.text}</b></label><button onClick={() => removeTask(task.index)} aria-label={`Remover tarefa ${task.text}`}><X size={14} /></button></div>)}
                  {!noteTasks.length && <p>Adicione tarefas para acompanhar a produção e marque cada etapa quando terminar.</p>}
                </div>
              </section>
              {noteListItems.length > 0 && <section className="visual-list-card"><header><List size={16} /><b>Lista da anotação</b><span>{noteListItems.length}</span></header><div>{noteListItems.map((item, index) => <p key={`${item}-${index}`}><span>{index + 1}</span>{item}</p>)}</div></section>}
            </div>
            <footer className="note-editor-footer"><span>{draft.content.trim() ? draft.content.trim().split(/\s+/).length : 0} palavras</span><span>{draft.content.length} caracteres</span></footer>
          </> : <div className="note-editor-empty"><NotebookPen size={35} /><h2>Organize a operação</h2><p>Crie uma anotação livre ou use um modelo preparado para a confecção.</p><button className="primary" onClick={() => createNote()}><Plus size={17} /> Criar primeira anotação</button></div>}
        </section>
      </div>

      <button className="notes-calculator-fab" onClick={() => setCalculatorOpen(true)} aria-label="Abrir calculadora"><Calculator size={22} /><span>Calculadora</span></button>

      {calculatorOpen && <div className="calculator-backdrop">
        <aside className="calculator-panel" role="dialog" aria-modal="true" aria-label="Calculadora da confecção">
          <header><div><span><Calculator size={19} /></span><div><b>Calculadora da confecção</b><small>Planejamento rápido sem sair das notas</small></div></div><button onClick={() => setCalculatorOpen(false)} aria-label="Fechar calculadora"><X size={18} /></button></header>
          <div className="calculator-tabs"><button className={calculatorTab === "tecido" ? "active" : ""} onClick={() => setCalculatorTab("tecido")}><Shirt size={16} /> Tecido e peças</button><button className={calculatorTab === "geral" ? "active" : ""} onClick={() => setCalculatorTab("geral")}><Calculator size={16} /> Calculadora</button></div>
          {calculatorTab === "tecido" ? <div className="fabric-calculator">
            <div className="fabric-rate"><Shirt size={20} /><span><small>RENDIMENTO PADRÃO</small><b>1 kg = 4,2 camisas</b></span></div>
            <div className="fabric-mode"><button className={fabricMode === "pieces" ? "active" : ""} onClick={() => setFabricMode("pieces")}>Quero produzir</button><button className={fabricMode === "kg" ? "active" : ""} onClick={() => setFabricMode("kg")}>Tenho tecido</button></div>
            <div className="supplier-selector"><small>SELECIONE O FORNECEDOR</small><div><button className={supplier === "Costa Rica" ? "active" : ""} onClick={() => setSupplier("Costa Rica")} aria-pressed={supplier === "Costa Rica"}>Costa Rica</button><button className={supplier === "Atual Têxtil" ? "active" : ""} onClick={() => setSupplier("Atual Têxtil")} aria-pressed={supplier === "Atual Têxtil"}>Atual Têxtil</button></div></div>
            <label>{fabricMode === "kg" ? "Quantidade de tecido (kg)" : "Quantidade de camisas"}<input type="number" min="0" step="0.1" value={fabricValue} onChange={(event) => setFabricValue(event.target.value)} /></label>
            <div className="fabric-row"><label>Margem de perda (%)<input type="number" min="0" max="90" step="1" value={waste} onChange={(event) => setWaste(event.target.value)} /></label><label>Preço por kg (R$)<input type="number" min="0" step="0.01" value={pricePerKg} onChange={(event) => setPricePerKg(event.target.value)} placeholder="Opcional" /></label></div>
            <div className="fabric-result"><small>{fabricMode === "kg" ? "PRODUÇÃO ESTIMADA" : "TECIDO NECESSÁRIO"}</small><strong>{fabricMode === "kg" ? `${estimatedPieces} camisas` : `${requiredKg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`}</strong><p>{numericWaste ? `Já considerando ${numericWaste}% de perda.` : "Cálculo com rendimento integral do tecido."}</p></div>
            {numericPrice > 0 && <div className="cost-result"><span>Custo estimado de tecido por camisa</span><b>{costPerPiece.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></div>}
            <button className="calculator-copy supplier-export" onClick={exportSupplierOrder} disabled={!numericFabricValue}><FilePlus2 size={16} /> Exportar pedido para o bloco de notas</button>
          </div> : <div className="general-calculator">
            <div className="calculator-display"><small>CONTA</small><strong>{expression || "0"}</strong>{calculatorError && <span>{calculatorError}</span>}</div>
            <div className="calculator-keys">{["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3", "=", "0", ","].map((key) => <button key={key} className={["÷", "×", "−", "+", "="].includes(key) ? "operator" : ""} onClick={() => { if (key === "C") { setExpression(""); setCalculatorError(""); } else if (key === "⌫") setExpression((current) => current.slice(0, -1)); else if (key === "=") calculate(); else { const value = key === "−" ? "-" : key; setExpression((current) => `${current}${value}`); setCalculatorError(""); } }}>{key}</button>)}</div>
          </div>}
        </aside>
      </div>}
    </div>
  );
}
