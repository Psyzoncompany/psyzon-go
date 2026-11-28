"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import { Trash2 } from "lucide-react";
import { productionCollar, type ProductionCollar, type ProductionRow } from "./production-checklist";
import { productionSizeColor } from "./production-size-color";

export default function ChecklistPieces({ rows, defaultCollar, onUpdate, onRemove }: {
  rows: ProductionRow[];
  defaultCollar?: ProductionCollar;
  onUpdate: (id: string, patch: Partial<ProductionRow>) => void;
  onRemove: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [editingOrder, setEditingOrder] = useState<string[] | null>(null);
  const sortFrame = useRef<number | undefined>(undefined);
  const restoreScroll = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    restoreScroll.current?.();
    restoreScroll.current = undefined;
  }, [editingOrder]);
  useEffect(() => () => cancelAnimationFrame(sortFrame.current ?? 0), []);

  function beginEditing() {
    cancelAnimationFrame(sortFrame.current ?? 0);
    // Keep the same row and column while its values continue to autosave.
    if (!editingOrder) setEditingOrder(rows.map(row => row.id));
  }

  function finishEditing(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    cancelAnimationFrame(sortFrame.current ?? 0);
    sortFrame.current = requestAnimationFrame(() => {
      const element = root.current;
      if (!element || element.contains(document.activeElement)) return;
      // Focus has reached the next control. Sort without moving that control
      // or letting scroll anchoring follow the row to its new size group.
      const positions: { element: HTMLElement; top: number; left: number }[] = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        positions.push({ element: parent, top: parent.scrollTop, left: parent.scrollLeft });
      }
      restoreScroll.current = () => positions.forEach(({ element, top, left }) => {
        if (element.isConnected && (element.scrollTop !== top || element.scrollLeft !== left)) element.scrollTo({ top, left, behavior: "instant" });
      });
      setEditingOrder(null);
    });
  }
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 960));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ranks = new Map(editingOrder?.map((id, index) => [id, index]));
  const visibleRows = editingOrder ? [...rows].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)) : rows;
  const split = wide && visibleRows.length > 1 ? Math.ceil(visibleRows.length / 2) : visibleRows.length;
  const columns = split < visibleRows.length ? [visibleRows.slice(0, split), visibleRows.slice(split)] : [visibleRows];
  const showCollars = Boolean(defaultCollar || rows.some(row => row.collar));
  return <div ref={root} className="checklist-table-columns" data-columns={columns.length} onFocusCapture={beginEditing} onBlurCapture={finishEditing}>
    {columns.map((items, column) => <div className="checklist-table-wrap" key={column}>
      <table className="checklist-table" aria-label={columns.length > 1 ? `Peças - coluna ${column + 1}` : "Lista de peças"}>
        <thead><tr><th scope="col">OK</th><th scope="col">Modelo</th><th scope="col">Tamanho</th><th scope="col">Nome na peça</th><th scope="col"><span className="sr-only">Excluir</span></th></tr></thead>
        <tbody>{items.map((row, index) => {
          const number = column * split + index + 1;
          return <tr key={row.id} className={row.done ? "done" : ""} style={productionSizeColor(row.size)}>
            <td><label className="checklist-row-check"><input type="checkbox" checked={row.done} onChange={event => onUpdate(row.id, { done: event.target.checked })} aria-label={`Conferir peça ${number}: ${row.name}`} /></label></td>
            <td>
              <input value={row.model} maxLength={80} aria-label={`Modelo da peça ${number}`} onChange={event => onUpdate(row.id, { model: event.target.value })} />
              {showCollars && <select className="checklist-collar" aria-label={`Gola da peça ${number}: ${row.name}`} value={row.collar ?? ""} onChange={event => onUpdate(row.id, { collar: productionCollar(event.target.value) })}>
                <option value="">{defaultCollar === "polo" ? "Polo padrão" : defaultCollar === "common" ? "Normal padrão" : "Sem gola definida"}</option>
                <option value="polo">Polo</option>
                <option value="common">Normal</option>
              </select>}
            </td>
            <td><input value={row.size} maxLength={40} aria-label={`Tamanho da peça ${number}`} onChange={event => onUpdate(row.id, { size: event.target.value })} /></td>
            <td><input value={row.name} maxLength={160} aria-label={`Nome da peça ${number}`} onChange={event => onUpdate(row.id, { name: event.target.value })} /></td>
            <td><button type="button" aria-label={`Excluir peça ${number}`} onClick={() => onRemove(row.id)}><Trash2 size={14} /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>)}
  </div>;
}
