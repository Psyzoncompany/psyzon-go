"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Boxes, ChartNoAxesCombined, ClipboardList, Eye, EyeOff, Plus, ReceiptText, Sparkles, UserRound, X } from "lucide-react";
import Modal from "./Modal";
import { cashTotals, flowDate, flowPeriods, flowSeries, movementDay, type FlowMovement, type Period } from "./flow-model";
import { roundMoney } from "./finance-model";
import { dueLabel, urgentOrder, type Order } from "./order-model";
import { millis } from "./notes-model";
import type { View } from "./useViewHistory";

type Money = (value: number) => string;
type CashProps = { transactions: FlowMovement[]; today: string; hidden: boolean; money: Money };
type Metric = "received" | "spent" | "result";
const modes = [["received", "Receita"], ["spent", "Despesas"], ["result", "Resultado"]] as const;

function CashChart({ transactions, today, hidden, money, extended = false }: CashProps & { extended?: boolean }) {
  const [period, setPeriod] = useState<Period>(30);
  const [mode, setMode] = useState<Metric>("received");
  const [focused, setFocused] = useState<number>();
  const gradient = useId();
  const { items, points } = useMemo(() => flowSeries(transactions, today, period), [transactions, today, period]);
  const values = points.map(point => point[mode]);
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const y = (value: number) => 158 - (value - low) / (high - low || 1) * 130;
  const xy = values.map((value, index) => [16 + index * 488 / Math.max(values.length - 1, 1), y(value)] as const);
  const path = xy.map(([x, pointY], index) => {
    if (!index) return `M ${x},${pointY}`;
    const [priorX, priorY] = xy[index - 1];
    const middle = (x + priorX) / 2;
    return `C ${middle},${priorY} ${middle},${pointY} ${x},${pointY}`;
  }).join(" ");
  const active = points[focused ?? points.length - 1];
  const categories = new Map<string, number>();
  if (extended && !hidden) for (const item of items) {
    if (item.type === "expense") {
      const name = item.category || "Outros";
      categories.set(name, roundMoney((categories.get(name) ?? 0) + item.amount));
    }
  }
  const ranked = [...categories].sort((a, b) => b[1] - a[1]);
  const totals = cashTotals(items);
  return <section className="flow-card flow-chart" aria-label="Desempenho financeiro">
    <header><div><ChartNoAxesCombined size={19} aria-hidden="true" /><h2>Desempenho</h2></div>
      <select aria-label="Período do gráfico" value={period} onChange={event => { setPeriod(Number(event.target.value) as Period); setFocused(undefined); }}>
        {flowPeriods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </header>
    <div className="flow-segments" aria-label="Indicador do gráfico">{modes.map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setFocused(undefined); }}>{label}</button>)}</div>
    {hidden ? <p className="flow-empty">Mostre os valores para visualizar o gráfico.</p> : !items.length ? <p className="flow-empty">Nenhuma movimentação neste período.</p> : <>
      <p className="flow-chart-reading" aria-live="polite"><strong>{money(focused === undefined ? totals[mode] : active[mode])}</strong><small>{focused === undefined ? "No período" : `A partir de ${flowDate(active.from)}`}</small></p>
      <svg viewBox="0 0 520 176" role="group" aria-label={modes.find(([key]) => key === mode)?.[1]}>
        <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".26" /><stop offset="1" stopColor="currentColor" stopOpacity=".01" /></linearGradient></defs>
        <path className="flow-chart-grid" d="M16 28H504 M16 71H504 M16 115H504 M16 158H504" />
        <path fill={`url(#${gradient})`} d={`${path} L${xy.at(-1)?.[0]},${y(0)} L16,${y(0)} Z`} />
        <path className="flow-chart-line" d={path} />
        {xy.map(([x, pointY], index) => <g key={points[index].from} tabIndex={0} aria-label={`${flowDate(points[index].from)} · ${money(values[index])}`} onFocus={() => setFocused(index)} onBlur={() => setFocused(undefined)} onPointerEnter={() => setFocused(index)} onPointerLeave={() => setFocused(undefined)} onClick={() => setFocused(index)}>
          <title>{flowDate(points[index].from)} · {money(values[index])}</title><circle cx={x} cy={pointY} r="13" fill="transparent" /><circle cx={x} cy={pointY} r={focused === index ? 6 : 3} fill="currentColor" />
        </g>)}
      </svg>
      <div className="flow-chart-axis"><span>{flowDate(points[0].from).slice(0, 5)}</span><span>{flowDate(today).slice(0, 5)}</span></div>
      {extended && <div className="flow-comparison"><b>Receitas e despesas no período</b>{[["Receitas", totals.received], ["Despesas", totals.spent]].map(([label, value]) => <div key={label}><span>{label}</span><meter min={0} max={Math.max(totals.received, totals.spent, 1)} value={Number(value)} /><strong>{money(Number(value))}</strong></div>)}</div>}
      {ranked.length > 0 && <details className="flow-comparison"><summary>Despesas por categoria</summary>{ranked.map(([name, value]) => <div key={name}><span>{name}</span><meter min={0} max={ranked[0][1]} value={value} /><strong>{money(value)}</strong></div>)}</details>}
    </>}
  </section>;
}

