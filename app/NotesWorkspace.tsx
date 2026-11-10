"use client";

import { Archive, ArrowLeft, Bold, Calculator, Check, CheckCheck, CheckSquare, ChevronDown, Circle, Copy, Download, FilePlus2, FileText, Heading2, Layers, Link2, List, ListChecks, MoreHorizontal, NotebookPen, PanelLeft, Pin, Plus, Printer, Redo2, RotateCcw, Search, Trash2, Undo2, X } from "lucide-react";
import { getApps } from "firebase/app";
import { collection, doc, getFirestore, serverTimestamp, setDoc, updateDoc, runTransaction } from "firebase/firestore";
import { materialBinding, type MaterialSaveInput } from "./notes/material-binding";
import { customerNameKey } from "./finance-model";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { block, categories, currency, decimal, exportNote, makeId, millis, newDraft, plainText, readDocument, serializeDraft, supplierGroups, templates, toDraft, type BusinessNote, type NoteDraft, type NoteMaterial, type StoredNote, type TextBlock } from "./notes-model";
import { NoteSaveQueue, type Recovery, type SaveStatus } from "./notes-save-queue";
import NoteDialog from "./notes/NoteDialog";
import MobileNotesControls from "./notes/MobileNotesControls";
import MaterialCalculator from "./notes/MaterialCalculator";
import MaterialsWorkspace from "./notes/MaterialsWorkspace";
import "./notes/notes.css";
import ProductionChecklist from "./ProductionChecklist";
import { notePhotoOrderId } from "./order-photo-sync";
export type { BusinessNote, NoteMaterial } from "./notes-model";

type Props = { productionOnly?: boolean; uid: string; notes: BusinessNote[]; orders?: { id: string; customer: string; product: string; quantity?: number; dueDate?: string; photoData?: string }[]; customers?: { id: string; name: string }[]; initialNoteId?: string; materialsOpen: boolean; openMaterials: () => void; openTasks: () => void; openNote: (id?: string) => void; onCompleteMaterials: (id: string, materialIds: string[], completed: boolean) => Promise<void> };
type Filter = "all" | "pinned" | "archive" | "trash";
type Overlay = { draft: NoteDraft; time: number };
const recoveryKey = (uid: string) => `psyzon:notes:drafts:${uid}`;
const rawNote = (n: BusinessNote): StoredNote => ({ title: n.title, content: n.content, category: n.category, pinned: n.pinned, materials: n.materials || [], ...(typeof n.productionPhotoData === "string" ? { productionPhotoData: n.productionPhotoData } : {}) });
const labelDate = (value: number) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value) : "Agora";
// One client queue per signed-in user also protects rapid unmount/remount navigation.
type QueueEntry = { queue: NoteSaveQueue<StoredNote>; report?: (id: string, status: SaveStatus) => void; recover?: (id: string, value: StoredNote | null) => void };
const queues = new Map<string, QueueEntry>();

