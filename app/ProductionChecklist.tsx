"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardList, Plus, Printer, Sparkles, X } from "lucide-react";
import { getAuth } from "firebase/auth";
import Modal from "./Modal";
import { makeId } from "./notes-model";
import "./checklist-entry.css";
import "./checklist-layout.css";
import ProductionSheets from "./ProductionSheets";
import ChecklistPieces from "./ChecklistPieces";
import OrderPhotoField from "./OrderPhotoField";
import { parseProductionOrder, sampleProductionOrder, sortProductionRows, validateProductionChecklist, type ProductionChecklist as Checklist, type ProductionRow } from "./production-checklist";
import { defaultProductionColor, productionColorFromNotes, productionColorFromProduct, productionColorInk, validProductionColor } from "./production-theme";

export default function ProductionChecklist({ value, title, source, photoData, linkedPhotoData, linkedProduct, manualColor, onColorChange, onPhotoChange, onChange }: { value?: Checklist | null; title: string; source: string; photoData?: string; linkedPhotoData?: string; linkedProduct?: string; manualColor?: string; onColorChange: (color: string) => void; onPhotoChange: (photo: string) => void; onChange: (value: Checklist | null) => void }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [raw, setRaw] = useState(source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const rows = value ? sortProductionRows(value.rows) : [];
  const productPhoto = photoData ?? linkedPhotoData ?? "";
  const automatic = productionColorFromNotes(value?.notes ?? "") ?? productionColorFromNotes(source) ?? productionColorFromProduct(linkedProduct ?? "") ?? productionColorFromNotes(title);
  const customized = validProductionColor(manualColor);
  const color = customized ? manualColor : automatic?.hex ?? defaultProductionColor;
  const theme = { "--sheet-accent": color, "--sheet-on-accent": productionColorInk(color) } as CSSProperties;
  const print = async () => {
    try {
      await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".production-print-root img")).map(image => image.decode()));
      window.print();
    } catch { setError("Não foi possível preparar a foto para impressão. Tente anexá-la novamente."); }
  };
  const updateRow = (id: string, patch: Partial<ProductionRow>) => value && onChange({ ...value, rows: sortProductionRows(value.rows.map((row) => row.id === id ? { ...row, ...patch } : row)) });
  const organize = async (ai: boolean) => {
    setBusy(true); setError("");
    try {
      let result: Checklist;
      if (ai) {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) throw new Error("Entre novamente para organizar com IA.");
        const response = await fetch("/api/production-checklist", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ text: raw }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível organizar com IA.");
        result = validateProductionChecklist(data.checklist);
      } else result = parseProductionOrder(raw);
      const importedColor = productionColorFromNotes(raw);
      if (importedColor && !productionColorFromNotes(result.notes)) {
        result.notes = [`Cor da camisa: ${importedColor.label}`, result.notes].filter(Boolean).join("\n").slice(0, 4000);
      }
      onChange({ ...result, client: result.client || value?.client || title, deadline: result.deadline || value?.deadline || "" });
      setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível organizar a lista."); }
    finally { setBusy(false); }
  };
  return <section className="production-checklist">
    <div className="checklist-toolbar"><div><ClipboardList size={18} /><b>Checklist de produção</b>{value && <span>{value.rows.length} peças · {value.rows.filter((row) => row.done).length} conferidas</span>}</div><div><button className="secondary" onClick={() => { setRaw(source); setError(""); setOpen(true); }}>{value ? "Colar outra lista" : "Colar pedido"}</button>{value && <button className="primary" disabled={photoBusy} onClick={() => void print()}><Printer size={16} /> PDF / Imprimir A4</button>}</div></div>
    <div className="checklist-setup"><div className="checklist-product-photo"><OrderPhotoField label="Foto do produto no PDF" value={productPhoto} onPhotoChange={onPhotoChange} includeFormField={false} onBusyChange={setPhotoBusy} />{linkedPhotoData && linkedPhotoData !== productPhoto && <button className="secondary" disabled={photoBusy} onClick={() => onPhotoChange(linkedPhotoData)}>Usar foto do pedido vinculado</button>}<p className="form-help">A foto aparece no cabeçalho do PDF. Você pode trocar ou remover quando quiser.</p></div>{value && <section className="checklist-order-details" aria-label="Dados para produção"><h3>Dados para produção</h3><div className="checklist-meta"><label>Cliente / pedido<input value={value.client} maxLength={120} onChange={(event) => onChange({ ...value, client: event.target.value })} /></label><label>Entrega<input type="date" value={value.deadline} onChange={(event) => onChange({ ...value, deadline: event.target.value })} /></label></div><div className="checklist-theme"><label>Cor da camisa no PDF<input type="color" value={color} onChange={event => onColorChange(event.target.value)} /></label><span>{customized ? "Cor personalizada" : automatic ? automatic.label : "Azul padrão"}</span>{customized && <button className="secondary" type="button" onClick={() => onColorChange("")}>Usar cor automática</button>}</div><label className="checklist-observations">Atenção na produção<textarea value={value.notes} maxLength={4000} rows={3} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="Cor, tecido, estampa, medidas especiais…" /></label></section>}</div>
    {error && !open && <p className="form-error" role="alert">{error}</p>}
    {!value && <p className="form-help">Cole a mensagem do cliente. A lista fica separada por modelo e tamanho, com uma marcação por peça.</p>}
    {value && <>{value.warnings.length > 0 && <div className="checklist-warnings" role="status">{value.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}<ChecklistPieces rows={rows} onUpdate={updateRow} onRemove={id => onChange({ ...value, rows: sortProductionRows(value.rows.filter(item => item.id !== id)) })} /><div className="checklist-footer"><button className="secondary" disabled={value.rows.length >= 500} onClick={() => setAdding(true)}><Plus size={15} /> Adicionar peça</button><button className="secondary" onClick={() => { if (window.confirm("Remover o checklist desta anotação?")) onChange(null); }}>Remover checklist</button></div><p className="form-help">Os tamanhos são organizados automaticamente em ordem crescente dentro de cada modelo. Confira nomes e quantidades antes de imprimir. Use “Salvar como PDF” na janela de impressão.</p>{typeof document !== "undefined" && createPortal(<div className="production-print-root" style={theme}><ProductionSheets checklist={value} photoData={productPhoto} /></div>, document.body)}</>}
    {adding && value && <AddPieceDialog models={[...new Set(rows.map(row => row.model))]} defaultModel="Masculina" close={() => setAdding(false)} add={specification => {
      if (value.rows.length >= 500) return "O checklist já atingiu o limite de 500 peças.";
      onChange({ ...value, rows: sortProductionRows([...value.rows, { ...specification, id: makeId(), done: false }]) });
      setAdding(false);
    }} />}
    {open && <Modal titleId="checklist-title" busy={busy} close={() => setOpen(false)}><header><h2 id="checklist-title">Organizar pedido</h2><button disabled={busy} onClick={() => setOpen(false)} aria-label="Fechar"><X size={20} /></button></header><div className="checklist-import"><p>Cole o pedido recebido no WhatsApp. Você poderá corrigir a lista antes de imprimir.</p><label>Lista do pedido<textarea value={raw} maxLength={30000} rows={16} onChange={(event) => setRaw(event.target.value)} placeholder="MASCULINA - 8 UNIDADES…" /></label><button className="secondary" disabled={busy} onClick={() => setRaw(sampleProductionOrder)}>Usar exemplo JERFESSON</button>{value && <p className="form-help">Ao organizar outra lista, o checklist atual será substituído.</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy || !raw.trim()} onClick={() => void organize(false)}><Check size={16} /> Organizar lista</button><button className="secondary" disabled={busy || !raw.trim()} onClick={() => void organize(true)}><Sparkles size={16} />{busy ? "Organizando…" : "Organizar com IA"}</button><p className="form-help">A organização por IA usa apenas o texto colado e pede sua revisão. Sem modelo informado, usamos Masculina. Feminina e outros modelos só são separados quando indicados na lista. A organização padrão funciona sem IA.</p></div></Modal>}
  </section>;
}


