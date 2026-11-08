"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export default function FinanceDetailSheet({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="finance-detail-sheet" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close(); }} onClick={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <section><div className="finance-sheet-handle" aria-hidden="true"/><header><span>DETALHES</span><button type="button" autoFocus aria-label="Fechar detalhes" disabled={busy} onClick={close}><X size={20}/></button></header><h2>{title}</h2>{children}</section>
  </dialog>, document.body);
}
