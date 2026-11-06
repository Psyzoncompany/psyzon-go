"use client";

import Image from "next/image";
import { ArrowRight, Camera, Check, ChevronDown, ClipboardList, ImageIcon, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { customerNameKey, type Customer } from "./finance-model";
import { documentPrefix, millis, readDocument, type BusinessNote } from "./notes-model";
import { dueLabel, dueTone, orderStatuses, productionStages, type Order, type OrderStatus } from "./order-model";
import "./production-board.css";

type Props = {
  orders: Order[];
  customers: Customer[];
  notes: BusinessNote[];
  displayMoney: (value: number) => string;
  updateStatus: (order: Order, status: OrderStatus) => Promise<void>;
  onCreate: () => void;
  editOrder: (order: Order) => void;
  deleteOrder: (order: Order) => Promise<void>;
  openNote: (noteId: string) => void;
};

function indexOrderNotes(notes: BusinessNote[]) {
  const byOrder = new Map<string, BusinessNote>();
  const byCustomer = new Map<string, BusinessNote>();
  for (const note of [...notes].sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt))) {
    if (!note.content.startsWith(documentPrefix)) continue;
    const { status, orderId, customerId } = readDocument(note.content);
    if (status === "trash") continue;
    if (orderId && !byOrder.has(orderId)) byOrder.set(orderId, note);
    if (customerId && !byCustomer.has(customerId)) byCustomer.set(customerId, note);
  }
  return { byOrder, byCustomer };
}

export default function ProductionBoard({ orders, customers, notes, displayMoney, updateStatus, onCreate, editOrder, deleteOrder, openNote }: Props) {
  const [working, setWorking] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const board = useRef<HTMLDivElement>(null);
  const columns = useRef<Array<HTMLElement | null>>([]);
  const links = useMemo(() => indexOrderNotes(notes), [notes]);
  const customerIds = useMemo(() => new Map(customers.map(customer => [customerNameKey(customer.name), customer.id])), [customers]);
  const grouped = new Map(orderStatuses.map(status => [status, [] as Order[]]));
  for (const order of orders) grouped.get(order.status)?.push(order);
  for (const stage of productionStages) grouped.get(stage)?.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const delivered = grouped.get("Entregue") ?? [];
  const noteFor = (order: Order) => links.byOrder.get(order.id) ?? links.byCustomer.get(customerIds.get(customerNameKey(order.customer)) ?? "");

  async function run(order: Order, action: () => Promise<void>) {
    setError("");
    setWorking(current => new Set(current).add(order.id));
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar o pedido. Tente novamente.");
    } finally {
      setWorking(current => { const next = new Set(current); next.delete(order.id); return next; });
    }
  }

  function actionsFor(order: Order) {
    return {
      order,
      note: noteFor(order),
      busy: working.has(order.id),
      edit: () => editOrder(order),
      remove: () => void run(order, () => deleteOrder(order)),
      move: (status: OrderStatus) => void run(order, () => updateStatus(order, status)),
      openNote,
    };
  }

  return <section className="production-workspace">
    <header className="production-heading">
      <div><h1>Produção</h1><p>{orders.length - delivered.length} em andamento <span>·</span> {delivered.length} {delivered.length === 1 ? "entregue" : "entregues"}</p></div>
      <button className="primary" onClick={onCreate}><Plus size={17} /> Novo pedido</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <label className="production-stage-jump">Ir para etapa
      <select value="" onChange={event => {
        if (!event.target.value) return;
        const column = columns.current[Number(event.target.value)];
        if (column) board.current?.scrollTo({ left: column.offsetLeft });
      }}>
        <option value="" disabled>Selecionar etapa</option>
        {productionStages.map((stage, index) => <option key={stage} value={index}>{stage} ({grouped.get(stage)?.length ?? 0})</option>)}
      </select>
    </label>
    <div ref={board} className="production-kanban" role="region" aria-label="Quadro Kanban da produção">
      {productionStages.map((stage, index) => {
        const items = grouped.get(stage) ?? [];
        return <section className="production-lane" data-stage={index} aria-labelledby={`production-stage-${index}`} key={stage} ref={element => { columns.current[index] = element; }}>
          <header><span className="production-stage-dot" /><h2 id={`production-stage-${index}`}>{stage}</h2><span className="production-count">{items.length}</span></header>
          {items.length ? items.map(order => <OrderCard key={order.id} {...actionsFor(order)} displayMoney={displayMoney} />) : <p className="production-lane-empty">Nenhum pedido nesta etapa.</p>}
        </section>;
      })}
    </div>
    <details className="production-delivered">
      <summary><Check size={18} /> <strong>Pedidos entregues</strong><span className="production-count">{delivered.length}</span><ChevronDown className="production-delivered-chevron" size={17} /></summary>
      {delivered.length ? <ul>{delivered.map(order => {
        const actions = actionsFor(order);
        return <li key={order.id} className="production-delivered-row">
          <OrderPhoto order={order} />
          <div className="production-delivered-name"><b>{order.product}</b><small>{order.customer} · {order.quantity} un.</small></div>
          <strong className="production-delivered-value">{displayMoney(order.total)}</strong>
          <div className="production-delivered-actions"><NoteShortcut note={actions.note} openNote={openNote} /><OrderActions {...actions} /></div>
        </li>;
      })}</ul> : <p className="production-lane-empty">Nenhum pedido entregue.</p>}
    </details>
  </section>;
}

