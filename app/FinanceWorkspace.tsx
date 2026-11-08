"use client";

import { useState, type FormEvent } from "react";
import Modal from "./Modal";
import { Check, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { billDueDate, billIsSettled, financialSummary, localDateValue, nextMonthPayables, type Bill, type CustomerBalance } from "./finance-model";

export type BillInput = Omit<Bill, "id" | "createdAt" | "lastPaidMonth" | "paidInstallments" | "settled">;
type Expense = { id: string; description: string; amount: number; type: string; transactionDate?: string; createdAt?: unknown; category?: string };
type Props = {
  bills: Bill[];
  restock: Bill[];
  openRestock: () => void;
  transactions: Expense[];
  customers: CustomerBalance[];
  currentMonth: string;
  displayTotal: (value: number) => string;
  displayMoney: (value: number) => string;
  onSaveBill: (bill: Bill | null, input: BillInput) => Promise<void>;
  onSettleBill: (bill: Bill) => Promise<boolean>;
  onUndoPayment: (bill: Bill) => Promise<void>;
  onDeleteBill: (bill: Bill) => Promise<void>;
  onReceive: (customer: CustomerBalance) => Promise<void>;
};

export function expenseDate(item: Expense) {
  if (item.transactionDate) return item.transactionDate;
  const created = item.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
  const date = created?.toDate?.() ?? (typeof created?.seconds === "number" ? new Date(created.seconds * 1000) : typeof item.createdAt === "string" || typeof item.createdAt === "number" ? new Date(item.createdAt) : null);
  return date && Number.isFinite(date.getTime()) ? localDateValue(date) : "";
}

export default function FinanceWorkspace({ bills, restock, openRestock, transactions, customers, currentMonth, displayTotal, displayMoney, onSaveBill, onSettleBill, onUndoPayment, onDeleteBill, onReceive }: Props) {
  const [selectedMonth, setMonth] = useState<string | null>(null);
  const month = selectedMonth ?? currentMonth;
  const [editor, setEditor] = useState<{ bill: Bill | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [error, setError] = useState("");
  const expenses = transactions.filter((item) => item.type === "expense" && expenseDate(item).startsWith(month)).sort((a, b) => expenseDate(b).localeCompare(expenseDate(a)));
  const { debtors, payable, receivable, pending, toPay } = financialSummary(customers, [...bills, ...restock], currentMonth);
  const nextPayables = nextMonthPayables([...bills, ...restock], currentMonth);
  const settledBills = bills.filter(bill => billIsSettled(bill, currentMonth));
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente."); }
    finally { setBusy(false); }
  };
  const billRows = (items: Bill[]) => items.sort((a, b) => billDueDate(a, currentMonth).localeCompare(billDueDate(b, currentMonth))).map((bill) => {
    const stock = restock.some(item => item.id === bill.id);
    const settled = billIsSettled(bill, currentMonth);
    const due = billDueDate(bill, currentMonth);
    return <div className="commitment-row" key={bill.id}>
      <div><b>{bill.description}</b><small className={!settled && due < localDateValue() ? "negative" : ""}>{stock && !bill.dueDate ? "Defina a data da compra" : new Intl.DateTimeFormat("pt-BR").format(new Date(`${due}T12:00:00`))} · {bill.billingType === "fixed" ? "Mensal" : bill.billingType === "installment" ? `Parcela ${(bill.paidInstallments ?? 0) + (settled ? 0 : 1)}/${bill.totalInstallments}` : "Única"}{bill.account === "personal" ? " · Pessoal" : ""}</small></div>
      <strong>{displayMoney(bill.amount)}</strong>
      <div className="commitment-actions">
        {stock ? <button type="button" className="secondary" onClick={openRestock}>Ver reposição</button> : <>{settled ? (bill.direction === "receivable" ? <span className="bill-received-label">Recebida</span> : <button className="secondary" disabled={busy} onClick={() => void run(() => onUndoPayment(bill))}><Undo2 size={14} /> Desfazer pagamento</button>)
          : <button className="secondary" disabled={busy} onClick={() => void run(async () => { if (await onSettleBill(bill)) setShowSettled(true); })}>{bill.direction === "receivable" ? "Receber" : "Pagar"}</button>}
        <button aria-label={`Editar conta ${bill.description}`} disabled={busy} onClick={() => setEditor({ bill })}><Pencil size={15} /></button>
        <button aria-label={`Excluir conta ${bill.description}`} disabled={busy} onClick={() => void run(() => onDeleteBill(bill))}><Trash2 size={15} /></button></>}
      </div>
    </div>;
  });
  return <>
    <div className="page-heading compact"><div><h1>Financeiro</h1><p>Despesas mensais e contas a pagar e receber.</p></div><button className="primary" onClick={() => { setError(""); setEditor({ bill: null }); }}><Plus size={17} /> Nova conta</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="finance-summary"><article className="panel"><small>A pagar</small><strong className="negative">{displayTotal(toPay)}</strong><span>{payable.length} contas pendentes</span></article><article className="panel"><small>A receber</small><strong className="positive">{displayTotal(pending)}</strong><span>Clientes e contas pendentes</span><div className="next-payables"><span>A pagar em {nextPayables.label}</span><b>{displayTotal(nextPayables.total)}</b></div></article><article className="panel"><small>Despesas pagas no mês</small><strong>{displayMoney(expenses.reduce((sum, item) => sum + item.amount, 0))}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}</span></article></div>
    <div className="finance-columns"><section className="panel"><div className="section-title"><h2>Contas a pagar</h2></div>{payable.length ? billRows(payable) : <p className="finance-empty">Nenhuma conta a pagar.</p>}</section><section className="panel"><div className="section-title"><h2>A receber</h2></div>{debtors.map((customer) => <div className="commitment-row" key={customer.id}><div><b>{customer.name}</b><small>Saldo pendente do cliente</small></div><strong className="positive">{displayMoney(customer.pending)}</strong><button className="secondary" disabled={busy} onClick={() => void run(() => onReceive(customer))}>Receber</button></div>)}{billRows(receivable)}{!debtors.length && !receivable.length && <p className="finance-empty">Nenhum valor a receber.</p>}</section></div>
    {settledBills.length > 0 && <details className="panel settled-bills" open={showSettled} onToggle={event => setShowSettled(event.currentTarget.open)}><summary>Contas concluídas neste mês / quitadas</summary>{billRows(settledBills)}</details>}
    <section className="panel monthly-expenses"><div className="section-title"><h2>Despesas mensais</h2><input type="month" value={month} required aria-label="Mês das despesas" onChange={(event) => event.target.value && setMonth(event.target.value)} /></div><div className="monthly-planned">Contas mensais cadastradas: <b>{displayMoney(bills.filter((bill) => bill.direction !== "receivable" && bill.billingType === "fixed").reduce((sum, bill) => sum + bill.amount, 0))}</b></div>{expenses.length ? expenses.map((item) => <div className="commitment-row" key={item.id}><div><b>{item.description}</b><small>{new Intl.DateTimeFormat("pt-BR").format(new Date(`${expenseDate(item)}T12:00:00`))} · {item.category || "Outros"}</small></div><strong>{displayMoney(item.amount)}</strong></div>) : <p className="finance-empty">Nenhuma despesa paga neste mês.</p>}</section>
    {editor && <BillEditor bill={editor.bill} busy={busy} error={error} close={() => setEditor(null)} onSave={(input) => run(async () => { await onSaveBill(editor.bill, input); setEditor(null); })} />}
  </>;
}

