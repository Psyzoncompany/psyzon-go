"use client";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Check, ChevronRight, Clock3, CircleAlert, Circle } from "lucide-react";
import type { FinanceStatus } from "./presentation";

export type FinanceListItem = { id: string; title: string; detail: string; amount: string; status: FinanceStatus; open: () => void; quick?: { label: string; icon: ReactNode; action: () => void }[] };
export function StatusIndicator({ status }: { status: FinanceStatus }) {
  const Icon = status.tone === "paid" ? Check : status.tone === "late" ? CircleAlert : status.tone === "soon" ? Clock3 : Circle;
  return <span className="finance-status" data-tone={status.tone}><Icon size={12} aria-hidden="true"/>{status.label}</span>;
}
export default function FinanceListCard({ title, subtitle, total, totalLabel, icon, items, empty, children }: { title: string; subtitle: string; total: string; totalLabel: string; icon: ReactNode; items: FinanceListItem[]; empty: string; children?: ReactNode }) {
  return <section className="finance-list-card" aria-label={title}>
    <header className="finance-card-header"><span className="finance-card-icon" aria-hidden="true">{icon}</span><div className="finance-card-title"><h2>{title}</h2><p>{subtitle}</p></div><div className="finance-card-total"><small>{totalLabel}</small><strong>{total}</strong></div></header>
    {children}
    {items.length ? <ul className="finance-rows">{items.map(item => <FinanceSwipeRow key={item.id} item={item}/>)}</ul> : <p className="finance-card-empty">{empty}</p>}
  </section>;
}
function FinanceSwipeRow({ item }: { item: FinanceListItem }) {
  const [offset, setOffset] = useState(0);
  const gesture = useRef<{ x: number; y: number; offset: number; moved: boolean } | null>(null);
  const suppressed = useRef(false);
  const revealWidth = Math.min(2, item.quick?.length ?? 0) * 68;
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = gesture.current;
    if (!start || !revealWidth) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved && Math.abs(dy) > Math.abs(dx)) { gesture.current = null; return; }
    if (!start.moved && Math.abs(dx) < 12) return;
    start.moved = true; suppressed.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setOffset(Math.max(-revealWidth, Math.min(0, start.offset + dx)));
  };
  const finish = () => {
    const start = gesture.current; gesture.current = null;
    if (start?.moved) setOffset(value => value < -revealWidth / 3 ? -revealWidth : 0);
  };
  return <li className="finance-swipe-row" onKeyDown={event => { if (event.key === "Escape") setOffset(0); }}>
    {!!revealWidth && <div className="finance-quick-actions" aria-hidden={offset === 0}>{item.quick?.slice(0,2).map(action => <button key={action.label} type="button" tabIndex={offset === 0 ? -1 : 0} onClick={() => { setOffset(0); action.action(); }}>{action.icon}<span>{action.label}</span></button>)}</div>}
    <button type="button" className="finance-row" aria-label={`${item.title}, ${item.amount}, ${item.status.label}. Abrir detalhes`} aria-haspopup="dialog" style={{ transform: `translateX(${offset}px)` }} onPointerDown={event => { if (event.button !== 0) return; suppressed.current = false; gesture.current = { x: event.clientX, y: event.clientY, offset, moved: false }; }} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setOffset(0); }} onClick={() => { if (suppressed.current) { suppressed.current = false; return; } if (offset) setOffset(0); else item.open(); }}>
      <span className="finance-row-copy"><b title={item.title}>{item.title}</b><small>{item.detail}</small><StatusIndicator status={item.status}/></span><strong className="finance-row-value">{item.amount}</strong><ChevronRight size={16} className="finance-row-chevron" aria-hidden="true"/>
    </button>
  </li>;
}
