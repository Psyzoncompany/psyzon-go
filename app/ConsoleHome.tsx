"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Boxes, CheckSquare, Layers, Plus, Users, Wallet } from "lucide-react";
import type { View } from "./useViewHistory";

const activities = [
  { view: "producao", title: "Produção", icon: Boxes, action: "Abrir Kanban" },
  { view: "dtf", title: "Estampas DTF", icon: Layers, action: "Abrir DTF" },
  { view: "afazeres", title: "Afazeres", icon: CheckSquare, action: "Abrir checklist" },
  { view: "clientes", title: "Clientes", icon: Users, action: "Abrir clientes" },
  { view: "financeiro", title: "Financeiro", icon: Wallet, action: "Abrir financeiro" },
] as const;

type Props = {
  navigate: (view: View) => void;
  create: () => void;
  orderCount: number;
  urgentCount: number;
  dtfCount: number;
  taskCount: number;
  customerCount: number;
  payable: string;
  receivable: string;
};

function count(value: number, one: string, many: string) {
  return value + " " + (value === 1 ? one : many);
}

export default function ConsoleHome(props: Props) {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const activity = activities[index];
  const details = [
    count(props.orderCount, "pedido em andamento", "pedidos em andamento") + " · " + count(props.urgentCount, "entrega próxima ou atrasada", "entregas próximas ou atrasadas"),
    count(props.dtfCount, "pedido DTF registrado", "pedidos DTF registrados"),
    count(props.taskCount, "tarefa pendente", "tarefas pendentes"),
    count(props.customerCount, "cliente cadastrado", "clientes cadastrados"),
    "A pagar " + props.payable + " · A receber " + props.receivable,
  ];

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      props.navigate(activities[current].view);
      return;
    }
    let next = current;
    switch (event.key) {
      case "ArrowRight": next = (current + 1) % activities.length; break;
      case "ArrowLeft": next = (current + activities.length - 1) % activities.length; break;
      case "Home": next = 0; break;
      case "End": next = activities.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setIndex(next);
    tabs.current[next]?.focus();
  }

  return <section className="console-home" aria-label="Central de atividades">
    <div className="console-banner" data-activity={activity.view}>
      <div className="console-launcher" role="tablist" aria-label="Selecionar atividade">
        {activities.map(({ view, title, icon: Icon }, i) => <button key={view} type="button" role="tab" id={id + view}
          aria-controls={id + "detail"} aria-selected={i === index} tabIndex={i === index ? 0 : -1}
          onFocus={() => setIndex(i)} ref={element => { tabs.current[i] = element; }} onKeyDown={event => handleKeys(event, i)} onClick={() => setIndex(i)}>
          <span className="console-tile" data-tile={view}><Icon aria-hidden="true" /></span><span>{title}</span>
        </button>)}
      </div>
      <div className="console-feature" role="tabpanel" id={id + "detail"} aria-labelledby={id + activity.view}>
        <h1>{activity.title}</h1><p>{details[index]}</p>
        <div className="console-actions">
          <button type="button" onClick={() => props.navigate(activity.view)}>{activity.action}<ArrowUpRight size={16} /></button>
          {index === 0 && <button type="button" onClick={props.create}><Plus size={16} />Novo pedido</button>}
        </div>
      </div>
    </div>
  </section>;
}
