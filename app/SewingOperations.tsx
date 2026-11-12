"use client";
import { useState, type FormEvent } from "react";
import NoteDialog from "./notes/NoteDialog";
import { sewingInCustody, sewingPerson, type SewingLedger } from "./sewing-model";
import type { SewingChange } from "./SewingWorkspace";
import type { Order } from "./order-model";
import { localDateValue } from "./finance-model";
import "./operational-controls.css";

export default function SewingOperations({ person, ledger, orders, credit, balance, save, money }: { person: string; ledger: SewingLedger; orders: Order[]; credit: number; balance: number; save: (change: SewingChange) => Promise<void>; money: (amount: number) => string }) {
  const [dialog, setDialog] = useState<"credit" | "pieces" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const movements = ledger.movements ?? [];
  const eligibleOrders = orders.filter(order => sewingPerson(ledger, order.id) === person || sewingInCustody(movements, order.id, person).remaining > 0);
  const custody = [...new Set(movements.filter(item => item.person === person).map(item => item.orderId))].map(id => ({
    id, order: orders.find(order => order.id === id),
    ...sewingInCustody(movements, id, person),
    deadline: movements.filter(item => item.person === person && item.orderId === id && item.kind === "sent").at(-1)?.deadline,
  }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (dialog === "credit") {
        await save({ type: "entry", entry: { id: crypto.randomUUID(), person, kind: "offset", quantity: 0, amount: Number(data.get("amount")), date: String(data.get("date")), name: String(data.get("name") || "Acerto de crédito") } });
      } else {
        await save({ type: "movement", movement: { id: crypto.randomUUID(), person, orderId, kind: data.get("kind") === "returned" ? "returned" : "sent", quantity: Number(data.get("quantity")), date: String(data.get("date")), deadline: String(data.get("deadline") || "") } });
      }
      setDialog(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  return <section className="panel operations-panel">
    <header><h2>Acertos e peças com {person}</h2><div className="operations-actions">
      <button className="secondary" disabled={credit <= 0 || balance <= 0} onClick={() => { setError(""); setDialog("credit"); }}>Usar crédito</button>
      <button className="secondary" disabled={!eligibleOrders.length} onClick={() => { setError(""); setOrderId(eligibleOrders[0]?.id ?? ""); setDialog("pieces"); }}>Registrar envio / retorno</button>
    </div></header>
    {custody.length ? <ul className="operations-list">{custody.map(row => <li key={row.id}>
      <span><b>{row.order?.customer ?? "Pedido removido"}</b><small>{row.sent} enviadas · {row.returned} recebidas{row.deadline && row.remaining > 0 ? " · Prazo " + row.deadline.split("-").reverse().join("/") : ""}</small></span>
      <strong>{row.remaining} com a costureira</strong>
    </li>)}</ul> : <p className="operations-muted">Nenhum envio registrado.</p>}
    {movements.some(item => item.person === person) && <details><summary>Histórico de envios e retornos</summary><ul className="operations-list">
      {movements.filter(item => item.person === person).slice().sort((a,b) => b.date.localeCompare(a.date)).map(item => <li key={item.id}><span><b>{orders.find(order => order.id === item.orderId)?.customer ?? "Pedido removido"}</b><small>{item.date.split("-").reverse().join("/")} · {item.kind === "sent" ? "Envio" : "Retorno"}</small></span><strong>{item.quantity} peças</strong></li>)}
    </ul></details>}
    {dialog && <NoteDialog title={dialog === "credit" ? "Usar crédito de estampagens" : "Registrar peças"} close={() => { if (!busy) setDialog(null); }}>
      <form className="operations-form" onSubmit={submit}>
        {dialog === "credit" ? <>
          <p>Crédito disponível {money(credit)} · Costura a pagar {money(balance)}</p>
          <label>Valor do acerto<input name="amount" type="number" min=".01" max={Math.min(credit, balance)} step=".01" required /></label>
          <label>Referência<input name="name" maxLength={160} placeholder="Acerto combinado com a costureira" /></label>
        </> : <>
          <label>Pedido<select value={orderId} onChange={event => setOrderId(event.target.value)}>{eligibleOrders.map(order => <option key={order.id} value={order.id}>{order.customer} · {order.product}</option>)}</select></label>
          <label>Movimento<select name="kind"><option value="sent">Enviar peças</option><option value="returned">Receber peças</option></select></label>
          <label>Quantidade<input name="quantity" type="number" min="1" step="1" required /></label>
          <label>Prazo combinado<input name="deadline" type="date" /></label>
        </>}
        <label>Data<input name="date" type="date" max={localDateValue()} defaultValue={localDateValue()} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Salvando…" : "Confirmar registro"}</button>
      </form>
    </NoteDialog>}
  </section>;
}