export default function NotesWorkspace({ productionOnly = false, uid, notes, orders = [], customers = [], initialNoteId = "", materialsOpen, openMaterials, openTasks, openNote, onCompleteMaterials }: Props) {
  const initialNote = notes.find(note => note.id === initialNoteId);
  const [selectedId, setSelectedId] = useState(initialNote?.id ?? "");
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({});
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [filter, setFilter] = useState<Filter>(() => initialNote && readDocument(initialNote.content).status === "archive" ? "archive" : "all");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [sidebar, setSidebar] = useState(!productionOnly);
  const [mobileEditor, setMobileEditor] = useState(Boolean(initialNote));
  const [modal, setModal] = useState<"new" | "export" | "link" | null>(null);
  const [calculator, setCalculator] = useState<NoteMaterial | "new" | null>(null);
  const [menu, setMenu] = useState(false);
  const [editorMode, setEditorMode] = useState<"text" | "production" | null>(null);
  const [activeBlock, setActiveBlock] = useState("");
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recoveries, setRecoveries] = useState<Record<string, Recovery<StoredNote>>>({});
  const [, refreshHistory] = useState(0);
  const alive = useRef(false), propsRef = useRef(notes), selectedRef = useRef(selectedId);
  const overlaysRef = useRef(overlays), queueRef = useRef<NoteSaveQueue<StoredNote> | null>(null);
  const baseline = useRef<Record<string, string>>({});
  const normalized = useRef(new Map<string, { signature: string; draft: NoteDraft }>());
  const draftFor = (note: BusinessNote) => {
    const signature = JSON.stringify(rawNote(note));
    const cached = normalized.current.get(note.id);
    if (cached?.signature === signature) return cached.draft;
    const draft = toDraft(note); normalized.current.set(note.id, { signature, draft }); return draft;
  };
  const history = useRef<Record<string, { undo: NoteDraft[]; redo: NoteDraft[]; typingAt: number }>>({});
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRef = useRef<HTMLDivElement>(null);
  propsRef.current = notes; selectedRef.current = selectedId; overlaysRef.current = overlays;
  const notify = (message: string) => { setNotice(message); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(""), 4500); };

  useEffect(() => {
    alive.current = true;
    const key = recoveryKey(uid);
    const readRecoveries = (): Record<string, Recovery<StoredNote>> => { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } };
    let entry = queues.get(uid);
    if (!entry) {
      const created: QueueEntry = { queue: undefined as unknown as NoteSaveQueue<StoredNote> };
      created.queue = new NoteSaveQueue<StoredNote>(
        async (id, value) => { await updateDoc(doc(getFirestore(getApps()[0]), "users", uid, "notes", id), { ...value, updatedAt: serverTimestamp() }); },
        (id, value) => created.recover?.(id, value),
        (id, status) => created.report?.(id, status),
      );
      entry = created; queues.set(uid, entry);
    }
    entry.recover = (id, value) => {
        try {
          const records = readRecoveries();
          if (value) records[id] = { value, base: baseline.current[id] || records[id]?.base || "", time: Date.now() };
          else delete records[id];
          if (Object.keys(records).length) localStorage.setItem(key, JSON.stringify(records)); else localStorage.removeItem(key);
        } catch { if (alive.current) setStorageError(true); }
      };
    entry.report = (id, status) => { if (alive.current) setStatuses(current => ({ ...current, [id]: status })); };
    const queue = entry.queue;
    const recovered = readRecoveries();
    const pending = queue.pendingValues();
    for (const item of pending) delete recovered[item.id];
    setRecoveries(recovered); setStatuses(queue.getStatuses());
    if (pending.length) setOverlays(current => ({ ...current, ...Object.fromEntries(pending.map(item => [item.id, { draft: toDraft({ id: item.id, ...item.value }), time: Date.now() }])) }));
    queueRef.current = queue;
    const flush = () => { void queue.flushAll(); };
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    const online = () => { void queue.flushAll(); };
    window.addEventListener("pagehide", flush); window.addEventListener("online", online); document.addEventListener("visibilitychange", visibility);
    return () => { alive.current = false; flush(); window.removeEventListener("pagehide", flush); window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visibility); clearTimeout(noticeTimer.current); };
  }, [uid]);

  const allNotes = useMemo(() => {
    const known = new Map(notes.map(n => [n.id, { id: n.id, draft: overlays[n.id]?.draft || draftFor(n), time: overlays[n.id]?.time || millis(n.updatedAt) }]));
    for (const [id, item] of Object.entries(overlays)) if (!known.has(id)) known.set(id, { id, ...item });
    return [...known.values()].sort((a, b) => Number(b.draft.pinned) - Number(a.draft.pinned) || (sort === "title" ? a.draft.title.localeCompare(b.draft.title, "pt-BR") : b.time - a.time));
  }, [notes, overlays, sort]);
  const visibleNotes = useMemo(() => allNotes.filter(n => {
    const status = n.draft.document.status;
    const inSection = filter === "trash" ? status === "trash" : filter === "archive" ? status === "archive" : status === "active" && (filter !== "pinned" || n.draft.pinned);
    const term = search.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const haystack = `${n.draft.title} ${plainText(n.draft)} ${n.draft.materials.map(m => `${m.supplier} ${m.fabricType} ${m.color} ${m.collarColor}`).join(" ")}`.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return inSection && (category === "Todas" || n.draft.category === category) && (!term || haystack.includes(term));
  }), [allNotes, filter, search, category]);
  useEffect(() => {
    if (!selectedId || !visibleNotes.some(n => n.id === selectedId)) setSelectedId(visibleNotes[0]?.id || "");
  }, [visibleNotes, selectedId]);
  // An acknowledged server snapshot can replace a local overlay. Never replace pending edits.
  useEffect(() => {
    setOverlays(current => {
      const next = { ...current }; let changed = false;
      for (const note of notes) {
        if (next[note.id] && !queueRef.current?.isPending(note.id) && JSON.stringify(rawNote(note)) === JSON.stringify(serializeDraft(next[note.id].draft))) { delete next[note.id]; changed = true; }
      }
      return changed ? next : current;
    });
  }, [notes, statuses]);
  const current = allNotes.find(n => n.id === selectedId);
  const draft = current?.draft;
  const linkedOrder = draft ? orders.find(order => order.id === notePhotoOrderId(draft.document, orders, customers)) : undefined;
  const changeProductionPhoto = async (photo: string) => {
    if (linkedOrder) await updateDoc(doc(getFirestore(getApps()[0]), "users", uid, "orders", linkedOrder.id), { photoData: photo });
    else change(d => ({ ...d, productionPhotoData: photo }));
  };
  const status = statuses[selectedId] || "saved";
  const purchasedIds = new Set(notes.find(note => note.id === selectedId)?.purchasedMaterialIds);
  const locked = draft?.document.status === "trash";
  const showChecklist = productionOnly || (editorMode ?? (draft?.document.productionChecklist ? "production" : "text")) === "production";
  const groups = supplierGroups(draft?.materials || []);
  const total = (draft?.materials || []).reduce((sum, m) => sum + m.totalCost, 0);

  const stage = (id: string, value: NoteDraft) => {
    const serialized = serializeDraft(value);
    if (serialized.title.length > 200 || serialized.content.length > 100000 || value.materials.length > 100) { notify("Limite da anotação atingido. Crie outra nota para continuar."); return; }
    if (!queueRef.current?.isPending(id)) {
      const remote = propsRef.current.find(n => n.id === id);
      baseline.current[id] = remote ? JSON.stringify(rawNote(remote)) : "";
    }
    const next = { ...overlaysRef.current, [id]: { draft: value, time: Date.now() } };
    overlaysRef.current = next; setOverlays(next); queueRef.current?.stage(id, serialized);
  };
  const change = (mutate: (draft: NoteDraft) => NoteDraft, typing = false) => {
    const id = selectedRef.current;
    const existing = overlaysRef.current[id]?.draft || (propsRef.current.find(n => n.id === id) ? draftFor(propsRef.current.find(n => n.id === id)!) : undefined);
    if (!existing) return;
    const next = mutate(existing);
    const h = history.current[id] ||= { undo: [], redo: [], typingAt: 0 };
    if (!typing || Date.now() - h.typingAt > 700) { h.undo.push(existing); if (h.undo.length > 40) h.undo.shift(); }
    h.redo = []; h.typingAt = typing ? Date.now() : 0;
    stage(id, next); refreshHistory(v => v + 1);
  };
  const undo = (redo = false) => {
    if (!draft || locked) return;
    const h = history.current[selectedId]; if (!h) return;
    const next = (redo ? h.redo : h.undo).pop(); if (!next) return;
    (redo ? h.undo : h.redo).push(draft); h.typingAt = 0;
    stage(selectedId, next); refreshHistory(v => v + 1);
  };
  const choose = (id: string) => { setEditorMode(null); if (selectedId) void queueRef.current?.flush(selectedId); setSelectedId(id); setMobileEditor(true); setCalculator(null); setMenu(false); setActiveBlock(""); };
  const section = (next: Filter) => { if (selectedId) void queueRef.current?.flush(selectedId); setFilter(next); setSearch(""); setCategory("Todas"); setMobileEditor(false); setCalculator(null); setMenu(false); };
  const create = async (templateIndex: number) => {
    if (creating) return;
    setCreating(true);
    try {
      if (selectedId) void queueRef.current?.flush(selectedId);
      const template = templates[templateIndex];
      const next = newDraft(templateIndex ? template.title : "Nova anotação"); next.category = template.category;
      if (template.lines.length) next.document = readDocument(template.lines.join("\n"));
      const id = makeId();
      await setDoc(doc(collection(getFirestore(getApps()[0]), "users", uid, "notes"), id), { ...serializeDraft(next), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      const updated = { ...overlaysRef.current, [id]: { draft: next, time: Date.now() } }; overlaysRef.current = updated; setOverlays(updated);
      setFilter("all"); setSearch(""); setCategory("Todas"); setSelectedId(id); setMobileEditor(true); setModal(null); setActiveBlock("");
    } catch { notify("Não foi possível criar a anotação. Confira a conexão e tente novamente."); }
    finally { setCreating(false); }
  };
  const changeBlock = (id: string, update: Partial<TextBlock>, typing = false) => change(d => ({ ...d, document: { ...d.document, blocks: d.document.blocks.map(b => b.id === id ? { ...b, ...update } : b) } }), typing);
  const addBlock = (type: TextBlock["type"] = "paragraph") => {
    const added = block("", type);
    change(d => { const index = d.document.blocks.findIndex(b => b.id === activeBlock); const next = [...d.document.blocks]; next.splice(index < 0 ? next.length : index + 1, 0, added); return { ...d, document: { ...d.document, blocks: next } }; });
    setActiveBlock(added.id);
    requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>(`[data-block-id="${added.id}"]`)?.focus());
  };
  const formatBlock = (type: TextBlock["type"] | "bold") => {
    const target = draft?.document.blocks.find(b => b.id === activeBlock);
    if (!target) { addBlock(type === "bold" ? "paragraph" : type); return; }
    changeBlock(target.id, type === "bold" ? { bold: !target.bold } : { type: target.type === type ? "paragraph" : type });
  };
  const recover = (id: string, useLocal: boolean) => {
    const record = recoveries[id];
    if (useLocal && record) { stage(id, toDraft({ id, ...record.value })); choose(id); notify("Rascunho recuperado. Salvando…"); }
    else { try { const records = JSON.parse(localStorage.getItem(recoveryKey(uid)) || "{}"); delete records[id]; localStorage.setItem(recoveryKey(uid), JSON.stringify(records)); } catch { setStorageError(true); } }
    setRecoveries(current => { const next = { ...current }; delete next[id]; return next; });
  };
  const copySupplier = async (supplier: string) => { if (!draft) return; try { await navigator.clipboard.writeText(exportNote(draft, { supplier, prices: true })); notify(`Pedido de ${supplier} copiado.`); } catch { notify("Não foi possível copiar. Use Exportar para selecionar o texto."); } };
  const activeCount = allNotes.filter(n => n.draft.document.status === "active").length;

  async function completeMaterials(id: string, materialIds: string[], completed: boolean) {
    const queue = queueRef.current;
    await queue?.flush(id);
    if (queue?.isPending(id)) throw new Error("A anotação ainda tem alterações pendentes. Salve antes de concluir a compra.");
    await onCompleteMaterials(id, materialIds, completed);
  }

  async function saveMaterial(input: MaterialSaveInput) {
    const binding = materialBinding(input.orderId,input.customerId,orders,customers);
    const id = input.noteId || makeId();
    await queueRef.current?.flush(id);
    if (queueRef.current?.isPending(id)) throw new Error("Há alterações pendentes nessa anotação. Aguarde o salvamento antes de continuar.");
    const reference = doc(getFirestore(getApps()[0]), "users", uid, "notes", id);
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const snapshot = await transaction.get(reference);
      if (input.noteId && !snapshot.exists()) throw new Error("O planejamento foi removido. Atualize a lista.");
      const stored = snapshot.exists() ? snapshot.data() as BusinessNote : undefined;
      const next = stored ? toDraft({ ...stored, id }) : newDraft(input.title);
      if (next.document.status === "trash") throw new Error("Restaure a anotação antes de alterar seus materiais.");
      if (input.material) {
        if (stored?.purchasedMaterialIds?.includes(input.material.id)) throw new Error("Reabra a compra antes de editar um material concluído. O histórico da compra foi preservado.");
        const index = next.materials.findIndex(material => material.id === input.material!.id);
        if (index < 0 && next.materials.length >= 100) throw new Error("Este planejamento já tem 100 materiais.");
        if (index < 0) next.materials.push(input.material); else next.materials[index] = input.material;
      }
      next.title = input.title;
      if (!stored) next.category = "Compras";
      next.document = { ...next.document, ...binding };
      const serialized = serializeDraft(next);
      if (serialized.content.length > 100000) throw new Error("A anotação atingiu o limite. Crie outro planejamento.");
      if (stored) transaction.update(reference, { ...serialized, updatedAt: serverTimestamp() });
      else transaction.set(reference, { ...serialized, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    if (!queueRef.current?.isPending(id)) { const next = { ...overlaysRef.current }; delete next[id]; overlaysRef.current = next; setOverlays(next); }
  }

  if (materialsOpen) {
    const purchases = new Map(notes.map(note => [note.id, note.purchasedMaterialIds]));
    const clientByOrder = new Map(orders.map(order => [order.id, order.customer]));
    const clientById = new Map(customers.map(customer => [customer.id, customer.name]));
    const materialOrders = allNotes.filter(note => note.draft.materials.length && note.draft.document.status !== "trash").map(({ id, draft: note }) => ({
      id, title: note.title || "Anotação sem título", materials: note.materials, purchasedIds: purchases.get(id),
      client: clientByOrder.get(note.document.orderId) || clientById.get(note.document.customerId) || "",
    }));
    return <MaterialsWorkspace uid={uid} targets={allNotes.filter(note => note.draft.document.status !== "trash").map(({id,draft}) => ({ id,title:draft.title || "Sem título",orderId:draft.document.orderId,customerId:draft.document.customerId,materials:draft.materials }))} productionOrders={orders} customers={customers} saveMaterial={saveMaterial} orders={materialOrders} back={() => openNote()} openNote={openNote} complete={completeMaterials} />;
  }

  return <div className={`apple-notes ${showChecklist ? "an-production-mode" : ""} ${sidebar ? "" : "an-sidebar-hidden"} ${mobileEditor ? "an-mobile-editor" : ""} ${calculator ? "an-has-calculator" : ""}`}>
    {productionOnly && <p className="production-window-save" role="status">{status === "saved" ? "Salvo" : status === "saving" ? "Salvando…" : status === "error" ? "Falha ao salvar. Seu rascunho foi preservado." : "Alterações pendentes"}</p>}<aside className="an-list-panel" aria-label="Lista de anotações">
      <MobileNotesControls section={filter} counts={{ all: activeCount, pinned: allNotes.filter(n => n.draft.document.status === "active" && n.draft.pinned).length, archive: allNotes.filter(n => n.draft.document.status === "archive").length, trash: allNotes.filter(n => n.draft.document.status === "trash").length }} search={search} category={category} sort={sort} onSection={section} onSearch={setSearch} onCategory={setCategory} onSort={setSort} onCreate={() => setModal("new")} />
      <header><h1>Anotações</h1><button className="an-icon blue" onClick={() => setModal("new")} aria-label="Nova anotação" title="Nova anotação"><FilePlus2 size={21} /></button></header>
      <div className="an-search"><Search size={17} /><input aria-label="Buscar anotações" placeholder="Buscar" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌕</kbd></div>
      <div className="an-segment"><button aria-pressed={filter === "all"} onClick={() => section("all")}>Todas <span>{activeCount}</span></button><button aria-pressed={filter === "pinned"} onClick={() => section("pinned")}><Pin size={13} /> Fixadas</button></div>

      <div className="an-list-filters"><select aria-label="Filtrar por categoria" value={category} onChange={e => setCategory(e.target.value)}><option>Todas</option>{categories.map(c => <option key={c}>{c}</option>)}</select><select aria-label="Ordenar anotações" value={sort} onChange={e => setSort(e.target.value as "recent" | "title")}><option value="recent">Recentes</option><option value="title">Título A–Z</option></select></div>
      <div className="an-note-list"><h2>{filter === "trash" ? "Lixeira" : filter === "archive" ? "Arquivo" : filter === "pinned" ? "Fixadas" : "Suas anotações"}<span>{visibleNotes.length}</span></h2>{visibleNotes.map(note => <button className={`an-note-row ${selectedId === note.id ? "selected" : ""}`} key={note.id} aria-current={selectedId === note.id ? "page" : undefined} onClick={() => choose(note.id)}><span className="an-note-row-title">{note.draft.title || "Sem título"}{note.draft.pinned && <Pin size={12} />}</span><span className="an-preview">{plainText(note.draft).trim() || note.draft.materials.map(m => `${m.fabricType} · ${m.color}`).join(", ") || "Anotação vazia"}</span><small>{labelDate(note.time)} <span>· {note.draft.category}</span></small></button>)}{!visibleNotes.length && <div className="an-list-empty"><NotebookPen size={24} /><p>{search ? "Nenhuma anotação encontrada." : filter === "trash" ? "A lixeira está vazia." : "Nenhuma anotação por aqui."}</p>{filter === "all" && <button className="an-link" onClick={() => setModal("new")}>Criar anotação</button>}</div>}</div>
      <footer><button className={filter === "archive" ? "selected" : ""} onClick={() => section("archive")}><Archive size={17} />Arquivo<span>{allNotes.filter(n => n.draft.document.status === "archive").length || ""}</span></button><button className={filter === "trash" ? "selected" : ""} onClick={() => section("trash")}><Trash2 size={17} />Lixeira<span>{allNotes.filter(n => n.draft.document.status === "trash").length || ""}</span></button></footer>
    </aside>
    <section className="an-editor-panel" aria-label="Editor da anotação">
      <header className="an-editor-topbar"><div><button className="an-icon an-mobile-back" aria-label="Voltar às anotações" onClick={() => { setMobileEditor(false); void queueRef.current?.flushAll(); }}><ArrowLeft size={19} /></button><button className="an-icon an-desktop-toggle" aria-label={sidebar ? "Recolher lista de notas" : "Mostrar lista de notas"} onClick={() => setSidebar(!sidebar)}><PanelLeft size={19} /></button><button className="an-icon" onClick={openMaterials} aria-label="Abrir página Materiais" title="Materiais"><Layers size={17} /></button><span className="an-breadcrumb">Anotações <span>›</span> <b>{draft?.category || "Todas"}</b></span></div><div>{draft && <><span className={`an-save-status ${status}`} role="status"><i />{status === "saved" ? "Salvo" : status === "saving" ? "Salvando…" : "Falha ao salvar"}</span>{status === "error" && <button className="an-link" onClick={() => { setStatuses(v => ({ ...v, [selectedId]: "saving" })); void queueRef.current?.flush(selectedId); }}>Tentar novamente</button>}<button className="an-icon" onClick={() => setModal("export")} aria-label="Exportar anotação" title="Exportar"><Download size={19} /></button><div className="an-menu-wrap"><button className="an-icon" onClick={() => setMenu(!menu)} aria-label="Mais ações da anotação" aria-expanded={menu}><MoreHorizontal size={21} /></button>{menu && <><button className="an-menu-dismiss" aria-label="Fechar menu" onClick={() => setMenu(false)} /><div className="an-menu">{!locked && <><button onClick={() => { change(d => ({ ...d, pinned: !d.pinned })); setMenu(false); }}><Pin size={16} />{draft.pinned ? "Desafixar" : "Fixar anotação"}</button><button onClick={() => { change(d => ({ ...d, document: { ...d.document, status: d.document.status === "archive" ? "active" : "archive" } })); setMenu(false); }}><Archive size={16} />{draft.document.status === "archive" ? "Desarquivar" : "Arquivar"}</button><button onClick={() => { setModal("link"); setMenu(false); }}><Link2 size={16} />Vincular cliente ou pedido</button><button className="danger" onClick={() => { change(d => ({ ...d, document: { ...d.document, status: "trash" } })); setMenu(false); notify("Anotação movida para a lixeira. Você pode restaurá-la."); }}><Trash2 size={16} />Mover para a lixeira</button></>}{locked && <button onClick={() => change(d => ({ ...d, document: { ...d.document, status: "active" } }))}><RotateCcw size={16} />Restaurar anotação</button>}</div></>}</div></>}</div></header>
      {storageError && <div className="an-banner error" role="alert">O navegador não conseguiu guardar o rascunho local. Aguarde a confirmação “Salvo” antes de fechar.</div>}
      {Object.entries(recoveries).map(([id, record]) => { const remote = notes.find(n => n.id === id); const conflict = remote && record.base && JSON.stringify(rawNote(remote)) !== record.base; return <div className="an-banner" role="status" key={id}><span><b>Rascunho disponível: {record.value.title || "Sem título"}</b><small>{conflict ? "A versão online também mudou. Escolha qual conteúdo manter." : "Uma edição anterior ficou pendente de salvamento."}</small></span><button onClick={() => recover(id, true)}>Recuperar rascunho</button><button onClick={() => recover(id, false)}>Manter versão online</button></div>; })}
      {draft ? <div className="an-document-scroll" ref={editorRef}><article className="an-document" key={selectedId}>
        {locked && <div className="an-banner"><span>Esta anotação está na lixeira.</span><button onClick={() => change(d => ({ ...d, document: { ...d.document, status: "active" } }))}>Restaurar</button></div>}
        <p className="an-document-date">{current?.time ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(current.time) : "Nova anotação"}</p>
        <input className="an-title" aria-label="Título da anotação" maxLength={200} placeholder="Sem título" value={draft.title} disabled={locked} onChange={e => change(d => ({ ...d, title: e.target.value }), true)} />
        <div className="an-properties"><label className="an-category"><select aria-label="Categoria da anotação" value={draft.category} disabled={locked} onChange={e => change(d => ({ ...d, category: e.target.value as NoteDraft["category"] }))}>{categories.map(c => <option key={c}>{c}</option>)}</select><ChevronDown size={12} /></label><button className="an-property-link" disabled={locked} onClick={() => setModal("link")}><Link2 size={13} />{orders.find(o => o.id === draft.document.orderId)?.customer || customers.find(c => c.id === draft.document.customerId)?.name || (draft.document.orderId ? "Pedido vinculado" : draft.document.customerId ? "Cliente vinculado" : "Vincular pedido")}</button>{draft.pinned && <Pin size={13} />}</div>
        {!locked && <div className="an-editor-modes"><button className={!showChecklist ? "active" : ""} onClick={() => setEditorMode("text")}>Texto e materiais</button><button className={showChecklist ? "active" : ""} onClick={() => setEditorMode("production")}>Checklist de produção</button></div>}
        {showChecklist && !locked && <ProductionChecklist key={selectedId} title={draft.title} source={plainText(draft)} value={draft.document.productionChecklist} photoData={linkedOrder ? linkedOrder.photoData : draft.productionPhotoData} linkedPhotoData={linkedOrder?.photoData} linkedProduct={linkedOrder?.product} linkedDeadline={linkedOrder?.dueDate} manualColor={draft.document.productionShirtColor} onColorChange={productionShirtColor => change(d => ({ ...d, document: { ...d.document, productionShirtColor } }))} onPhotoChange={changeProductionPhoto} onChange={productionChecklist => change(d => ({ ...d, category: productionChecklist ? "Produção" : d.category, document: { ...d.document, productionChecklist } }))} />}
        {!locked && <div className="an-format-toolbar" role="toolbar" aria-label="Formatação da anotação"><button className="an-icon" title="Negrito (Ctrl+B)" aria-label="Negrito" aria-pressed={!!draft.document.blocks.find(b => b.id === activeBlock)?.bold} onMouseDown={e => e.preventDefault()} onClick={() => formatBlock("bold")}><Bold size={18} /></button><button className="an-icon" title="Título" aria-label="Título de seção" onMouseDown={e => e.preventDefault()} onClick={() => formatBlock("heading")}><Heading2 size={19} /></button><button className="an-icon" title="Lista" aria-label="Lista" onMouseDown={e => e.preventDefault()} onClick={() => formatBlock("bullet")}><List size={19} /></button><button className="an-icon" title="Checklist" aria-label="Checklist" onMouseDown={e => e.preventDefault()} onClick={() => formatBlock("check")}><CheckSquare size={18} /></button><span /><button className="an-icon" disabled={!history.current[selectedId]?.undo.length} aria-label="Desfazer" onClick={() => undo()}><Undo2 size={17} /></button><button className="an-icon" disabled={!history.current[selectedId]?.redo.length} aria-label="Refazer" onClick={() => undo(true)}><Redo2 size={17} /></button><button className="an-add-material" onClick={() => setCalculator("new")}><Plus size={17} />Material</button></div>}
        <div className={`an-blocks ${locked ? "readonly" : ""}`} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); formatBlock("bold"); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey); } }}>
          {draft.document.blocks.map((b, index) => <div className={`an-text-block ${b.type} ${b.done ? "done" : ""} ${b.bold ? "bold" : ""}`} key={b.id}>{b.type === "check" ? <button className="an-check-circle" role="checkbox" aria-checked={!!b.done} aria-label={`Concluir: ${b.text || "tarefa"}`} disabled={locked} onClick={() => changeBlock(b.id, { done: !b.done })}>{b.done ? <Check size={13} /> : null}</button> : b.type === "bullet" ? <span className="an-bullet">•</span> : null}<EditableBlock value={b.text} id={b.id} readOnly={locked} placeholder={index === 0 ? "Comece a escrever…" : ""} onFocus={() => setActiveBlock(b.id)} onChange={text => changeBlock(b.id, { text }, true)} onEnter={(before, after) => { setActiveBlock(b.id); const added = block(after, b.type === "heading" ? "paragraph" : b.type); change(d => { const blocks = d.document.blocks.map(item => item.id === b.id ? { ...item, text: before } : item); blocks.splice(index + 1, 0, added); return { ...d, document: { ...d.document, blocks } }; }); requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>(`[data-block-id="${added.id}"]`)?.focus()); }} onRemoveEmpty={() => { if (draft.document.blocks.length <= 1 || b.text) return; change(d => ({ ...d, document: { ...d.document, blocks: d.document.blocks.filter(v => v.id !== b.id) } })); const previous = draft.document.blocks[Math.max(0, index - 1)]; requestAnimationFrame(() => editorRef.current?.querySelector<HTMLElement>(`[data-block-id="${previous.id}"]`)?.focus()); }} /></div>)}
        </div>
        {!locked && <button className="an-new-line" onClick={() => addBlock()}><Plus size={14} />Adicionar linha</button>}
        {!!draft.materials.length && <section className="an-materials" aria-label="Materiais da anotação"><header><h2>Materiais</h2><span>{draft.materials.length} {draft.materials.length === 1 ? "item" : "itens"}</span></header>{groups.map(group => <div className="an-supplier" key={group.supplier}><h3>{group.supplier}</h3>{group.materials.map(material => <div className="an-material" key={material.id}><div className="an-material-info"><span className="an-material-mark"><Circle size={16} /></span><div><b>Malha {material.fabricType}</b><small>{material.color} · {decimal(material.fabricKg)} kg</small><small>{material.collarType === "common" ? `Ribana · ${material.collarColor || material.color} · ${decimal(material.ribanaKg)} kg` : `Gola polo + punho · ${material.collarColor || material.color} · ${material.poloUnits} conjuntos`}</small></div></div><div className="an-material-right"><b>{currency(material.totalCost)}</b>{!locked && <div><button aria-label={`Editar material ${material.color}`} title={purchasedIds.has(material.id) ? "Reabra a compra em Materiais antes de editar" : "Editar material"} disabled={purchasedIds.has(material.id)} onClick={() => setCalculator(material)}>Editar</button><button aria-label={`Duplicar material ${material.color}`} title="Duplicar material" onClick={() => change(d => ({ ...d, materials: [...d.materials, { ...material, id: makeId() }] }))}><Copy size={14} /></button><button className="danger" aria-label={`Remover material ${material.color}`} title="Reabra a compra em Materiais antes de remover um item concluído" disabled={purchasedIds.has(material.id)} onClick={() => change(d => ({ ...d, materials: d.materials.filter(m => m.id !== material.id) }))}><X size={15} /></button></div>}</div></div>)}<div className="an-supplier-total"><span>Subtotal · {group.supplier}</span><b>{currency(group.materials.reduce((sum, m) => sum + m.totalCost, 0))}</b></div><button className="an-link" onClick={() => copySupplier(group.supplier)}><Copy size={15} />Copiar pedido deste fornecedor</button></div>)}<div className="an-material-grand-total"><div><b>Total de materiais</b><small>Estimativa de compra</small></div><strong>{currency(total)}</strong></div></section>}
        {!locked && !draft.materials.length && <button className="an-material-empty" onClick={() => setCalculator("new")}><Calculator size={18} /><span><b>Planejar materiais</b><small>Calcule tecido, ribana e conjuntos polo nesta anotação.</small></span><Plus size={17} /></button>}
        <footer className="an-document-footer"><span>{draft.materials.length} {draft.materials.length === 1 ? "material" : "materiais"} · {groups.length} {groups.length === 1 ? "fornecedor" : "fornecedores"}</span>{!locked && <button onClick={() => setCalculator("new")}><Calculator size={16} />Calculadora</button>}</footer>
      </article></div> : <div className="an-empty-document"><NotebookPen size={40} strokeWidth={1.2} /><h2>{filter === "trash" ? "Lixeira vazia" : "Um espaço para suas ideias"}</h2><p>{filter === "trash" ? "As anotações excluídas ficam aqui para restauração." : "Organize compras, produção e clientes em um só lugar."}</p><button className="an-primary" onClick={() => setModal("new")}><Plus size={17} />Nova anotação</button></div>}
    </section>
    {calculator && <MaterialCalculator key={typeof calculator === "string" ? "new" : calculator.id} uid={uid} initialQuantity={linkedOrder?.quantity} material={typeof calculator === "string" ? undefined : calculator} close={() => setCalculator(null)} add={material => { if (purchasedIds.has(material.id)) { notify("Reabra a compra em Materiais antes de editar um item concluído."); return; } change(d => ({ ...d, materials: d.materials.some(m => m.id === material.id) ? d.materials.map(m => m.id === material.id ? material : m) : [...d.materials, material] })); setCalculator(null); notify("Material atualizado."); }} />}
    {notice && <div className="an-toast" role="status"><CheckCheck size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={15} /></button></div>}
    {modal === "new" && <NoteDialog title="Nova anotação" close={() => { if (!creating) setModal(null); }}><p className="an-dialog-description">Comece em branco ou escolha um modelo da confecção.</p><div className="an-templates">{templates.map((template, index) => <button key={template.title} disabled={creating} onClick={() => create(index)}><span><FileText size={21} /></span><div><b>{template.title}</b><small>{index ? template.category : "Texto livre, listas e ideias"}</small></div><Plus size={17} /></button>)}</div>{creating && <p className="an-dialog-description" role="status">Criando anotação…</p>}</NoteDialog>}
    {modal === "export" && draft && <ExportDialog draft={draft} close={() => setModal(null)} notify={notify} />}
    {modal === "link" && draft && <NoteDialog title="Vincular à anotação" close={() => setModal(null)}><div className="an-link-form"><label>Pedido<select aria-label="Pedido" value={draft.document.orderId} onChange={e => change(d => ({ ...d, document: { ...d.document, orderId: e.target.value, customerId: customers.find(customer => customerNameKey(customer.name) === customerNameKey(orders.find(order => order.id === e.target.value)?.customer ?? ""))?.id ?? "" } }))}><option value="">Sem pedido vinculado</option>{orders.map(o => <option key={o.id} value={o.id}>{o.customer} · {o.product}</option>)}</select></label><label>Cliente<select aria-label="Cliente" value={draft.document.customerId} onChange={e => change(d => ({ ...d, document: { ...d.document, customerId: e.target.value, orderId: orders.find(order => order.id === d.document.orderId && customerNameKey(order.customer) === customerNameKey(customers.find(customer => customer.id === e.target.value)?.name ?? ""))?.id ?? "" } }))}><option value="">Sem cliente vinculado</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p className="an-help">O vínculo organiza a anotação. Os valores permanecem como estimativa de materiais.</p><button className="an-primary" onClick={() => setModal(null)}>Concluir</button></div></NoteDialog>}
  </div>;
}

