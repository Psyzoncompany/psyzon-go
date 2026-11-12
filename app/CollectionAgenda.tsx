"use client";
import { useState } from "react";
import type { Order } from "./order-model";
import "./operational-controls.css";
export default function CollectionAgenda({ orders, today, money, charged, edit }: { orders: Order[]; today: string; money: (value: number) => string; charged: (order: Order) => Promise<void>; edit: (order: Order) => void }) {
  const [filter, setFilter] = useState("today");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const pending = orders.filter(order => order.status !== "Orçamento" && (order.receivable ?? Math.max(0, order.total - order.paid)) > 0);
  const rows = pending.filter(order => filter === "all" || (filter === "undated" ? !order.paymentDueDate : filter === "late" ? order.paymentDueDate && order.paymentDueDate < today : order.paymentDueDate === today)).sort((a,b) => (a.paymentDueDate || "9999").localeCompare(b.paymentDueDate || "9999"));
  return <section className="panel operations-panel">
    <header><h2>Cobranças</h2><select className="operations-month" aria-label="Filtrar cobranças" value={filter} onChange={event => setFilter(event.target.value)}>
      <option value="today">Cobrar hoje ({pending.filter(order => order.paymentDueDate === today).length})</option><option value="late">Atrasados ({pending.filter(order => order.paymentDueDate && order.paymentDueDate < today).length})</option><option value="undated">Sem data combinada ({pending.filter(order => !order.paymentDueDate).length})</option><option value="all">Todos os saldos ({pending.length})</option>
    </select></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {rows.length ? <ul className="operations-list">{rows.map(order => <li key={order.id}>
      <span><b>{order.customer}</b><small>{order.product} · {order.paymentDueDate ? order.paymentDueDate.split("-").reverse().join("/") : "Sem data combinada"}</small>
      {order.lastChargedAt && <small>Última cobrança {order.lastChargedAt.split("-").reverse().join("/")}</small>}</span>
      <strong>{money(order.receivable ?? Math.max(0, order.total - order.paid))}</strong>
      <div className="operations-actions"><button className="secondary" onClick={() => edit(order)}>Combinar data</button><button className="secondary" disabled={!!busy || order.lastChargedAt === today} onClick={async () => {
        setBusy(order.id); setError("");
        try { await charged(order); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao registrar cobrança."); }
        finally { setBusy(""); }
      }}>{order.lastChargedAt === today ? "Cobrança registrada hoje" : "Registrar cobrança"}</button></div>
    </li>)}</ul> : <p className="operations-muted">Nenhuma cobrança nesta seleção.</p>}
  </section>;
}
