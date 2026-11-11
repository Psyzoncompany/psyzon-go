"use client";

import { ArrowUpRight, Check, PackagePlus, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import NoteDialog from "./NoteDialog";
import { roundMoney } from "../finance-model";
import type { RestockInput, RestockItem } from "./restock-model";
import "./notes.css";
import "./tasks.css";
import "./restock.css";

type Props = { items: RestockItem[]; connection: "connecting" | "live" | "error"; today: string; displayMoney: (value: number) => string; openFinance: () => void; onSave: (input: RestockInput, id?: string) => Promise<void>; onToggle: (id: string, completed: boolean) => Promise<void>; onDelete: (id: string) => Promise<void> };
const dateLabel = (date: string) => date ? date.split("-").reverse().join("/") : "Sem data";

export default function RestockWorkspace({ items, connection, today, displayMoney, openFinance, onSave, onToggle, onDelete }: Props) {
  const [editor, setEditor] = useState<RestockItem | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const pending = items.filter(item => !item.completed).sort((a,b) => (a.purchaseDate || "9999").localeCompare(b.purchaseDate || "9999"));
  const done = items.filter(item => item.completed);
  const total = roundMoney(pending.reduce((sum,item) => sum + item.amount,0));
  const shown = showDone ? done : pending;
  const disabled = busy || connection !== "live";
  async function run(action: () => Promise<void>) {
    if (disabled) return;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente."); } finally { setBusy(false); }
  }
  return <section className="tasks-workspace restock-workspace">
    <header className="tasks-heading"><div><span className="eyebrow">BLOCO DE NOTAS</span><h1>Reposição de estoque</h1><p>Organize as próximas compras com valor e data.</p></div><div className="restock-heading-actions"><button type="button" className="secondary" disabled={!shown.length} onClick={()=>setPrintOpen(true)}><Printer size={17}/> PDF / Imprimir</button><button type="button" className="primary" disabled={disabled} onClick={()=>{setError("");setEditor("new");}}><Plus size={17}/> Novo item</button></div></header>
    <div className="restock-summary"><article className="panel"><small>Total a repor</small><strong>{displayMoney(total)}</strong><span>{pending.length} {pending.length === 1 ? "item pendente" : "itens pendentes"}</span></article><article className="panel"><small>Compras para hoje / atrasadas</small><strong>{pending.filter(item=>item.purchaseDate && item.purchaseDate<=today).length}</strong><button type="button" onClick={openFinance}>Vinculado ao A pagar <ArrowUpRight size={14}/></button></article></div>
    {connection !== "live" && <p className="tasks-feedback" role="status">{connection === "error" ? "Não foi possível sincronizar. Recarregue a página para tentar novamente." : "Sincronizando estoque…"}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="restock-filters" aria-label="Filtrar reposição"><button type="button" aria-pressed={!showDone} onClick={()=>setShowDone(false)}>A repor <span>{pending.length}</span></button><button type="button" aria-pressed={showDone} onClick={()=>setShowDone(true)}>Repostos <span>{done.length}</span></button></div>
    <section className="panel restock-items" aria-label={showDone ? "Itens repostos" : "Itens a repor"}>
      {shown.length ? <ul>{shown.map(item=><li key={item.id}>
        <label className="task-check"><input type="checkbox" checked={item.completed} disabled={disabled} aria-label={`${item.completed ? "Reabrir" : "Marcar como reposto"}: ${item.title}`} onChange={()=>void run(()=>onToggle(item.id,!item.completed))}/><Check size={14}/></label>
        <div className="restock-item-text"><b className={item.completed ? "done" : ""}>{item.title}</b><small className={!item.completed && item.purchaseDate && item.purchaseDate<=today ? "restock-due" : ""}>{item.purchaseDate ? `Comprar ${item.purchaseDate===today ? "hoje" : `em ${dateLabel(item.purchaseDate)}`}${!item.completed && item.purchaseDate<today ? " · Atrasado" : ""}` : "Defina uma data para receber o aviso"}</small></div>
        <strong>{displayMoney(item.amount)}</strong><div className="restock-item-actions"><button type="button" aria-label={`Editar ${item.title}`} disabled={disabled} onClick={()=>{setError("");setEditor(item);}}><Pencil size={16}/></button><button type="button" aria-label={`Excluir ${item.title}`} disabled={disabled} onClick={()=>{if(window.confirm(`Remover “${item.title}” da reposição?`)) void run(()=>onDelete(item.id));}}><Trash2 size={16}/></button></div>
      </li>)}</ul> : <div className="tasks-empty"><PackagePlus size={25}/><p>{showDone ? "Nenhum item reposto ainda." : "Nenhum item a repor. Adicione a próxima compra."}</p></div>}
    </section>
    {editor && <RestockEditor key={typeof editor === "string" ? editor : editor.id} item={editor === "new" ? undefined : editor} busy={busy} error={error} close={()=>{if(!busy)setEditor(null);}} save={input=>run(async()=>{await onSave(input,editor === "new" ? undefined : editor.id);setEditor(null);})}/>}
    {printOpen && <NoteDialog title="Imprimir reposição de estoque" close={()=>setPrintOpen(false)}><div className="tasks-print-options"><p>{shown.length} itens · Total: {displayMoney(roundMoney(shown.reduce((sum,item)=>sum+item.amount,0)))}</p><p>Selecione “Salvar como PDF” ou a sua impressora.</p></div><footer className="an-export-actions"><button type="button" onClick={()=>setPrintOpen(false)}>Cancelar</button><button type="button" className="an-primary" onClick={()=>window.print()}>PDF / Imprimir</button></footer>{createPortal(<article className="tasks-print-root restock-print-root"><header><div><small>PSYZON GO · BLOCO DE NOTAS</small><h1>Reposição de estoque</h1><p>{showDone ? "Repostos" : "A repor"} · {dateLabel(today)}</p></div></header><table><thead><tr><th>OK</th><th>Comprar em</th><th>Item / observações</th><th>Valor</th></tr></thead><tbody>{shown.map(item=><tr key={item.id}><td><span className="tasks-print-check">{item.completed && <Check size={13}/>}</span></td><td>{dateLabel(item.purchaseDate)}</td><td>{item.title}</td><td>{displayMoney(item.amount)}</td></tr>)}</tbody></table><footer><span>{shown.length} itens</span><b>Total: {displayMoney(roundMoney(shown.reduce((sum,item)=>sum+item.amount,0)))}</b></footer></article>,document.body)}</NoteDialog>}
  </section>;
}
function RestockEditor({item,busy,error,close,save}:{item?:RestockItem;busy:boolean;error:string;close:()=>void;save:(input:RestockInput)=>Promise<void>}) {
  const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);void save({text:String(form.get("text")||"").trim(),amount:Number(form.get("amount")||0),purchaseDate:String(form.get("purchaseDate")||"")});};
  return <NoteDialog title={item ? "Editar reposição" : "Novo item de reposição"} close={close}><form className="restock-editor" onSubmit={submit}><label>Item e observações<textarea name="text" rows={4} defaultValue={item?.title} required maxLength={2000} placeholder="Ex.: Malha PV preta — 5 kg" disabled={busy}/></label><div><label>Valor do item (R$)<input name="amount" type="number" min="0" max="100000000" step="0.01" inputMode="decimal" defaultValue={item?.amount || ""} placeholder="0,00" disabled={busy}/><small>Valor total previsto para este item.</small></label><label>Data para comprar<input name="purchaseDate" type="date" defaultValue={item?.purchaseDate} disabled={busy}/><small>O aviso aparece nas notificações na data.</small></label></div>{error && <p className="form-error" role="alert">{error}</p>}<footer className="an-export-actions"><button type="button" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="an-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar item"}</button></footer></form></NoteDialog>;
}
