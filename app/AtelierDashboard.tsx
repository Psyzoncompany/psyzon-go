"use client";

import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, ClipboardList, Layers, NotebookPen, Plus, Printer, Shirt, Spool, WalletCards } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CountUp } from "./MotionValue";
import MoneyText from "./MoneyText";
import { nextOrderAction } from "./order-follow-up";
import type { OrderAlert } from "./order-alerts";
import { dueLabel, productionStages, urgentOrder, type Order } from "./order-model";
import type { Task } from "./notes/task-model";
import type { View } from "./useViewHistory";

type Props = {
  name: string;
  today: string;
  orders: Order[];
  deliveredReceivables: Order[];
  alerts: ReadonlyMap<string, OrderAlert[]>;
  tasks: ReadonlyMap<string, Task[]>;
  balanceCard: ReactNode;
  payable: number;
  pending: number;
  sewingTotal: number;
  nextPayables: { label: string; total: number };
  dtfAlertCount: number;
  money: (value: number) => string;
  navigate: (view: View, id?: string) => void;
  create: (kind: "pedido" | "cliente" | "orcamento") => void;
  openChecklist: (order: Order) => void;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });
const shortcuts = [
  { view: "materiais", icon: Layers, title: "Materiais" },
  { view: "dtf", icon: Printer, title: "Estampas DTF" },
  { view: "afazeres", icon: ClipboardList, title: "Afazeres" },
  { view: "notas", icon: NotebookPen, title: "Bloco de notas" },
] as const;
const stageLabels = ["Orçamento", "Material", "Produção", "Pronto"];
const byDeadline = (a: Order, b: Order) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
const filters = [
  { id: "active", label: "Na fila", empty: "Nenhum pedido confirmado na fila." },
  { id: "urgent", label: "Urgentes", empty: "Nenhuma entrega atrasada ou nos próximos dois dias." },
  { id: "collect", label: "Cobranças", empty: "Nenhum pedido entregue com saldo pendente." },
] as const;

