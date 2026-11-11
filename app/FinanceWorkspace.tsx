"use client";
import { TypedHeading } from "./Typewriter";
import { CountUp } from "./MotionValue";

import { useRef, useState, type FormEvent } from "react";
import Modal from "./Modal";
import FinanceListCard, { StatusIndicator, type FinanceListItem } from "./finance/FinanceListCard";
import FinanceDetailSheet from "./finance/FinanceDetailSheet";
import { financeDate, financeStatus, recurrenceLabel, sortedBills } from "./finance/presentation";
import { Check, Pencil, Plus, Trash2, Undo2, X, ReceiptText, ArrowDownLeft, WalletCards, CheckCheck, ArrowUpRight } from "lucide-react";
import { billDueDate, billIsSettled, financialSummary, localDateValue, nextMonthPayables, type Bill, type CustomerBalance } from "./finance-model";

export type BillInput = Omit<Bill, "id" | "createdAt" | "lastPaidMonth" | "paidInstallments" | "settled">;
type Expense = { id: string; description: string; amount: number; type: string; transactionDate?: string; createdAt?: unknown; category?: string };
type Props = {
  today?: string;
  bills: Bill[];
  restock: Bill[];
  openRestock: (bill?: Bill) => void;
  transactions: Expense[];
  customers: CustomerBalance[];
  currentMonth: string;
  displayTotal: (value: number) => string;
  displayMoney: (value: number) => string;
  onSaveBill: (bill: Bill | null, input: BillInput) => Promise<void>;
  onSettleBill: (bill: Bill) => Promise<boolean>;
  onUndoPayment: (bill: Bill) => Promise<void>;
  onDeleteBill: (bill: Bill, confirmed?: boolean) => Promise<void>;
  onReceive: (customer: CustomerBalance) => Promise<void>;
};

export function expenseDate(item: Expense) {
  if (item.transactionDate) return item.transactionDate;
  const created = item.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
  const date = created?.toDate?.() ?? (typeof created?.seconds === "number" ? new Date(created.seconds * 1000) : typeof item.createdAt === "string" || typeof item.createdAt === "number" ? new Date(item.createdAt) : null);
  return date && Number.isFinite(date.getTime()) ? localDateValue(date) : "";
}