export function FlowStatement({ transactions, money, onEdit, orders = [] }: { transactions: FlowMovement[]; money: Money; onEdit?: (item: FlowMovement) => void; orders?: Order[] }) {
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const selected = transactions.find(item => item.id === selectedId);
  const entries = [
    ...transactions.filter(item => filter === "all" || item.type === filter).map(item => ({ id: `cash-${item.id}`, title: item.description, date: movementDay(item), detail: `${item.category || "Movimentação"} · ${item.type === "income" ? "Recebido" : item.type === "expense" ? "Pago" : "Transferência"}`, item })),
    ...orders.map(order => ({ id: `order-${order.id}`, title: order.customer, date: movementDay({ createdAt: order.createdAt } as FlowMovement), detail: `Pedido · ${order.status}`, item: undefined })),
  ].sort((a,b) => b.date.localeCompare(a.date));
  const [limit, setLimit] = useState(8);
  return <section className="flow-card flow-statement" aria-label={onEdit ? "Extrato financeiro" : "Atividade recente"}>
    <header><div><ReceiptText size={19} aria-hidden="true" /><h2>{onEdit ? "Extrato financeiro" : "Atividade recente"}</h2></div>{onEdit && <select aria-label="Tipo de movimentação" value={filter} onChange={event => { setFilter(event.target.value); setLimit(8); }}><option value="all">Todas</option><option value="income">Entradas</option><option value="expense">Saídas</option><option value="transfer">Transferências</option></select>}</header>
    {entries.length ? <ul>{entries.slice(0, limit).map(({ id, title, date, detail, item }) => <li key={id}>
      <span className="flow-row-icon" data-tone={item?.type}>{item ? item.type === "income" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} /> : <Boxes size={17} />}</span>
      <div>{onEdit && item ? <button type="button" className="flow-movement-detail" onClick={() => setSelectedId(item.id)} aria-label={`Detalhes de ${title}`}>{title}</button> : <b>{title}</b>}<small>{detail} · {flowDate(date)}</small></div>
      {item && <strong data-tone={item.type}>{item.type === "income" ? "+ " : item.type === "expense" ? "− " : ""}{money(item.amount)}</strong>}
      {onEdit && item && !item.source && !item.orderId && !item.billId && !item.customerId && item.type !== "transfer" && <button type="button" className="flow-text-button" onClick={() => onEdit(item)} aria-label={`Editar ${title}`}>Editar</button>}
    </li>)}</ul> : <p className="flow-empty">Nenhuma atividade registrada.</p>}
    {entries.length > limit && <button type="button" className="flow-text-button" onClick={() => setLimit(count => count + 8)}>Ver mais</button>}
    {selected && <Modal titleId="flow-statement-title" busy={false} close={() => setSelectedId("")}>
      <header><h2 id="flow-statement-title">{selected.description}</h2><button type="button" aria-label="Fechar" onClick={() => setSelectedId("")}><X size={20} /></button></header>
      <div className="flow-customer-profile"><dl className="finance-sheet-data"><div><dt>Valor</dt><dd>{money(selected.amount)}</dd></div><div><dt>Data</dt><dd>{flowDate(movementDay(selected))}</dd></div><div><dt>Categoria</dt><dd>{selected.category || "Outros"}</dd></div><div><dt>Tipo</dt><dd>{selected.type === "income" ? "Entrada recebida" : selected.type === "expense" ? "Despesa paga" : "Transferência"}</dd></div></dl></div>
    </Modal>}
  </section>;
}