export default function AtelierDashboard(props: Props) {
  const { name, today, orders, deliveredReceivables, alerts, tasks, navigate, create, money } = props;
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("active");
  const date = dateFormat.format(new Date(today + "T12:00:00Z"));
  const confirmed = orders.filter(order => order.status !== "Orçamento");
  const urgent = confirmed.filter(order => urgentOrder(order, today));
  const queue = [...(filter === "collect" ? deliveredReceivables : filter === "urgent" ? urgent : confirmed)].sort(byDeadline);
  const stageCounts = productionStages.map(stage => orders.filter(order => order.status === stage).length);
  const financialRows = [
    { label: "A receber", value: props.pending, icon: ArrowDownLeft, view: "financeiro", tone: "income" },
    { label: "A pagar", value: props.payable, icon: ArrowUpRight, view: "financeiro", tone: "expense" },
    { label: "Costura a pagar", value: props.sewingTotal, icon: Spool, view: "costureiras", tone: "sewing" },
  ] as const;
  const todayDate = new Date(today + "T12:00:00");

  return <div className="atelier-desk">
    <header className="atelier-hero" data-reveal-card>
      <div className="atelier-hero-copy">
        <span className="atelier-edition"><i aria-hidden="true" /> PSYZON COMPANY</span>
        <h1>{name ? `Seu ateliê, ${name}.` : "Seu ateliê."}</h1>
        <p><CalendarDays size={15} aria-hidden="true" />{date}</p>
        <div className="atelier-hero-actions">
          <button type="button" onClick={() => create("pedido")}><Plus size={19} /> Novo pedido</button>
          <button type="button" onClick={() => create("orcamento")}>Novo orçamento <ArrowUpRight size={16} /></button>
        </div>
      </div>
    </header>

    <nav className="atelier-shortcuts" aria-label="Atalhos do ateliê">
      {shortcuts.map(({ view, icon: Icon, title }) => <button type="button" key={view} onClick={() => navigate(view)} data-reveal-card>
        <span className="atelier-symbol"><Icon size={19} /></span>
        <span>{title}{view === "dtf" && props.dtfAlertCount > 0 && <small>{props.dtfAlertCount} a pedir</small>}</span>
        <ArrowUpRight className="atelier-shortcut-arrow" size={16} aria-hidden="true" />
      </button>)}
    </nav>

    <div className="atelier-columns">
      <section className="atelier-surface atelier-queue" data-reveal-card aria-labelledby="atelier-orders-title">
        <header className="atelier-section-heading">
          <div><span className="atelier-caption">PRODUÇÃO</span><h2 id="atelier-orders-title">Fila de trabalho</h2></div>
          <button type="button" className="atelier-link" onClick={() => navigate("producao")}>Ver quadro <ArrowUpRight size={15} /></button>
        </header>
        <div className="atelier-filters" role="group" aria-label="Filtrar fila de trabalho">
          {filters.map(({ id, label }) => <button type="button" key={id} aria-pressed={id === filter} onClick={() => setFilter(id)}>
            {label}<span>{id === "active" ? confirmed.length : id === "urgent" ? urgent.length : deliveredReceivables.length}</span>
          </button>)}
        </div>
        {queue.length === 0 ? <p className="atelier-empty">{filters.find(item => item.id === filter)?.empty}</p> : <ul className="atelier-orders">
          {queue.slice(0, 5).map(order => {
            const action = nextOrderAction(order, alerts.get(order.id) ?? [], tasks.get(order.id) ?? []);
            const critical = urgentOrder(order, today);
            return <li key={order.id} data-critical={critical}>
              <span className="atelier-order-icon"><Shirt size={19} aria-hidden="true" /></span>
              <div className="atelier-order-name">
                <b>{order.customer}</b><small>{order.product} · {order.quantity} un.</small>
                {action && <button type="button" className="atelier-order-action" onClick={() => navigate(action.view, "id" in action ? action.id : undefined)}>
                  {action.title}<ArrowRight size={13} />
                </button>}
              </div>
              <div className="atelier-order-meta">
                <span>{order.status}</span>
                {filter === "collect" ? <MoneyText>{money(order.receivable ?? 0)}</MoneyText> : <small>{dueLabel(order.dueDate, order.status, todayDate)}</small>}
                {filter !== "collect" && <button type="button" className="atelier-checklist" aria-label={`Abrir checklist de ${order.customer}`} title="Abrir checklist" onClick={() => props.openChecklist(order)}><ClipboardList size={17} /></button>}
              </div>
            </li>;
          })}
        </ul>}
        {queue.length > 5 && <button type="button" className="atelier-more atelier-link" onClick={() => navigate(filter === "collect" ? "financeiro" : "producao")}>Ver todos os {queue.length} {filter === "collect" ? "saldos" : "pedidos"} <ArrowRight size={15} /></button>}
      </section>

      <section className="atelier-surface atelier-finance" data-reveal-card aria-labelledby="atelier-finance-title">
        <header className="atelier-section-heading">
          <div><span className="atelier-caption">FINANCEIRO</span><h2 id="atelier-finance-title">Contas da empresa</h2></div>
          <span className="atelier-symbol"><WalletCards size={21} aria-hidden="true" /></span>
        </header>
        <div className="atelier-balance">{props.balanceCard}</div>
        <div className="atelier-finance-list">
          {financialRows.map(({ label, value, icon: Icon, view, tone }) => <button type="button" key={label} onClick={() => navigate(view)} data-tone={tone}>
            <Icon size={19} aria-hidden="true" /><span>{label}</span><strong><CountUp value={value} format={money} /></strong><ArrowUpRight size={14} aria-hidden="true" />
          </button>)}
        </div>
        <div className="atelier-forecast"><span>A pagar em {props.nextPayables.label}</span><strong><MoneyText>{money(props.nextPayables.total)}</MoneyText></strong></div>
      </section>
    </div>

    <section className="atelier-surface atelier-stages" data-reveal-card aria-labelledby="atelier-stages-title">
      <header className="atelier-section-heading"><div><span className="atelier-caption">QUADRO</span><h2 id="atelier-stages-title">Pedidos por etapa</h2></div><button type="button" className="atelier-link" onClick={() => navigate("producao")}>Abrir produção <ArrowUpRight size={15} /></button></header>
      <dl>{stageLabels.map((label, index) => <div key={label}><dt>{label}</dt><dd><CountUp value={stageCounts[index]} /></dd></div>)}</dl>
    </section>
  </div>;
}