function EditableBlock({ value, id, readOnly, placeholder, onChange, onFocus, onEnter, onRemoveEmpty }: { value: string; id: string; readOnly?: boolean; placeholder: string; onChange: (value: string) => void; onFocus: () => void; onEnter: (before: string, after: string) => void; onRemoveEmpty: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerText !== value) ref.current.textContent = value; }, [value]);
  const paste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault(); const text = e.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (selection?.rangeCount && ref.current?.contains(selection.anchorNode)) { const range = selection.getRangeAt(0); range.deleteContents(); const node = document.createTextNode(text); range.insertNode(node); range.setStartAfter(node); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); onChange(ref.current.innerText); }
  };
  return <div ref={ref} data-block-id={id} className="an-editable" role="textbox" aria-label="Texto da anotação" aria-multiline="true" aria-readonly={!!readOnly} contentEditable={!readOnly} suppressContentEditableWarning data-placeholder={placeholder} onFocus={onFocus} onInput={e => onChange(e.currentTarget.innerText)} onPaste={paste} onKeyDown={e => { if (readOnly) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const selection = window.getSelection(); const range = selection?.rangeCount ? selection.getRangeAt(0) : null; if (range && ref.current?.contains(range.startContainer)) { const before = range.cloneRange(); before.selectNodeContents(ref.current); before.setEnd(range.startContainer, range.startOffset); const after = range.cloneRange(); after.selectNodeContents(ref.current); after.setStart(range.endContainer, range.endOffset); onEnter(before.toString(), after.toString()); } else onEnter(value, ""); } if (e.key === "Backspace" && !e.currentTarget.innerText) { e.preventDefault(); onRemoveEmpty(); } }} />;
}

