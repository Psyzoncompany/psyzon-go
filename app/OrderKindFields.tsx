"use client";

import { specialOrderLabels, type Order, type SpecialOrderKind } from "./order-model";
import "./order-kind.css";

export function OrderKindPicker({ kind, change }: { kind?: SpecialOrderKind; change: (kind?: SpecialOrderKind) => void }) {
  return <fieldset className="order-kind-picker full">
    <legend>Tipo de pedido</legend>
    {(["repair", "collection"] as const).map(option => <label key={option}>
      <input type="checkbox" checked={kind === option} onChange={event => change(event.target.checked ? option : undefined)} />
      {specialOrderLabels[option]}
    </label>)}
  </fieldset>;
}

export function SpecialOrderFields({ kind, order, defaultDeadline }: { kind: SpecialOrderKind; order?: Order; defaultDeadline?: string }) {
  const collection = kind === "collection";
  return <>
    <label className="full">{collection ? "Descrição da cobrança" : "O que precisa de conserto?"}
      <input name="product" required maxLength={160} defaultValue={order?.product} />
    </label>
    <div className="form-row">
      {!collection && <label>Peças para consertar<input name="quantity" type="number" min="1" max="1000000" step="1" required defaultValue={order?.quantity ?? 1} /></label>}
      <label>{collection ? "Valor da cobrança (R$)" : "Valor do serviço (R$)"}
        <input name="total" type="number" min={collection ? ".01" : "0"} max="100000000" step=".01" required defaultValue={order?.total ?? (collection ? "" : 0)} />
      </label>
    </div>
    <div className="form-row">
      {!collection && <label>Prazo do conserto<input name="dueDate" type="date" required defaultValue={order?.dueDate ?? defaultDeadline} /></label>}
      {(collection || order) && <label>Data combinada para pagamento<input name="paymentDueDate" type="date" defaultValue={order?.paymentDueDate ?? ""} /></label>}
      <label>Valor recebido<input name="paid" type="number" min="0" step=".01" defaultValue={order?.paid ?? 0} /></label>
    </div>
  </>;
}
