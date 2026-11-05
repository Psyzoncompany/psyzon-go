"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function Modal({ titleId, busy, close, children }: { titleId: string; busy: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const element = ref.current;
    const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !busy) { event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    element?.addEventListener("keydown", onKey);
    return () => element?.removeEventListener("keydown", onKey);
  }, [busy, close]);
  return <div className="modal-backdrop"><button className="modal-dismiss" disabled={busy} aria-label="Fechar janela" onClick={close} /><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>{children}</div></div>;
}