function AddPieceDialog({ models, defaultModel, close, add }: { models: string[]; defaultModel: string; close: () => void; add: (specification: Pick<ProductionRow, "model" | "size" | "name">) => string | void }) {
  const [unnamed, setUnnamed] = useState(false);
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const model = String(form.get("model") ?? "").trim();
    const size = String(form.get("size") ?? "").trim();
    const name = unnamed ? "Sem nome" : String(form.get("name") ?? "").trim();
    if (!model || !size || !name) return setError("Preencha o modelo, o tamanho e o nome, ou marque a opção de peça sem nome.");
    setError(add({ model, size, name }) || "");
  };
  return <Modal titleId="add-piece-title" busy={false} close={close}>
    <header><h2 id="add-piece-title">Adicionar peça</h2><button type="button" onClick={close} aria-label="Fechar especificações da peça"><X size={20} /></button></header>
    <form className="checklist-entry-form" onSubmit={submit}>
      <p>Preencha as especificações. A peça entra na lista ao confirmar.</p>
      <label>Modelo<input name="model" list="checklist-model-options" defaultValue={defaultModel} required maxLength={80} data-initial-focus placeholder="Ex.: Masculina, feminina ou infantil" /></label>
      <datalist id="checklist-model-options">{[...new Set([...models, "Masculina", "Feminina", "Infantil", "Unissex"])].map(model => <option key={model} value={model} />)}</datalist>
      <label>Tamanho<input name="size" list="checklist-size-options" required maxLength={40} placeholder="Ex.: P, M, G, 10 anos ou sob medida" /></label>
      <datalist id="checklist-size-options">{["PP", "P", "M", "G", "GG", "XGG", "G1", "G2", "Sob medida"].map(size => <option key={size} value={size} />)}</datalist>
      <label>Nome na peça<input name="name" required={!unnamed} disabled={unnamed} maxLength={160} placeholder={unnamed ? "Sem nome" : "Digite o nome que será estampado"} /></label>
      <label className="checklist-entry-unnamed"><input type="checkbox" checked={unnamed} onChange={event => setUnnamed(event.target.checked)} /> Peça sem nome</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary"><Plus size={16} /> Adicionar ao checklist</button></footer>
    </form>
  </Modal>;
}
