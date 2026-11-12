"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardList, FileText, PackagePlus, Sparkles, Spool, Boxes, ChevronRight, History, Home, Layers, ListChecks, MoreHorizontal, NotebookPen, Printer, Settings, UsersRound, WalletCards, X } from "lucide-react";
import type { View } from "./useViewHistory";

const tabs = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "producao", label: "Produção", icon: Boxes },
  { id: "notas", label: "Notas", icon: NotebookPen },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
] as const;
const destinations = [
  { id: "dtf", label: "Pedidos DTF", detail: "Estampas e impressão", icon: Printer },
  { id: "clientes", label: "Clientes", detail: "Cadastros e saldos", icon: UsersRound },
  { id: "historico", label: "Histórico", detail: "Movimentações da empresa", icon: History },
  { id: "materiais", label: "Materiais", detail: "Compras da produção", icon: Layers },
  { id: "afazeres", label: "Afazeres", detail: "Tarefas do dia a dia", icon: ListChecks },
  { id: "mais", label: "Configurações", detail: "Conta e preferências", icon: Settings },
] as const;

const flowTabs = [tabs[0], { id: "pedidos", label: "Pedidos", icon: ClipboardList }, tabs[1], tabs[3]] as const;
const flowDestinations = [
  { id: "orcamentos", label: "Orçamentos", detail: "Propostas em aberto", icon: FileText },
  { id: "ai", label: "Assistente IA", detail: "PSYZON AI", icon: Sparkles },
  { id: "notas", label: "Bloco de notas", detail: "Anotações e listas de produção", icon: NotebookPen },
  { id: "reposicao", label: "Reposição de estoque", detail: "Compras e reposições", icon: PackagePlus },
  { id: "costureiras", label: "Costureiras", detail: "Pedidos e saldos", icon: Spool },
  ...destinations,
] as const;

export default function MobileNavigation({ view, navigate, flow = false }: { view: View; navigate: (view: View) => void; flow?: boolean }) {
  const mainTabs = flow ? flowTabs : tabs;
  const menuItems = flow ? flowDestinations : destinations;
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const menuActive = !mainTabs.some(item => item.id === view) && (flow || !["materiais", "afazeres", "reposicao", "costureiras"].includes(view));
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 761px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const go = (next: View) => { setOpen(false); navigate(next); };
  return <>
    <nav className="mobile-nav" aria-label="Navegação principal">
      {mainTabs.map(({ id, label, icon: Icon }) => {
        const active = view === id || (id === "notas" && ["materiais", "afazeres", "reposicao", "costureiras"].includes(view));
        return <button key={id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => go(id)}><Icon size={22} strokeWidth={1.8} /><span>{label}</span></button>;
      })}
      <button className={menuActive || open ? "active" : ""} aria-label="Mais opções" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><MoreHorizontal size={23} /><span>{flow ? "Menu" : "Mais"}</span></button>
    </nav>
    <dialog ref={dialog} className="mobile-menu-dialog" aria-labelledby="mobile-menu-title" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="mobile-menu-surface">
        <div className="mobile-menu-handle" aria-hidden="true" />
        <header><div><small>PSYZON GO</small><h2 id="mobile-menu-title">Mais opções</h2></div><button autoFocus aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="mobile-menu-links">{menuItems.map(({ id, label, detail, icon: Icon }) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => go(id)}><span className="mobile-menu-icon"><Icon size={21} strokeWidth={1.8} /></span><span><b>{label}</b><small>{detail}</small></span><ChevronRight size={17} /></button>)}</div>
      </section>
    </dialog>
  </>;
}
