"use client";

import Image from "next/image";
import { useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, ChevronRight, Plus, Printer, Sparkles, TriangleAlert, X } from "lucide-react";
import { getAuth } from "firebase/auth";
import Modal from "./Modal";
import { makeId } from "./notes-model";
import "./checklist-entry.css";
import "./checklist-layout.css";
import ProductionSheets from "./ProductionSheets";
import ChecklistPieces from "./ChecklistPieces";
import PdfDownloadButton from "./PdfDownloadButton";
import OrderPhotoField from "./OrderPhotoField";
import { parseProductionOrder, sampleProductionOrder, sortProductionRows, validateProductionChecklist, type ProductionChecklist as Checklist, type ProductionRow } from "./production-checklist";
import { defaultProductionColor, productionColorFromNotes, productionColorFromProduct, productionColorInk, validProductionColor } from "./production-theme";

export default function ProductionChecklist({ value, title, source, photoData, linkedPhotoData, linkedProduct, linkedDeadline, manualColor, onColorChange, onPhotoChange, onChange }: { value?: Checklist | null; title: string; source: string; photoData?: string; linkedPhotoData?: string; linkedProduct?: string; linkedDeadline?: string; manualColor?: string; onColorChange: (color: string) => void; onPhotoChange: (photo: string) => void | Promise<void>; onChange: (value: Checklist | null) => void }) {
  const [modal, setModal] = useState<"import" | "piece" | "setup" | "warnings" | null>(null);
  const [raw, setRaw] = useState(source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const modalId = useId();
  const printRoot = useRef<HTMLDivElement>(null);
  const rows = value ? sortProductionRows(value.rows) : [];
  const checkedCount = rows.filter(row => row.done).length;
  const productPhoto = photoData ?? linkedPhotoData ?? "";
  const deadline = value?.deadline || linkedDeadline;
  const observations = value?.notes.trim().replace(/\s+/g, " ");
  const warningCount = value?.warnings.length ?? 0;
  const automatic = productionColorFromNotes(value?.notes ?? "") ?? productionColorFromNotes(source) ?? productionColorFromProduct(linkedProduct ?? "") ?? productionColorFromNotes(title);
  const customized = validProductionColor(manualColor);
  const color = customized ? manualColor : automatic?.hex ?? defaultProductionColor;
  const theme = { "--sheet-accent": color, "--sheet-on-accent": productionColorInk(color) } as CSSProperties;
  const print = async () => {
    try {
      await Promise.all(Array.from(printRoot.current?.querySelectorAll("img") ?? [], image => image.decode()));
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
      onChange({ ...result, client: result.client || value?.client || title, deadline: result.deadline || value?.deadline || linkedDeadline || "" });
      setModal(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível organizar a lista."); }
    finally { setBusy(false); }
  };
  const openImport = () => { setRaw(source); setError(""); setModal("import"); };

  return <section className="production-checklist" aria-label="Checklist de produção">
    <div className="checklist-toolbar">
      <div className="checklist-piece-count">
        <h2>{value ? `${rows.length} ${rows.length === 1 ? "peça" : "peças"}` : "Lista de peças"}</h2>
        {value && <span>{checkedCount} {checkedCount === 1 ? "conferida" : "conferidas"}</span>}
      </div>
      <div className="checklist-output">
        {value ? <>
          <PdfDownloadButton disabled={photoBusy} generate={async () => {
            const root = printRoot.current;
            if (!root) throw new Error("Checklist indisponível");
            await (await import("./production-download")).downloadProduction(root, value.client || title);
          }} />
          <button className="primary" type="button" disabled={photoBusy} onClick={() => void print()}><Printer size={16} aria-hidden="true" /> Imprimir A4</button>
        </> : <button className="primary" type="button" aria-haspopup="dialog" onClick={openImport}>Colar pedido</button>}
      </div>
    </div>
    <div className="checklist-controls">
      <button className="checklist-reference" type="button" aria-haspopup="dialog" onClick={() => setModal("setup")}>
        <span className="checklist-thumbnail" aria-hidden="true">{productPhoto
          ? <Image src={productPhoto} alt="" width={40} height={40} unoptimized />
          : <Camera size={18} />}</span>
        <span className="checklist-reference-copy">
          <span><b>Dados e foto</b>{deadline && <small>Entrega {deadline.split("-").reverse().join("/")}</small>}</span>
          {observations && <small className="checklist-observation-preview">{observations}</small>}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {value && <div className="checklist-list-actions">
        {warningCount > 0 && <button className="checklist-warning-button" type="button" aria-haspopup="dialog" onClick={() => setModal("warnings")}><TriangleAlert size={15} aria-hidden="true" />{warningCount} {warningCount === 1 ? "aviso" : "avisos"}</button>}
        <button className="secondary" type="button" aria-haspopup="dialog" onClick={openImport}>Colar outra lista</button>
        <button className="secondary" type="button" aria-haspopup="dialog" disabled={rows.length >= 500} onClick={() => setModal("piece")}><Plus size={15} aria-hidden="true" /> Adicionar peça</button>
      </div>}
    </div>
    {error && modal !== "import" && <p className="form-error" role="alert">{error}</p>}
    {value && <>
      {rows.length > 0 && <ChecklistPieces rows={rows} onUpdate={updateRow} onRemove={id => onChange({ ...value, rows: sortProductionRows(value.rows.filter(item => item.id !== id)) })} />}
      <div className="checklist-footer"><button className="secondary" type="button" onClick={() => { if (window.confirm("Remover o checklist desta anotação?")) onChange(null); }}>Remover checklist</button></div>
      {typeof document !== "undefined" && createPortal(<div ref={printRoot} className="production-print-root" style={theme} aria-hidden="true"><ProductionSheets checklist={value} photoData={productPhoto} /></div>, document.body)}
    </>}
    {modal === "setup" && <Modal titleId={modalId} busy={photoBusy} compact close={() => setModal(null)}>
      <header><h2 id={modalId}>Dados e foto</h2><button type="button" disabled={photoBusy} onClick={() => setModal(null)} aria-label="Fechar"><X size={20} /></button></header>
      <div className="checklist-setup">
        {value && <>
          <div className="checklist-meta">
            <label>Cliente / pedido<input value={value.client} maxLength={120} onChange={event => onChange({ ...value, client: event.target.value })} /></label>
            <label>Entrega<input type="date" value={value.deadline} onChange={event => onChange({ ...value, deadline: event.target.value })} /></label>
          </div>
          <label className="checklist-observations">Atenção na produção<textarea value={value.notes} maxLength={4000} rows={4} onChange={event => onChange({ ...value, notes: event.target.value })} placeholder="Cor, tecido, estampa, medidas especiais…" /></label>
          <div className="checklist-theme">
            <label>Cor da camisa no PDF<input type="color" value={color} onChange={event => onColorChange(event.target.value)} /></label>
            <span>{customized ? "Cor personalizada" : automatic?.label ?? "Azul padrão"}</span>
            {customized && <button className="secondary" type="button" onClick={() => onColorChange("")}>Usar cor automática</button>}
          </div>
        </>}
        <div className="checklist-product-photo">
          <OrderPhotoField label="Foto do produto no PDF" value={productPhoto} onPhotoChange={onPhotoChange} includeFormField={false} onBusyChange={setPhotoBusy} />
          {linkedPhotoData && linkedPhotoData !== productPhoto && <button className="secondary" type="button" disabled={photoBusy} onClick={() => onPhotoChange(linkedPhotoData)}>Usar foto do pedido vinculado</button>}
        </div>
      </div>
      <div className="checklist-dialog-actions"><button className="primary" type="button" disabled={photoBusy} onClick={() => setModal(null)}>Concluir</button></div>
    </Modal>}
    {modal === "warnings" && value && <Modal titleId={modalId} busy={false} compact close={() => setModal(null)}>
      <header><h2 id={modalId}>Avisos da lista</h2><button type="button" onClick={() => setModal(null)} aria-label="Fechar"><X size={20} /></button></header>
      <ul className="checklist-warning-list">{value.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </Modal>}
    {modal === "piece" && value && <AddPieceDialog models={[...new Set(rows.map(row => row.model))]} defaultModel="Masculina" close={() => setModal(null)} add={specification => {
      if (value.rows.length >= 500) return "O checklist já atingiu o limite de 500 peças.";
      onChange({ ...value, rows: sortProductionRows([...value.rows, { ...specification, id: makeId(), done: false }]) });
      setModal(null);
    }} />}
    {modal === "import" && <Modal titleId={modalId} busy={busy} close={() => setModal(null)}><header><h2 id={modalId}>Organizar pedido</h2><button disabled={busy} onClick={() => setModal(null)} aria-label="Fechar"><X size={20} /></button></header><div className="checklist-import"><label>Lista do pedido<textarea value={raw} maxLength={30000} rows={16} onChange={(event) => setRaw(event.target.value)} placeholder="1G&#10;1M&#10;1MF&#10;2GF" /></label><button className="secondary" disabled={busy} onClick={() => setRaw(sampleProductionOrder)}>Usar exemplo JERFESSON</button>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy || !raw.trim()} onClick={() => void organize(false)}><Check size={16} /> Organizar lista</button><button className="secondary" disabled={busy || !raw.trim()} onClick={() => void organize(true)}><Sparkles size={16} />{busy ? "Organizando…" : "Organizar com IA"}</button></div></Modal>}
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
