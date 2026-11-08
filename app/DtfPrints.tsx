"use client";

import Image from "next/image";
import { FileImage, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import DtfNamesLink from "./DtfNamesLink";
import OrderPhotoField from "./OrderPhotoField";
import { dtfDate, maxDtfPrintPhoto, maxDtfPrints, type DtfOrder, type DtfPrint, type DtfPrintChange } from "./dtf-model";
import type { DtfCustomerLink } from "./dtf-links";
import type { Customer } from "./finance-model";

export default function DtfPrints({ order, prints, customers, links, live, onChange, openNote, allowAdd = true }: { order: DtfOrder; prints: DtfPrint[]; customers: Customer[]; links: Map<string, DtfCustomerLink>; live: boolean; onChange: (id: string, change: DtfPrintChange) => Promise<void>; openNote: (id: string) => void; allowAdd?: boolean }) {
  const [editor, setEditor] = useState<DtfPrint | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const blocked = !live || busy || photoBusy;
  const selected = editor && editor !== "new" ? editor : null;
  const [clientId, setClientId] = useState("");
  const names = new Map(customers.map(customer => [customer.id, customer.name]));
  const customerName = (print: DtfPrint) => names.get(print.customerId) || print.customerName || "Sem cliente";
  const selectedLink = links.get(clientId);

  function openEditor(next: DtfPrint | "new") {
    setError("");
    setClientId(next === "new" ? order.customerId : next.customerId);
    setEditor(next);
  }

  async function change(change: DtfPrintChange) {
    if (blocked) return;
    setBusy(true);
    setError("");
    try {
      await onChange(order.id, change);
      if (change.type === "add" || change.type === "edit") setEditor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a lista de estampas.");
    } finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const print: DtfPrint = {
      id: selected?.id ?? crypto.randomUUID(),
      title: String(form.get("title") ?? "").trim(),
      customerId: clientId,
      customerName: clientId ? names.get(clientId) || selected?.customerName || order.customerName : String(form.get("customerName") ?? "").trim(),
      quantity: Number(form.get("quantity")),
      photoData: String(form.get("photoData") ?? ""),
      separated: selected?.separated ?? false,
    };
    void change({ type: selected ? "edit" : "add", print });
  }

  return <section className="dtf-prints-panel" aria-label="Estampas do metro">
      {error && !editor && <p role="alert" className="form-error">{error}</p>}
      {editor && <form key={selected?.id ?? "new"} className="dtf-print-form" onSubmit={save}>
        <h3>{selected ? "Editar estampa" : "Nova estampa"}</h3>
        <div className="dtf-client-field"><label>Vincular cliente<select value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Avulso / nome livre</option>{clientId && !names.has(clientId) && <option value={clientId}>{selected?.customerName || order.customerName}</option>}{customers.map(customer => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label><DtfNamesLink noteId={selectedLink?.noteId} /></div>
        {selectedLink?.deadline && <p className="form-help">Prazo DTF: {dtfDate(selectedLink.deadline)}</p>}
        {!clientId && <label>Nome do cliente<input name="customerName" maxLength={120} defaultValue={selected?.customerName ?? order.customerName} placeholder="Opcional para uso próprio" /></label>}
        <div className="form-row"><label>Nome da estampa<input name="title" required maxLength={160} defaultValue={selected?.title} placeholder="Ex.: Logo frontal" /></label><label>Quantidade<input name="quantity" type="number" required min="1" max="10000" defaultValue={selected?.quantity ?? 1} /></label></div>
        <OrderPhotoField label="Imagem da estampa" initialValue={selected?.photoData} thumbnailLimit={maxDtfPrintPhoto} onBusyChange={setPhotoBusy} />
        {error && <p role="alert" className="form-error">{error}</p>}
        <footer><button type="button" className="secondary" disabled={blocked} onClick={() => { setEditor(null); setError(""); }}>Cancelar</button><button className="primary" type="submit" disabled={blocked}>{busy ? "Salvando…" : "Salvar estampa"}</button></footer>
      </form>}
      {prints.length > 0 && <ul className="dtf-print-list">
        {prints.map(print => {
          const clientLink = links.get(print.customerId);
          return <li key={print.id}>
          <div className="dtf-thumb">{print.photoData ? <Image src={print.photoData} width={52} height={52} alt={`Referência de ${print.title}`} unoptimized /> : <FileImage size={19} aria-hidden="true" />}</div>
          <div><div className="dtf-client-line"><small>{customerName(print)}</small><DtfNamesLink noteId={clientLink?.noteId} openNote={openNote} /></div><b>{print.title} · {print.quantity} un.</b>{clientLink?.deadline && <small>Prazo DTF: {dtfDate(clientLink.deadline)}</small>}</div>
          <label className="dtf-separated"><input type="checkbox" checked={print.separated} disabled={blocked || !!editor} aria-label={`Separada: ${print.title}`} onChange={event => void change({ type: "separate", id: print.id, separated: event.target.checked })} />Separada</label>
          <div className="dtf-order-actions"><button type="button" disabled={blocked || !!editor} aria-label={`Editar estampa ${print.title}`} onClick={() => openEditor(print)}><Pencil size={15} /></button><button type="button" disabled={blocked || !!editor} aria-label={`Excluir estampa ${print.title}`} onClick={() => { if (window.confirm(`Excluir a estampa “${print.title}”?`)) void change({ type: "delete", id: print.id }); }}><Trash2 size={15} /></button></div>
        </li>;
        })}
      </ul>}
      {!editor && allowAdd && <button className="dtf-add-print" type="button" disabled={blocked || prints.length >= maxDtfPrints} onClick={() => openEditor("new")}><Plus size={15} /> Adicionar estampa</button>}
  </section>;
}