type OrderActionsProps = { order: Order; busy: boolean; edit: () => void; remove: () => void };

function OrderActions({ order, busy, edit, remove }: OrderActionsProps) {
  return <div className="production-order-actions">
    <button type="button" disabled={busy} onClick={edit} aria-label={`Editar pedido de ${order.customer}`} title="Editar pedido"><Pencil size={15} /></button>
    <button type="button" disabled={busy} onClick={remove} aria-label={`Excluir pedido de ${order.customer}`} title="Excluir pedido"><Trash2 size={15} /></button>
  </div>;
}

function NoteShortcut({ note, openNote }: { note?: BusinessNote; openNote: Props["openNote"] }) {
  if (!note) return null;
  return <button type="button" className="production-note-link" title={note.title || "Anotação vinculada"} aria-label={`Abrir anotação ${note.title || "vinculada"}`} onClick={() => openNote(note.id)}><ClipboardList size={15} /> <span>Anotação</span></button>;
}

function OrderPhoto({ order }: { order: Order }) {
  return order.photoData
    ? <Image unoptimized className="production-photo" src={order.photoData} alt={`Foto de ${order.product}`} width={480} height={300} />
    : <span className="production-photo-empty" aria-hidden="true"><ImageIcon size={18} /></span>;
}

function OrderCard({ order, note, busy, edit, remove, move, openNote, displayMoney }: OrderActionsProps & { note?: BusinessNote; move: (status: OrderStatus) => void; openNote: Props["openNote"]; displayMoney: Props["displayMoney"] }) {
  const next = orderStatuses[orderStatuses.indexOf(order.status) + 1];
  const phone = (order.phone ?? "").replace(/\D/g, "");
  const contact = /^\d{8,15}$/.test(phone) ? `https://wa.me/${phone}?text=${encodeURIComponent(`Olá, ${order.customer}. Seu pedido da PSYZON está pronto para retirada ou entrega.`)}` : null;
  const nextAction = next === "Entregue" ? "Marcar como entregue" : "Avançar etapa";
  return <article className="production-order-card">
    {order.photoData ? <OrderPhoto order={order} /> : <button type="button" className="production-add-photo" onClick={edit} disabled={busy}><Camera size={15} /> Adicionar foto</button>}
    <div className="production-order-content">
      <div className="production-order-top"><span>#{order.id.slice(0, 8).toUpperCase()}</span><OrderActions order={order} busy={busy} edit={edit} remove={remove} /></div>
      <h3>{order.product}</h3>
      <p>{order.customer} · {order.quantity} un.</p>
      <span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span>
      <div className="production-order-value"><strong>{displayMoney(order.total)}</strong><small>{displayMoney(order.receivable ?? Math.max(0, order.total - order.paid))} pendente</small></div>
      <div className="production-order-links">
        <NoteShortcut note={note} openNote={openNote} />
        {order.status === "Pronto" && contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="production-note-link"><MessageCircle size={15} /> Avisar</a>}
      </div>
      <label className="production-order-move"><span>Etapa</span><select aria-label={`Etapa do pedido de ${order.customer}`} disabled={busy} value={order.status} onChange={event => move(event.target.value as OrderStatus)}>{orderStatuses.map(status => <option key={status}>{status}</option>)}</select></label>
      {next && <button type="button" className="production-next" onClick={() => move(next)} disabled={busy}>{nextAction}<ArrowRight size={14} /></button>}
    </div>
  </article>;
}
