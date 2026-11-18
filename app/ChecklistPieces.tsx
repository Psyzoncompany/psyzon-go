"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { productionCollar, type ProductionCollar, type ProductionRow } from "./production-checklist";

export default function ChecklistPieces({ rows, defaultCollar, onUpdate, onRemove }: {
  rows: ProductionRow[];
  defaultCollar?: ProductionCollar;
  onUpdate: (id: string, patch: Partial<ProductionRow>) => void;
  onRemove: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 960));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const split = wide && rows.length > 1 ? Math.ceil(rows.length / 2) : rows.length;
  const columns = split < rows.length ? [rows.slice(0, split), rows.slice(split)] : [rows];
  const showCollars = Boolean(defaultCollar || rows.some(row => row.collar));
  return <div ref={root} className="checklist-table-columns" data-columns={columns.length}>
    {columns.map((items, column) => <div className="checklist-table-wrap" key={column}>
      <table className="checklist-table" aria-label={columns.length > 1 ? `Peças - coluna ${column + 1}` : "Lista de peças"}>
        <thead><tr><th scope="col">OK</th><th scope="col">Modelo</th><th scope="col">Tamanho</th><th scope="col">Nome na peça</th><th scope="col"><span className="sr-only">Excluir</span></th></tr></thead>
        <tbody>{items.map((row, index) => {
          const number = column * split + index + 1;
          return <tr key={row.id} className={row.done ? "done" : ""}>
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
