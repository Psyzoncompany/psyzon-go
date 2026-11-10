"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function NoteDialog({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current!;
    (root.querySelector<HTMLElement>("input, button, select, textarea") ?? root).focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key === "Tab") {
        const focusable = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    root.addEventListener("keydown", keydown);
    return () => { root.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="an-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`an-dialog ${wide ? "wide" : ""}`}><header><h2>{title}</h2><button className="an-icon" aria-label={`Fechar ${title.toLowerCase()}`} onClick={close}><X size={20} /></button></header>{children}</div></div>, document.body);
}
