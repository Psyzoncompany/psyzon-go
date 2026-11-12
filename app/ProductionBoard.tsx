"use client";
import NoteDialog from "./notes/NoteDialog";
import type { OrderPayment } from "./order-follow-up";
import { roundMoney } from "./finance-model";
import type { OrderAlert } from "./order-alerts";
import type { Task } from "./notes/task-model";
import { TypedHeading } from "./Typewriter";
import { poloExtra } from "./order-pricing";
import { CountUp } from "./MotionValue";

import Image from "next/image";
import { AlertTriangle, ArrowRight, Camera, Check, ChevronDown, ClipboardList, GripVertical, ImageIcon, CalendarDays, Shirt, MoreHorizontal, PackageOpen, Layers, MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { urgentOrder, dueLabel, dueTone, nextOrderStatus, orderDtfStatus, orderStatuses, productionStages, type Order, type OrderStatus } from "./order-model";
import ProductionChecklistWindow from "./ProductionChecklistWindow";
import useProductionDrag from "./useProductionDrag";
import "./production-board.css";
import "./notes/notes.css";

type Props = {
  orders: Order[];
  orderPayments: ReadonlyMap<string, OrderPayment[]>;
  today: string;
  alerts: Map<string, OrderAlert[]>;
  openAlert: (alert: OrderAlert) => void;
  orderTasks: ReadonlyMap<string, Task[]>;
  taskConnection: "connecting" | "live" | "error";
  toggleTask: (id: string, completed: boolean) => Promise<void>;
  openTasks: () => void;
  displayMoney: (value: number) => string;
  updateStatus: (order: Order, status: OrderStatus) => Promise<void>;
  onCreate: () => void;
  editOrder: (order: Order) => void;
  deleteOrder: (order: Order) => Promise<void>;
  openChecklist: (order: Order) => void;
};

export default function ProductionBoard({ orders, orderPayments, displayMoney, updateStatus, onCreate, editOrder, deleteOrder, openChecklist, alerts, openAlert, orderTasks, taskConnection, toggleTask, openTasks, today }: Props) {
  const [working, setWorking] = useState<Set<string>>(() => new Set());
  const [alertId, setAlertId] = useState("");
  const alertOrder = orders.find(order => order.id === alertId);
  const currentAlerts = alerts.get(alertId) ?? [];
  const currentTasks = orderTasks.get(alertId) ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [sort, setSort] = useState("deadline");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const board = useRef<HTMLDivElement>(null);
  const drag = useProductionDrag(board, (id, stage) => {
    const order = orders.find(item => item.id === id);
    if (order && !working.has(id) && order.status !== "Entregue" && order.status !== stage) moveOrder(order, stage);
  });
  const columns = useRef<Array<HTMLElement | null>>([]);
  const grouped = new Map(orderStatuses.map(status => [status, [] as Order[]]));
  const selected = orders.find(order => order.id === selectedId);
  for (const order of orders) if (filter !== "late" || dueTone(order.dueDate, order.status) === "danger") grouped.get(order.status)?.push(order);
  for (const stage of productionStages) grouped.get(stage)?.sort((a, b) => sort === "customer" ? a.customer.localeCompare(b.customer, "pt-BR") : (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const delivered = grouped.get("Entregue") ?? [];
  const deliveredCount = orders.filter(order => order.status === "Entregue").length;
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

  function moveOrder(order: Order, status: OrderStatus) {
    void run(order, () => updateStatus(order, status));
  }

  function actionsFor(order: Order) {
    return {
      order,
      busy: working.has(order.id),
      edit: () => editOrder(order),
      remove: () => void run(order, () => deleteOrder(order)),
      move: (status: OrderStatus) => moveOrder(order, status),
      openChecklist: () => openChecklist(order),
    };
  }

  return <section className="production-workspace" onPointerMove={drag.move} onPointerUp={drag.end} onPointerCancel={drag.end} onLostPointerCapture={drag.end}>
    <header className="production-heading">
      <div className="kanban-heading-title"><span className="kanban-heading-icon"><Layers size={26} /></span><div><TypedHeading>Produção</TypedHeading><p>{orders.length - deliveredCount} em andamento <span>·</span> {deliveredCount} {deliveredCount === 1 ? "entregue" : "entregues"}</p></div></div>
      <div className="kanban-tools"><label>Organizar<select aria-label="Organizar pedidos" value={sort} onChange={event => setSort(event.target.value)}><option value="deadline">Prazo</option><option value="customer">Cliente</option></select></label><label>Filtros<select aria-label="Filtrar pedidos" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos</option><option value="late">Atrasados</option></select></label><button className="primary" onClick={onCreate}><Plus size={17} /> Novo pedido</button></div>
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
    <div ref={board} className="production-kanban" data-dragging={!!drag.dragged} role="region" aria-label="Quadro Kanban da produção">
      {productionStages.map((stage, index) => {
        const items = grouped.get(stage) ?? [];
        return <section className="production-lane" data-stage={index} data-production-drop={stage} data-drop-active={drag.dragged?.stage === stage} aria-labelledby={`production-stage-${index}`} key={stage} ref={element => { columns.current[index] = element; }}>
          <header><span className="production-stage-dot" /><h2 id={`production-stage-${index}`}>{stage}</h2><span className="production-count"><CountUp value={items.length} /></span></header>
          {items.length ? items.map(order => <OrderCard key={order.id} order={order} urgent={urgentOrder(order,today)} alertCount={(alerts.get(order.id)?.length ?? 0) + (orderTasks.get(order.id)?.filter(task => !task.completed).length ?? 0)} openAlerts={() => setAlertId(order.id)} busy={working.has(order.id)} open={() => setSelectedId(order.id)} openChecklist={() => openChecklist(order)} dragging={drag.dragged?.order.id === order.id} startDrag={event => drag.start(event, order)} />) : <div className="kanban-empty"><PackageOpen size={64} strokeWidth={1} /><b>Nenhum pedido nesta etapa</b><p>Os pedidos aparecerão aqui ao entrar nesta etapa.</p></div>}
        </section>;
      })}
    </div>
    <details className="production-delivered">
      <summary data-production-drop="Entregue" data-drop-active={drag.dragged?.stage === "Entregue"}><Check size={18} /> <strong>Pedidos entregues</strong><span className="production-count"><CountUp value={delivered.length} /></span><ChevronDown className="production-delivered-chevron" size={17} /></summary>
      {delivered.length ? <ul>{delivered.map(order => {
        const actions = actionsFor(order);
        return <li key={order.id} className="production-delivered-row">
          <OrderPhoto order={order} />
          <div className="production-delivered-name"><b>{order.product}</b><small>{order.customer} · {order.quantity} un.</small></div>
          <button className="production-note-link" onClick={() => setSelectedId(order.id)}>Ver pedido</button><button type="button" className="production-note-link" aria-haspopup="dialog" aria-label={`Pendências de ${order.customer} (${alerts.get(order.id)?.length ?? 0})`} onClick={() => setAlertId(order.id)}><AlertTriangle size={16} /></button>
          <div className="production-delivered-actions"><button className="production-note-link" onClick={actions.openChecklist}><ClipboardList size={15} /> Abrir lista</button><OrderActions {...actions} /></div>
        </li>;
      })}</ul> : <p className="production-lane-empty">Nenhum pedido entregue.</p>}
    </details>
    {alertOrder && <NoteDialog title="Pendências do pedido" close={() => setAlertId("")}>
      <div className="order-alert-panel">
        <b>{alertOrder.customer} · {alertOrder.product}</b>
        {currentAlerts.length > 0 && <ul>{currentAlerts.map(alert => <li key={alert.view}>
          <div><strong>{alert.title}</strong><small>{alert.detail}</small></div>
          <button type="button" className="secondary" onClick={() => { setAlertId(""); openAlert(alert); }}>
            {alert.view === "materiais" ? "Materiais" : alert.view === "costureiras" ? "Costureiras" : "Abrir DTF"}
          </button>
        </li>)}</ul>}
        {currentAlerts.length === 0 && !currentTasks.some(task => !task.completed) && <p>Nenhuma pendência para este pedido.</p>}
        {alertOrder.status !== "Orçamento" && alertOrder.status !== "Entregue" && <OrderTaskChecklist
          key={alertOrder.id}
          tasks={currentTasks}
          connection={taskConnection}
          toggleTask={toggleTask}
          openTasks={() => { setAlertId(""); openTasks(); }}
        />}
      </div>
    </NoteDialog>}
    {selected && createPortal(<OrderDetails {...actionsFor(selected)} payments={orderPayments.get(selected.id) ?? []} error={error} displayMoney={displayMoney} close={() => setSelectedId("")} edit={() => { setSelectedId(""); editOrder(selected); }} openChecklist={() => { setSelectedId(""); openChecklist(selected); }} />, document.body)}
    {drag.dragged && createPortal(<div ref={drag.preview} className="production-drag-preview" aria-hidden="true">{drag.dragged.order.customer}</div>, document.body)}
  </section>;
}

function OrderTaskChecklist({ tasks, connection, toggleTask, openTasks }: {
  tasks: Task[];
  connection: Props["taskConnection"];
  toggleTask: Props["toggleTask"];
  openTasks: Props["openTasks"];
}) {
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const completed = tasks.filter(task => task.completed).length;

  async function changeTask(task: Task, checked: boolean) {
    setError("");
    setSaving(task.id);
    try {
      await toggleTask(task.id, checked);
    } catch {
      setError("Não foi possível atualizar o afazer. Tente novamente.");
    } finally {
      setSaving("");
    }
  }

  return <section className="order-task-checklist" aria-label="Checklist de afazeres">
    <header>
      <h3><ClipboardList size={17} aria-hidden="true" /> Checklist de afazeres</h3>
      <button type="button" className="secondary" onClick={openTasks}>Abrir Afazeres</button>
    </header>
    {connection !== "live" && <p role="status">{connection === "error" ? "Não foi possível sincronizar os afazeres." : "Sincronizando afazeres…"}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {tasks.length > 0 ? <>
      <p aria-live="polite">{completed} de {tasks.length} concluídos</p>
      <ul>{tasks.map(task => <li key={task.id}>
        <label>
          <input type="checkbox" checked={task.completed} aria-disabled={connection !== "live" || !!saving} onChange={event => {
            if (connection === "live" && !saving) void changeTask(task, event.target.checked);
          }} />
          <span>{task.title}</span>
        </label>
      </li>)}</ul>
    </> : connection === "live" && <p>Nenhum afazer vinculado.</p>}
  </section>;
}

type OrderActionsProps = { order: Order; busy: boolean; edit: () => void; remove: () => void };

function OrderActions({ order, busy, edit, remove }: OrderActionsProps) {
  return <div className="production-order-actions">
    <button type="button" disabled={busy} onClick={edit} aria-label={`Editar pedido de ${order.customer}`} title="Editar pedido"><Pencil size={15} /></button>
    <button type="button" disabled={busy} onClick={remove} aria-label={`Excluir pedido de ${order.customer}`} title="Excluir pedido"><Trash2 size={15} /></button>
  </div>;
}

function OrderPhoto({ order }: { order: Order }) {
  return order.photoData
    ? <Image unoptimized className="production-photo" src={order.photoData} alt={`Foto de ${order.product}`} width={480} height={300} />
    : <span className="production-photo-empty" aria-hidden="true"><ImageIcon size={18} /></span>;
}

function OrderCard({ order, busy, open, openChecklist, dragging, startDrag, alertCount, openAlerts, urgent }: { order: Order; urgent: boolean; alertCount: number; openAlerts: () => void; busy: boolean; open: () => void; openChecklist: () => void; dragging: boolean; startDrag: (event: PointerEvent<HTMLElement>) => void }) {
  return <article className="production-order-card kanban-order-card" data-moving={dragging} data-urgent={urgent}>
    <button className="kanban-card-open" type="button" aria-label={`Abrir pedido de ${order.customer}`} aria-haspopup="dialog" onClick={open}>
      <span className="kanban-card-photo"><OrderPhoto order={order} /></span>
      <span className="kanban-card-copy"><b>{order.customer}</b><small>{order.product}</small></span>
      <span className="kanban-card-meta"><span className={`due ${urgent ? "danger" : dueTone(order.dueDate, order.status)}`}><CalendarDays size={15} />{dueLabel(order.dueDate, order.status)}</span><span className="kanban-card-quantity"><Shirt size={17} />{order.quantity} un.</span></span>
    </button>
    <div className="kanban-card-actions"><button type="button" className="kanban-alert-button" data-pending={alertCount > 0} aria-label={`Pendências de ${order.customer} (${alertCount})`} aria-haspopup="dialog" title={`${alertCount} pendência(s)`} onClick={openAlerts}><AlertTriangle size={16} /></button><span className="kanban-drag" aria-hidden="true" title="Arraste para mudar de etapa" onPointerDown={busy ? undefined : startDrag}><GripVertical size={13} /></span><button className="production-open-list" type="button" aria-label={`Abrir lista de ${order.customer}`} title="Abrir lista" onClick={openChecklist}><ClipboardList size={16} /></button><button type="button" aria-label={`Opções do pedido de ${order.customer}`} title="Detalhes e ações" onClick={open}><MoreHorizontal size={17} /></button></div>
  </article>;
}

function OrderPaymentHistory({ order, payments, displayMoney }: { order: Order; payments: OrderPayment[]; displayMoney: Props["displayMoney"] }) {
  const recorded = payments.reduce((sum, entry) => sum + (entry.refund ? -entry.amount : entry.amount), 0);
  const difference = roundMoney(order.paid - recorded);
  return <section className="order-payment-history" aria-label="Histórico de pagamentos">
    <h4>Histórico de pagamentos</h4>
    {payments.length > 0 ? <ul>
      {payments.map(entry => <li key={entry.id}>
        <span><b>{entry.refund ? "Devolução" : "Pagamento"}</b>
          {entry.date ? <time dateTime={entry.date}>{entry.date.split("-").reverse().join("/")}</time> : <small>Sem data registrada</small>}
        </span>
        <strong>{displayMoney(entry.refund ? -entry.amount : entry.amount)}</strong>
      </li>)}
    </ul> : <p>Nenhum lançamento vinculado.</p>}
    {difference > 0 && <p>Valor recebido sem parcela vinculada <strong>{displayMoney(difference)}</strong></p>}
    {difference < 0 && <p>Os lançamentos vinculados excedem o valor recebido do pedido em <strong>{displayMoney(-difference)}</strong>.</p>}
  </section>;
}

function OrderDetails({ order, busy, edit, remove, move, openChecklist, displayMoney, close, error, payments }: OrderActionsProps & { move: (status: OrderStatus) => void; openChecklist: () => void; displayMoney: Props["displayMoney"]; close: () => void; error: string; payments: OrderPayment[] }) {
  const [copyStatus, setCopyStatus] = useState("");
  const next = nextOrderStatus(order.status);
  async function copyQuote() {
    try {
      await navigator.clipboard.writeText([`Orçamento · PSYZON COMPANY`, order.customer, `${order.product} · ${order.quantity} peças`, `Total: ${displayMoney(order.total)}`, order.notes].filter(Boolean).join("\n"));
      setCopyStatus("Orçamento copiado.");
    } catch { setCopyStatus("Não foi possível copiar o orçamento."); }
  }
  const phone = (order.phone ?? "").replace(/\D/g, "");
  return <ProductionChecklistWindow title="Detalhes do pedido" customer={order.customer} close={close}>
    <div className="kanban-order-dialog-body">
      <div className="kanban-order-dialog-photo"><OrderPhoto order={order} />{!order.photoData && <button className="secondary" onClick={edit}><Camera size={16} /> Adicionar foto</button>}</div>
      <section className="kanban-order-dialog-info">{error && <p className="form-error" role="alert">{error}</p>}<h3>{order.product}</h3><span className={`due ${dueTone(order.dueDate,order.status)}`}>{dueLabel(order.dueDate,order.status)}</span>
        <dl><div><dt>Quantidade</dt><dd>{order.quantity} un.</dd></div>{order.unitPrice!==undefined&&<><div><dt>Camisa adulta</dt><dd>{displayMoney(order.unitPrice+poloExtra(order.shirtType,order.product))}</dd></div><div><dt>Infantil</dt><dd>{order.childQuantity||0} un. · {displayMoney(order.childUnitPrice ?? Math.max(0,order.unitPrice+poloExtra(order.shirtType,order.product)-5))} cada</dd></div></>}<div><dt>Entrega</dt><dd>{order.dueDate ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${order.dueDate}T12:00:00`)) : "Sem prazo"}</dd></div><div><dt>Total</dt><dd>{displayMoney(order.total)}</dd></div><div><dt>Recebido</dt><dd>{displayMoney(order.paid)}</dd></div><div><dt>Pendente</dt><dd>{displayMoney(order.receivable ?? Math.max(0,order.total-order.paid))}</dd></div>{order.phone && <div><dt>Contato</dt><dd>{order.phone}</dd></div>}{order.dtfStatus && <div><dt>DTF</dt><dd>{orderDtfStatus[order.dtfStatus]}</dd></div>}</dl>
        {order.status !== "Orçamento" && <OrderPaymentHistory order={order} payments={payments} displayMoney={displayMoney} />}
        {order.notes && <p className="kanban-order-notes">{order.notes}</p>}
        <div className="kanban-order-dialog-actions"><button className="secondary" onClick={openChecklist}><ClipboardList size={16} /> Abrir lista</button><button className="secondary" disabled={busy} onClick={edit}><Pencil size={16} /> Editar pedido</button>{next && <button className="primary" disabled={busy} onClick={() => move(next)}>{next === "Entregue" ? "Marcar como entregue" : order.status === "Orçamento" ? "Confirmar pedido" : "Avançar etapa"}<ArrowRight size={16} /></button>}<button className="secondary" disabled={busy} onClick={remove}><Trash2 size={16} /> Excluir pedido</button>{order.status === "Orçamento" && <button className="secondary" onClick={() => void copyQuote()}>Copiar orçamento</button>}</div>{copyStatus && <p role="status">{copyStatus}</p>}
        {order.status === "Pronto" && /^\d{8,15}$/.test(phone) && <a className="production-note-link" href={`https://wa.me/${phone}?text=${encodeURIComponent(`Olá, ${order.customer}. Seu pedido da PSYZON está pronto para retirada ou entrega.`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Avisar cliente</a>}
      </section>
    </div>
  </ProductionChecklistWindow>;
}