function ExportDialog({ draft, close, notify }: { draft: NoteDraft; close: () => void; notify: (text: string) => void }) {
  const [prices, setPrices] = useState(false), [supplier, setSupplier] = useState("");
  const text = exportNote(draft, { prices, ...(supplier ? { supplier } : {}) });
  const printRef = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => () => { printRef.current?.remove(); }, []);
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${(draft.title || "anotacao").replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 100) || "anotacao"}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify("TXT exportado.");
  };
  const print = () => {
    printRef.current?.remove();
    const frame = document.createElement("iframe"); frame.title = "Impressão da anotação"; frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); };
    frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Anotação Psyzon</title><style>@page{size:A4;margin:18mm}body{font:14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><pre>${escaped}</pre></body></html>`;
    document.body.appendChild(frame); printRef.current = frame;
  };
  return <NoteDialog title="Exportar anotação" close={close} wide><div className="an-export-options"><label>Conteúdo<select value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">Anotação completa</option>{supplierGroups(draft.materials).map(g => <option key={g.supplier} value={g.supplier}>Pedido · {g.supplier}</option>)}</select></label><label className="an-check-label"><input type="checkbox" checked={prices} onChange={e => setPrices(e.target.checked)} />Incluir valores dos materiais</label><p className="an-help">A prévia abaixo mostra exatamente o conteúdo exportado. As observações são preservadas.</p></div><textarea className="an-export-preview" aria-label="Prévia da exportação" readOnly value={text} /><footer className="an-export-actions"><button onClick={async () => { try { await navigator.clipboard.writeText(text); notify("Conteúdo copiado."); } catch { notify("Selecione o texto da prévia para copiar."); } }}><Copy size={16} />Copiar</button><button onClick={download}><Download size={16} />Baixar TXT</button><button className="an-primary" onClick={print}><Printer size={16} />PDF / Imprimir</button></footer></NoteDialog>;
}
