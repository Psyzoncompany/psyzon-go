"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./production-checklist-window.css";

export default function ProductionChecklistWindow({ customer, close, children }: { customer: string; close: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const element = panel.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest(".modal-backdrop")) return;
      if (event.key === "Escape") { event.stopPropagation(); close(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    element?.addEventListener("keydown", onKeyDown);
    return () => element?.removeEventListener("keydown", onKeyDown);
  }, [close]);
  return <div className="production-checklist-overlay">
    <button className="production-checklist-dismiss" aria-label="Fechar lista de produção" onClick={close} />
    <div ref={panel} className="production-checklist-window" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="production-window-title">
      <header className="production-window-heading"><div><h2 id="production-window-title">Checklist de produção</h2><p>{customer} · Vinculado ao pedido</p></div><button type="button" aria-label="Fechar checklist" onClick={close}><X size={22} /></button></header>
      {children}
    </div>
  </div>;
}
