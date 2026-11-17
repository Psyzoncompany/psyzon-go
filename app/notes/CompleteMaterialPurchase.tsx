"use client";

import { useState, type FormEvent } from "react";
import { roundMoney } from "../finance-model";
import NoteDialog from "./NoteDialog";
import { materialPurchaseSnapshot, type MaterialOrder, type MaterialPurchaseInput } from "./materials-model";
import "../operational-controls.css";

export default function CompleteMaterialPurchase({ order, save, close }: {
  order: MaterialOrder;
  save: (items: MaterialPurchaseInput[]) => Promise<void>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await save(order.materials.map((item, index) => ({
        id: item.id,
        expected: materialPurchaseSnapshot(item),
        fabricKg: Number(data.get(`fabric-${index}`)),
        collarQuantity: Number(data.get(`collar-${index}`)),
        amount: Number(data.get(`amount-${index}`)),
      })));
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a compra.");
    } finally { setBusy(false); }
  }

  return <NoteDialog title="Concluir compra" wide close={() => { if (!busy) close(); }}>
    <form className="operations-form" onSubmit={submit}>
      <p className="operations-muted">{order.title}</p>
      {order.materials.map((item, index) => {
        const polo = item.collarType === "polo";
        return <fieldset className="materials-purchase-item" key={item.id} disabled={busy}>
          <legend>Malha {item.fabricType} · {item.color} · {item.supplier}</legend>
          <label>Malha comprada (kg)<input name={`fabric-${index}`} type="number" inputMode="decimal" min="0" max="1000000" step="any" required defaultValue={item.fabricKg} /></label>
          <label>{polo ? "Gola + punho (conj.)" : "Ribana comprada (kg)"}<input name={`collar-${index}`} type="number" inputMode={polo ? "numeric" : "decimal"} min="0" max="1000000" step={polo ? "1" : "any"} required defaultValue={polo ? item.poloUnits : item.ribanaKg} /></label>
          <label>Valor real (R$)<input name={`amount-${index}`} type="number" inputMode="decimal" min="0" max="100000000" step=".01" required defaultValue={roundMoney(item.totalCost).toFixed(2)} /></label>
        </fieldset>;
      })}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? "Salvando…" : "Confirmar compra"}</button>
    </form>
  </NoteDialog>;
}