export default function FinanceWorkspace({ today = localDateValue(), bills, restock, openRestock, transactions, customers, currentMonth, displayTotal, displayMoney, onSaveBill, onSettleBill, onUndoPayment, onDeleteBill, onReceive }: Props) {
  const [selectedMonth, setMonth] = useState<string | null>(null);
  const month = selectedMonth ?? currentMonth;
  const [editor, setEditor] = useState<{ bill: Bill | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ kind: "bill" | "customer" | "expense"; id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const working = useRef(false);
  const expenses = transactions.filter((item) => item.type === "expense" && expenseDate(item).startsWith(month)).sort((a, b) => expenseDate(b).localeCompare(expenseDate(a)));
  const { debtors, payable, receivable, pending, toPay } = financialSummary(customers, [...bills, ...restock], currentMonth);
  const nextPayables = nextMonthPayables([...bills, ...restock], currentMonth);
  const settledBills = bills.filter(bill => billIsSettled(bill, currentMonth));
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir. Tente novamente."); }
    finally { working.current = false; setBusy(false); }
  };
  const allBills = [...bills, ...restock];
  const stockIds = new Set(restock.map(bill => bill.id));
  const undatedIds = new Set(restock.filter(bill => !bill.dueDate).map(bill => bill.id));
  const openDetails = (kind: "bill" | "customer" | "expense", id: string) => { setError(""); setConfirmDelete(false); setSelected({ kind, id }); };
  const editBill = (bill: Bill) => { setSelected(null); setError(""); setEditor({ bill }); };
  const settle = (bill: Bill) => void run(async () => { if (await onSettleBill(bill)) { setShowSettled(true); setSelected(null); } });
  const toBillItems = (items: Bill[]): FinanceListItem[] => sortedBills(items, currentMonth, undatedIds).map(bill => {
    const stock = stockIds.has(bill.id), settled = billIsSettled(bill, currentMonth);
    return { id: bill.id, title: bill.description, detail: `${undatedIds.has(bill.id) ? (bill.category === "Costura" ? "Prazo a definir" : "Data da compra a definir") : financeDate(billDueDate(bill, currentMonth))} · ${stock ? bill.category : recurrenceLabel(bill, currentMonth)}${bill.account === "personal" ? " · Pessoal" : ""}`, amount: displayMoney(bill.amount), status: financeStatus(bill, today, currentMonth, undatedIds.has(bill.id)), open: () => openDetails("bill", bill.id), quick: stock ? [{ label: bill.category === "Costura" ? "Costureiras" : "Reposição", icon: <ArrowUpRight size={18}/>, action: () => openRestock(bill) }] : [{ label: settled ? "Detalhes" : bill.direction === "receivable" ? "Receber" : "Pagar", icon: <Check size={18}/>, action: () => settled ? openDetails("bill", bill.id) : settle(bill) }, { label: "Editar", icon: <Pencil size={18}/>, action: () => editBill(bill) }] };
  });
  const customerItems: FinanceListItem[] = debtors.map(customer => ({ id: `customer-${customer.id}`, title: customer.name, detail: `${customer.orderCount} ${customer.orderCount === 1 ? "pedido" : "pedidos"} · Saldo do cliente`, amount: displayMoney(customer.pending), status: { tone: "open", label: "A receber" }, open: () => openDetails("customer", customer.id), quick: [{ label: "Receber", icon: <Check size={18}/>, action: () => void run(() => onReceive(customer)) }] }));
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const expenseItems: FinanceListItem[] = expenses.map(item => ({ id: item.id, title: item.description, detail: `${financeDate(expenseDate(item))} · ${item.category || "Outros"}`, amount: displayMoney(item.amount), status: { tone: "paid", label: "Pago" }, open: () => openDetails("expense", item.id) }));
  const selectedBill = selected?.kind === "bill" ? allBills.find(bill => bill.id === selected.id) : undefined;
  const selectedCustomer = selected?.kind === "customer" ? debtors.find(customer => customer.id === selected.id) : undefined;
  const selectedExpense = selected?.kind === "expense" ? expenses.find(item => item.id === selected.id) : undefined;
  const selectedTitle = selectedBill?.description ?? selectedCustomer?.name ?? selectedExpense?.description;
  const openCount = `${payable.length} ${payable.length === 1 ? "conta em aberto" : "contas em aberto"}`;
  const paidSum = settledBills.reduce((sum, bill) => sum + bill.amount, 0);
  return <div className="finance-workspace finance-premium">
    <div className="page-heading compact"><div><TypedHeading>Financeiro</TypedHeading></div><button className="primary" onClick={() => { setError(""); setEditor({ bill: null }); }}><Plus size={17} /> Nova conta</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
      <div className="finance-premium-summary"><article><small>A pagar</small><strong><CountUp value={toPay} format={displayTotal} /></strong><span>{openCount}</span></article><article><small>A receber</small><strong><CountUp value={pending} format={displayTotal} /></strong><span>Clientes e contas</span></article><article><small>Pagas em {new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(`${month}-01T12:00:00`))}</small><strong><CountUp value={expenseTotal} format={displayMoney} /></strong><span>Despesas registradas</span></article></div>
      <div className="finance-premium-columns">
        <FinanceListCard title="Contas a pagar" subtitle={openCount} total={<CountUp value={toPay} format={displayTotal} />} totalLabel="Total em aberto" icon={<ReceiptText size={23}/>} items={toBillItems(payable)} empty="Nenhuma conta a pagar. Tudo em dia."/>
        <FinanceListCard title="A receber" subtitle={`${debtors.length + receivable.length} ${debtors.length + receivable.length === 1 ? "saldo pendente" : "saldos pendentes"}`} total={<CountUp value={pending} format={displayTotal} />} totalLabel="Total a receber" icon={<ArrowDownLeft size={23}/>} items={[...customerItems, ...toBillItems(receivable)]} empty="Nenhum valor a receber."><div className="finance-next-month"><span>A pagar em {nextPayables.label}</span><b>{displayTotal(nextPayables.total)}</b></div></FinanceListCard>
      </div>
      <section className="finance-paid-section"><button type="button" className="finance-paid-toggle" aria-expanded={showSettled} onClick={() => setShowSettled(value => !value)}><CheckCheck size={18}/><span>Contas quitadas <small>{settledBills.length}</small></span><b>{showSettled ? "Ocultar" : "Ver contas"}</b></button>{showSettled && <FinanceListCard title="Contas quitadas" subtitle="Concluídas neste período / quitadas" total={<CountUp value={paidSum} format={displayMoney} />} totalLabel="Total quitado" icon={<CheckCheck size={23}/>} items={toBillItems(settledBills)} empty="Nenhuma conta quitada neste período."/>}</section>
      <FinanceListCard title="Despesas mensais" subtitle={new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))} total={<CountUp value={expenseTotal} format={displayMoney} />} totalLabel="Total pago" icon={<WalletCards size={23}/>} items={expenseItems} empty="Nenhuma despesa registrada neste mês."><div className="finance-month-controls"><label>Mês das despesas<input type="month" value={month} required aria-label="Mês das despesas" onChange={event => event.target.value && setMonth(event.target.value)}/></label><span>Contas mensais cadastradas <b>{displayMoney(bills.filter(bill => bill.direction !== "receivable" && bill.billingType === "fixed").reduce((sum,bill)=>sum+bill.amount,0))}</b></span></div></FinanceListCard>
    {selectedTitle && <FinanceDetailSheet title={selectedTitle} busy={busy} close={() => { if (!busy) setSelected(null); }}>
      {selectedBill && <>
        <div className="finance-sheet-amount">{displayMoney(selectedBill.amount)}</div><StatusIndicator status={financeStatus(selectedBill, today, currentMonth, undatedIds.has(selectedBill.id))}/>
        <dl className="finance-sheet-data"><div><dt>{stockIds.has(selectedBill.id) ? "Data da compra" : "Vencimento"}</dt><dd>{undatedIds.has(selectedBill.id) ? "A definir" : financeDate(billDueDate(selectedBill, currentMonth))}</dd></div><div><dt>Repetição</dt><dd>{recurrenceLabel(selectedBill, currentMonth)}</dd></div><div><dt>Categoria</dt><dd>{selectedBill.category || "Outros"}</dd></div><div><dt>Conta</dt><dd>{selectedBill.account === "personal" ? "Pessoal" : "Empresa"}</dd></div>{selectedBill.billingType === "installment" && <div><dt>Parcelas pagas</dt><dd>{selectedBill.paidInstallments ?? 0} de {selectedBill.totalInstallments}</dd></div>}</dl>
        {stockIds.has(selectedBill.id) ? <button type="button" className="finance-sheet-primary" onClick={() => { setSelected(null); openRestock(selectedBill); }}>{selectedBill.category === "Costura" ? "Abrir costureiras" : "Abrir reposição"} de estoque <ArrowUpRight size={18}/></button> : confirmDelete ? <div className="finance-delete-confirm" role="alert"><p>Excluir esta conta? O histórico de pagamentos será mantido.</p><button type="button" className="finance-sheet-danger" disabled={busy} onClick={() => void run(async () => { await onDeleteBill(selectedBill, true); setSelected(null); })}>{busy ? "Excluindo…" : "Confirmar exclusão"}</button><button type="button" className="finance-sheet-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar exclusão</button></div> : <div className="finance-sheet-actions">
          {!billIsSettled(selectedBill, currentMonth) ? <button type="button" className="finance-sheet-primary" disabled={busy} onClick={() => settle(selectedBill)}><Check size={18}/>{busy ? "Salvando…" : selectedBill.direction === "receivable" ? "Marcar como recebido" : "Marcar como pago"}</button> : selectedBill.direction !== "receivable" && <button type="button" className="finance-sheet-secondary" disabled={busy} onClick={() => void run(async () => { await onUndoPayment(selectedBill); setSelected(null); })}><Undo2 size={18}/> Desfazer pagamento</button>}
          <button type="button" className="finance-sheet-secondary" disabled={busy} onClick={() => editBill(selectedBill)}><Pencil size={18}/> Editar conta</button><button type="button" className="finance-sheet-danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={18}/> Excluir conta</button>
        </div>}
      </>}
      {selectedCustomer && <><div className="finance-sheet-amount">{displayMoney(selectedCustomer.pending)}</div><p className="finance-sheet-description">Saldo pendente de {selectedCustomer.orderCount} pedido(s).</p><dl className="finance-sheet-data"><div><dt>Total comprado</dt><dd>{displayMoney(selectedCustomer.total)}</dd></div>{selectedCustomer.phone && <div><dt>Telefone</dt><dd>{selectedCustomer.phone}</dd></div>}</dl><button type="button" className="finance-sheet-primary" disabled={busy} onClick={() => void run(async () => { await onReceive(selectedCustomer); setSelected(null); })}><Check size={18}/>Registrar recebimento</button></>}
      {selectedExpense && <><div className="finance-sheet-amount">{displayMoney(selectedExpense.amount)}</div><StatusIndicator status={{ tone: "paid", label: "Pago" }}/><dl className="finance-sheet-data"><div><dt>Data</dt><dd>{financeDate(expenseDate(selectedExpense))}</dd></div><div><dt>Categoria</dt><dd>{selectedExpense.category || "Outros"}</dd></div></dl></>}
      {error && <p className="finance-sheet-error" role="alert">{error}</p>}
    </FinanceDetailSheet>}
    {editor && <BillEditor bill={editor.bill} busy={busy} error={error} close={() => setEditor(null)} onSave={(input) => run(async () => { await onSaveBill(editor.bill, input); setEditor(null); })} />}
  </div>;
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
