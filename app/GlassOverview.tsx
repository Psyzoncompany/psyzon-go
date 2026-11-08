"use client";

import { ArrowUpRight, Boxes, Layers, ListChecks, NotebookPen, Plus, Printer } from "lucide-react";
import type { View } from "./useViewHistory";

export default function GlassOverview({ userName, orders, tasks, navigate, create }: {
  userName: string;
  orders: number;
  tasks: number;
  navigate: (view: View) => void;
  create: () => void;
}) {
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bahia" }).format(new Date());
  return <section className="glass-overview" aria-label="Resumo do seu dia">
    <div className="glass-overview-heading"><div><span className="glass-kicker">{date}</span><h1>Olá, {userName}<span>.</span></h1><p>{orders} {orders === 1 ? "pedido em andamento" : "pedidos em andamento"}<span>·</span>{tasks} {tasks === 1 ? "afazer pendente" : "afazeres pendentes"}</p></div><button className="primary" onClick={create}><Plus size={19} /> Novo pedido</button></div>
    <div className="glass-shortcuts">{[
      { view: "producao", label: "Produção", detail: "Etapas e entregas", icon: Boxes },
      { view: "dtf", label: "DTF", detail: "Estampas e separação", icon: Printer },
      { view: "materiais", label: "Materiais", detail: "Organizar compras", icon: Layers },
      { view: "afazeres", label: "Afazeres", detail: "Checklist do dia", icon: ListChecks },
    ].map(({ view, label, detail, icon: Icon }) => <button key={view} onClick={() => navigate(view as View)}><span className="glass-shortcut-icon"><Icon size={21} strokeWidth={1.6} /></span><span><b>{label}</b><small>{detail}</small></span><ArrowUpRight size={15} /></button>)}</div>
    <button className="glass-notes-link" onClick={() => navigate("notas")}><NotebookPen size={16} /> Abrir Bloco de notas <ArrowUpRight size={14} /></button>
  </section>;
}