function BillEditor({ bill, busy, error, close, onSave }: { bill: Bill | null; busy: boolean; error: string; close: () => void; onSave: (input: BillInput) => Promise<void> }) {
  const [billingType, setBillingType] = useState<Bill["billingType"]>(bill?.billingType ?? "fixed");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const dueDate = String(form.get("dueDate") || "");
    void onSave({ description: String(form.get("description")).trim(), amount: Number(form.get("amount")), account: bill?.account ?? "business", direction: String(form.get("direction")) as Bill["direction"], billingType, dueDay: billingType === "once" ? Number(dueDate.slice(-2)) : Number(form.get("dueDay")), category: String(form.get("category") || "Outros").trim(), ...(billingType === "once" ? { dueDate } : {}), ...(billingType === "installment" ? { totalInstallments: Number(form.get("totalInstallments")) } : {}) });
  };
  return <Modal titleId="bill-edit-title" busy={busy} close={close}><header><h2 id="bill-edit-title">{bill ? "Editar conta" : "Nova conta"}</h2><button disabled={busy} aria-label="Fechar" onClick={close}><X size={20} /></button></header><form onSubmit={submit}><label className="full">Descrição<input name="description" defaultValue={bill?.description} required maxLength={200} /></label><div className="form-row"><label>Conta<select name="direction" defaultValue={bill?.direction ?? "payable"}><option value="payable">A pagar</option><option value="receivable">A receber</option></select></label><label>Repetição<select value={billingType} onChange={(event) => setBillingType(event.target.value as Bill["billingType"])}><option value="fixed">Mensal</option><option value="once">Única</option><option value="installment">Parcelada</option></select></label></div><label className="full">Valor<input name="amount" type="number" min="0.01" max="100000000" step="0.01" required defaultValue={bill?.amount} /></label>{billingType === "once" ? <label className="full">Vencimento<input name="dueDate" type="date" required defaultValue={bill?.dueDate ?? localDateValue()} /></label> : <label className="full">Dia do vencimento<input name="dueDay" type="number" min="1" max="31" required defaultValue={bill?.dueDay ?? 10} /></label>}{billingType === "installment" && <label className="full">Total de parcelas<input name="totalInstallments" type="number" min={Math.max(1, bill?.paidInstallments ?? 0)} max="600" required defaultValue={bill?.totalInstallments ?? 2} /></label>}<label className="full">Categoria<input name="category" maxLength={100} defaultValue={bill?.category ?? "Outros"} required placeholder="Ex.: Aluguel, material ou energia" /></label>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={busy}><Check size={17} />{busy ? "Salvando…" : "Salvar conta"}</button></footer></form></Modal>;
}
