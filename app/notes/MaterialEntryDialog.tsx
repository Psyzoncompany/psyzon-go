"use client";
import { useState } from "react";
import NoteDialog from "./NoteDialog";
import MaterialCalculator from "./MaterialCalculator";
import { customerNameKey } from "../finance-model";
import type { NoteMaterial } from "../notes-model";
import { materialBinding, type MaterialTarget, type MaterialProductionOrder, type MaterialCustomer, type MaterialSaveInput } from "./material-binding";
import "./material-entry.css";

export default function MaterialEntryDialog({ uid, targets, orders, customers, initialId = "", material, bindingOnly = false, save, close }: { uid: string; targets: MaterialTarget[]; orders: MaterialProductionOrder[]; customers: MaterialCustomer[]; initialId?: string; material?: NoteMaterial; bindingOnly?: boolean; save: (input: MaterialSaveInput) => Promise<void>; close: () => void }) {
  const initial = targets.find(target => target.id === initialId);
  const [noteId,setNoteId] = useState(initialId), [title,setTitle] = useState(initial?.title ?? "Materiais"), [orderId,setOrderId] = useState(initial?.orderId ?? ""), [customerId,setCustomerId] = useState(initial?.customerId ?? "");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const order = orders.find(order => order.id === orderId);
  const compatible = customerId ? orders.filter(order => customerNameKey(order.customer) === customerNameKey(customers.find(customer => customer.id === customerId)?.name ?? "")) : orders;
  function selectTarget(id: string) {
    const target = targets.find(target => target.id === id);
    setNoteId(id); setTitle(target?.title ?? "Materiais"); setOrderId(target?.orderId ?? ""); setCustomerId(target?.customerId ?? "");
  }
  function selectOrder(id: string) {
    const selected = orders.find(order => order.id === id);
    setOrderId(id);
    if (!selected) return;
    setCustomerId(customers.find(customer => customerNameKey(customer.name) === customerNameKey(selected.customer))?.id ?? "");
    if (!initialId && !material) {
      const existing = targets.find(target => target.orderId === id);
      setNoteId(existing?.id ?? "");
      setTitle(existing?.title ?? `${selected.customer} · ${selected.product}`.slice(0,200));
    }
  }
  async function submit(next?: NoteMaterial) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!title.trim()) throw new Error("Informe o nome do planejamento.");
      await save({ noteId, title: title.trim(), ...materialBinding(orderId,customerId,orders,customers), ...(next ? { material: next } : {}) });
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar os materiais."); }
    finally { setBusy(false); }
  }
  return <NoteDialog title={bindingOnly ? "Vincular materiais" : material ? "Editar material" : "Adicionar materiais"} close={() => { if (!busy) close(); }} wide>
    <fieldset className="material-entry" disabled={busy}>
      {!initialId && <label>Planejamento<select aria-label="Planejamento" value={noteId} onChange={event => selectTarget(event.target.value)}><option value="">Novo planejamento</option>{targets.map(target => <option key={target.id} value={target.id}>{target.title}</option>)}</select></label>}
      <label>Nome do planejamento<input maxLength={200} value={title} onChange={event => setTitle(event.target.value)} required /></label>
      <div className="material-entry-links"><label>Cliente<select aria-label="Cliente" value={customerId} onChange={event => { setCustomerId(event.target.value); if (order && customerNameKey(order.customer) !== customerNameKey(customers.find(customer => customer.id === event.target.value)?.name ?? "")) { setOrderId(""); if (!initialId) { setNoteId(""); setTitle("Materiais"); } } }}><option value="">Sem cliente / uso interno</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label>Pedido de produção<select aria-label="Pedido de produção" value={orderId} onChange={event => selectOrder(event.target.value)}><option value="">Sem pedido de produção</option>{compatible.map(order => <option key={order.id} value={order.id}>{order.customer} · {order.product}</option>)}</select></label></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      {busy && <p role="status">Salvando materiais e vínculos…</p>}
      {bindingOnly ? <button className="primary" onClick={() => void submit()}>Salvar vínculo</button> : <div className="material-entry-calculator"><MaterialCalculator key={material?.id ?? orderId} uid={uid} material={material} initialQuantity={order?.quantity} close={close} add={next => void submit(next)} /></div>}
    </fieldset>
  </NoteDialog>;
}