type DashboardProps = CashProps & {
  firstName: string; payable: number; receivable: number; upcoming: number; orders: Order[];
  navigate: (view: View) => void; createOrder: () => void; createQuote: () => void; record: (kind: "income" | "expense") => void;
  togglePrivacy: () => void; notifications: () => void; notificationCount: number;
};

function CashOverview({ transactions, today, payable, receivable, money }: CashProps & { payable: number; receivable: number; }) {
  const movements = transactions.filter(item => !movementDay(item) || movementDay(item) <= today);
  const month = today.slice(0, 7);
  const previousDate = new Date(today + "T12:00:00Z");
  previousDate.setUTCDate(0);
  const previous = previousDate.toISOString().slice(0, 7);
  const balance = cashTotals(movements).result;
  const monthly = cashTotals(movements.filter(item => movementDay(item).startsWith(month)));
  const previousResult = cashTotals(movements.filter(item => movementDay(item).startsWith(previous))).result;
  const variation = roundMoney(monthly.result - previousResult);
  return <div className="flow-cash-content">
    <div><span>Saldo registrado</span><strong>{money(balance)}</strong><small>Movimentações da empresa</small></div>
    <dl><div><dt>Entradas no mês</dt><dd>{money(monthly.received)}</dd></div><div><dt>Despesas no mês</dt><dd>{money(monthly.spent)}</dd></div><div><dt>Saldo previsto</dt><dd>{money(roundMoney(balance + receivable - payable))}</dd></div></dl>
    <small>Resultado do mês {money(monthly.result)} · Variação sobre o mês anterior {money(variation)}</small>
  </div>;
}

export function FlowDashboard({ firstName, orders, upcoming, navigate, createOrder, createQuote, record, togglePrivacy, notifications, notificationCount, ...cash }: DashboardProps) {
  const confirmed = orders.filter(order => order.status !== "Orçamento" && order.status !== "Entregue");
  const priority = confirmed.filter(order => order.dueDate).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,3);
  const actions = [
    ["Novo pedido", Plus, createOrder], ["Registrar entrada", ArrowDownLeft, () => record("income")],
    ["Registrar despesa", ArrowUpRight, () => record("expense")], ["Novo orçamento", ClipboardList, createQuote],
    ["Ver produção", Boxes, () => navigate("producao")],
  ] as const;
  return <div className="flow-dashboard">
    <section className="flow-hero">
      <header><div><span>PSYZON COMPANY</span><h1>{firstName ? `Olá, ${firstName}` : "Olá"}</h1></div><div className="flow-hero-actions">
        <button type="button" onClick={togglePrivacy} aria-label={cash.hidden ? "Mostrar valores financeiros" : "Ocultar valores financeiros"}>{cash.hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button>
        <button type="button" onClick={notifications} aria-label={`Abrir notificações (${notificationCount})`}><Bell size={20} />{notificationCount > 0 && <i />}</button>
        <button type="button" onClick={() => navigate("mais")} aria-label="Abrir perfil"><UserRound size={20} /></button>
      </div></header>
      <CashOverview {...cash} />
    </section>
    <section className="flow-actions" aria-label="Ações rápidas">{actions.map(([label, Icon, action]) => <button key={label} type="button" onClick={action}><span><Icon size={23} /></span>{label}</button>)}</section>
    <div className="flow-summary">
      {([["Em andamento", confirmed.length, "pedidos"], ["Aguardando material", confirmed.filter(item => item.status === "Aguardando material").length, "producao"], ["Próximas entregas", confirmed.filter(item => urgentOrder(item,cash.today)).length, "producao"], ["A receber", cash.money(cash.receivable), "financeiro"], ["Contas próximas ou atrasadas", upcoming, "financeiro"]] as const).map(([label, value, target]) => <button className="flow-card" type="button" key={label} onClick={() => navigate(target)}><small>{label}</small><strong>{value}</strong><ArrowRight size={16} /></button>)}
    </div>
    <div className="flow-dashboard-grid"><CashChart {...cash} /><section className="flow-card flow-priority"><header><div><Boxes size={19} /><h2>Próximas entregas</h2></div></header>
      {priority.length ? <ul>{priority.map(order => <li key={order.id}><b>{order.customer}</b><small>{dueLabel(order.dueDate,order.status,new Date(cash.today+"T12:00:00"))} · {order.quantity} un.</small></li>)}</ul> : <p className="flow-empty">Nenhum pedido com entrega prevista.</p>}
      <button type="button" className="flow-text-button" onClick={() => navigate("pedidos")}>Ver pedidos <ArrowRight size={16} /></button></section></div>
    <div className="flow-dashboard-grid"><FlowStatement transactions={cash.transactions} money={cash.money} orders={orders.filter(order => millis(order.createdAt) > 0)} /><button type="button" className="flow-card flow-assistant-link" onClick={() => navigate("ai")}><Sparkles size={22} /><span><b>Assistente PSYZON AI</b><small>Consultar dados da empresa</small></span><ArrowRight size={17} /></button></div>
  </div>;
}

