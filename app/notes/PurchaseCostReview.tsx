"use client";
import { useState, type FormEvent } from "react";
import type { NoteMaterial } from "../notes-model";
import NoteDialog from "./NoteDialog";
import { localDateValue } from "../finance-model";
import "../operational-controls.css";
export type PurchaseCostInput = { noteId: string; materialId: string; amount: number; freight: number; date: string; expenseIds: string[]; expected: string };
export type LinkedExpense = { id: string; orderId?: string; type: string; amount: number; description: string; source?: string; category?: string };
export default function PurchaseCostReview({ noteId, orderId, material, expenses, save, close }: { noteId: string; orderId?: string; material: NoteMaterial; expenses: LinkedExpense[]; save: (input: PurchaseCostInput) => Promise<void>; close: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await save({ noteId, materialId: material.id, amount: Number(data.get("amount")), freight: Number(data.get("freight")), date: String(data.get("date")), expenseIds: data.getAll("expenseIds").map(String), expected: JSON.stringify(material) });
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  return <NoteDialog title="Conferir valor da compra" close={() => { if (!busy) close(); }}>
    <form className="operations-form" onSubmit={submit}>
      <p>{material.fabricType} · {material.color} · {material.supplier}</p>
      <label>Valor real dos materiais (R$)<input name="amount" type="number" min="0" max="100000000" step=".01" required defaultValue={material.actualCost ?? material.totalCost} /></label>
      <label>Frete desta compra (R$)<input name="freight" type="number" min="0" max="100000000" step=".01" required defaultValue={material.purchaseFreight ?? 0} /></label>
      <label>Data da compra<input name="date" type="date" required max={localDateValue()} defaultValue={material.purchaseDate || localDateValue()} /></label>
      {orderId && <fieldset className="operations-expenses"><legend>Pagamentos já incluídos neste valor</legend>
        {expenses.filter(item => item.orderId === orderId && item.type === "expense" && item.source !== "customer_refund" && item.category !== "Costura").map(item => <label key={item.id}><input type="checkbox" name="expenseIds" value={item.id} defaultChecked={material.linkedExpenseIds?.includes(item.id)} />{item.description} · {item.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</label>)}
      </fieldset>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Salvando…" : "Confirmar custo real"}</button>
    </form>
  </NoteDialog>;
}