export function FlowFinance({ payable, receivable, forecast, record, onEdit, ...cash }: CashProps & { payable: number; receivable: number; forecast: { days: number; income: number; expenses: number }[]; record: DashboardProps["record"]; onEdit: (item: FlowMovement) => void }) {
  return <div className="flow-finance">
    <section className="flow-hero"><header><div><span>PSYZON COMPANY</span><h1>Financeiro</h1></div></header><CashOverview {...cash} payable={payable} receivable={receivable} /></section>
    <div className="flow-finance-actions"><button className="primary" onClick={() => record("income")}><ArrowDownLeft size={18} /> Registrar entrada</button><button className="secondary" onClick={() => record("expense")}><ArrowUpRight size={18} /> Registrar despesa</button></div>
    <CashChart {...cash} extended />
    <section className="flow-card flow-forecast"><header><div><ReceiptText size={19} aria-hidden="true" /><h2>Previsão de caixa</h2></div></header><dl><div><dt>Valores a receber</dt><dd>{cash.money(receivable)}</dd></div><div><dt>Contas a pagar</dt><dd>{cash.money(payable)}</dd></div></dl>
      <div className="flow-forecast-periods">{forecast.map(row => <div key={row.days}><b>Até {row.days} dias</b><small>Entradas {cash.money(row.income)}</small><small>Saídas {cash.money(row.expenses)}</small><strong>{cash.money(roundMoney(row.income - row.expenses))}</strong></div>)}</div>
      <small className="flow-forecast-note">Previsão pelas datas registradas neste ciclo. Itens sem prazo entram apenas nos totais em aberto.</small>
    </section>
    <FlowStatement transactions={cash.transactions} money={cash.money} onEdit={onEdit} />
  </div>;
}

export function FlowMovementEditor({ today, draft, close, save }: { today: string; draft: { type: "income" | "expense"; item?: FlowMovement }; close: () => void; save: (input: Pick<FlowMovement,"description"|"amount"|"category"|"transactionDate"|"type">, id?: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await save({ description: String(data.get("description")).trim(), amount: roundMoney(Number(data.get("amount"))), category: String(data.get("category")).trim(), transactionDate: String(data.get("day")), type: draft.type }, draft.item?.id);
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <Modal titleId="flow-movement-title" busy={busy} close={close}>
    <header><h2 id="flow-movement-title">{draft.item ? "Editar movimentação" : draft.type === "income" ? "Registrar entrada" : "Registrar despesa"}</h2><button type="button" aria-label="Fechar" disabled={busy} onClick={close}><X size={20} /></button></header>
    <form onSubmit={submit}><label className="full">Descrição<input name="description" required maxLength={240} defaultValue={draft.item?.description} data-initial-focus /></label><label>Valor (R$)<input name="amount" type="number" min=".01" max="100000000" step=".01" required defaultValue={draft.item?.amount} /></label><label>Data<input name="day" type="date" required max={today} defaultValue={draft.item ? movementDay(draft.item) || today : today} /></label><label>Categoria<input name="category" required maxLength={100} defaultValue={draft.item?.category || "Outros"} /></label>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy ? "Salvando…" : "Confirmar registro"}</button></footer></form>
  </Modal>;
}
