"use client";

import { ArrowUpRight, Boxes, CalendarDays, Check, History, Layers, Pencil, Plus, Trash2, WalletCards, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import Modal from "./Modal";
import { historyKinds, historyTotals, type HistoryInput, type HistoryKind, type HistoryRow, type legacyFabricPurchases } from "./history-model";
import "./history.css";

const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthKey = (index: number) => String(index + 1).padStart(2, "0");
const shortDate = (date: string) => date.split("-").reverse().join("/");
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const weight = (kg: number) => `${number.format(kg)} kg`;
const sections = [
  { id: "orders", label: "Pedidos", icon: Boxes },
  { id: "bills", label: "Contas", icon: WalletCards },
  { id: "fabric", label: "Compras de malha", icon: Layers },
] as const;
type Section = typeof sections[number]["id"];
const sectionFor = (kind: HistoryKind): Section => kind === "payable" || kind === "paid" ? "bills" : kind;

type Props = {
  today: string;
  connection: "connecting" | "live" | "error";
  rows: HistoryRow[];
  pendingKg: number;
  undatedOrders: number;
  legacy: ReturnType<typeof legacyFabricPurchases>;
  displayMoney: (value: number) => string;
  displayTotal: (value: number) => string;
  onSave: (input: HistoryInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDatePurchase: (id: string, ids: string[], date: string) => Promise<void>;
  openFinance: () => void;
  openMaterials: () => void;
};

export default function HistoryWorkspace({ today, connection, rows, pendingKg, undatedOrders, legacy, displayMoney, displayTotal, onSave, onDelete, onDatePurchase, openFinance, openMaterials }: Props) {
  const [year, setYear] = useState(today.slice(0, 4));
  const [month, setMonth] = useState(today.slice(5, 7));
  const [section, setSection] = useState<Section>("orders");
  const [editor, setEditor] = useState<{ kind: HistoryKind; row?: HistoryRow }>();
  const [dating, setDating] = useState<Props["legacy"][number]>();
  const [removing, setRemoving] = useState("");
  const [error, setError] = useState("");
  const years = [...new Set([year, today.slice(0, 4), ...rows.map(row => row.date.slice(0, 4))])].sort().reverse();
  const yearRows = rows.filter(row => row.date.startsWith(`${year}-`));
  const periodRows = month ? yearRows.filter(row => row.date.slice(5, 7) === month) : yearRows;
  const details = periodRows.filter(row => sectionFor(row.kind) === section);
  const totals = historyTotals(periodRows);
  const period = month ? `${months[Number(month) - 1]} de ${year}` : year;
  const initialDate = year === today.slice(0, 4) && (!month || month === today.slice(5, 7)) ? today : `${year}-${month || "01"}-01`;
  const ready = connection === "live";

  function showRecord(date: string, kind: HistoryKind) {
    setYear(date.slice(0, 4));
    if (month) setMonth(date.slice(5, 7));
    setSection(sectionFor(kind));
  }

  async function remove(row: HistoryRow) {
    if (!window.confirm(`Excluir “${row.title}” do histórico?`)) return;
    setError("");
    setRemoving(row.id);
    try { await onDelete(row.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o registro."); }
    finally { setRemoving(""); }
  }

  return <div className="history-workspace">
    <header className="history-heading">
      <div><span className="eyebrow">GESTÃO</span><h1>Histórico</h1><p>Pedidos, contas e compras de malha por mês e por ano.</p></div>
      <button className="primary" type="button" disabled={!ready} onClick={() => setEditor({ kind: section === "bills" ? "payable" : section })}><Plus size={18} /> Registrar histórico</button>
    </header>

    <section className="history-period panel" aria-label="Período do histórico">
      <div className="history-period-title"><span className="history-icon"><CalendarDays size={19} /></span><div><small>PERÍODO SELECIONADO</small><strong>{period}</strong></div></div>
      <div className="history-period-controls">
        <label htmlFor="history-month">Mês</label><select id="history-month" value={month} onChange={event => setMonth(event.target.value)}><option value="">Ano todo</option>{months.map((name, index) => <option key={name} value={monthKey(index)}>{name}</option>)}</select>
        <label htmlFor="history-year">Ano</label><select id="history-year" value={year} onChange={event => setYear(event.target.value)}>{years.map(value => <option key={value}>{value}</option>)}</select>
        <button className="secondary" type="button" onClick={() => { setYear(today.slice(0, 4)); setMonth(today.slice(5, 7)); }}>Mês atual</button>
      </div>
    </section>

    {!ready && <p className="history-notice" role="status">{connection === "error" ? "Falha ao sincronizar os registros do histórico. Confira a conexão e recarregue a página." : "Sincronizando os registros do histórico…"}</p>}
    <section className="history-metrics" aria-label={`Resumo de ${period}`}>
      <article className="panel"><span className="history-icon"><Boxes size={18} /></span><div><h2>Pedidos cadastrados</h2><strong>{number.format(totals.orders)}</strong><small>Por data de cadastro</small></div></article>
      <article className="panel"><span className="history-icon history-icon-payable"><WalletCards size={18} /></span><div><h2>A pagar</h2><strong>{displayTotal(totals.payable)}</strong><small>{totals.payableCount === 1 ? "1 conta pendente" : `${totals.payableCount} contas pendentes`}</small></div></article>
      <article className="panel"><span className="history-icon history-icon-paid"><Check size={18} /></span><div><h2>Contas pagas</h2><strong>{displayMoney(totals.paid)}</strong><small>Por data de pagamento</small></div></article>
      <article className="panel"><span className="history-icon"><Layers size={18} /></span><div><h2>Malha comprada</h2><strong>{weight(totals.fabric)}</strong><small>{displayMoney(totals.fabricAmount)} em compras</small></div></article>
    </section>

    {!month && <section className="history-panel panel">
      <div className="history-panel-heading"><h2>Resumo mensal de {year}</h2><p>Selecione um mês para abrir os registros.</p></div>
      <div className="history-table-wrap"><table>
        <thead><tr><th scope="col">Mês</th><th scope="col">Pedidos</th><th scope="col">A pagar</th><th scope="col">Contas pagas</th><th scope="col">Malha comprada</th><th scope="col">Gasto com malha</th></tr></thead>
        <tbody>{months.map((name, index) => {
          const key = monthKey(index);
          const monthTotals = historyTotals(yearRows.filter(row => row.date.slice(5, 7) === key));
          return <tr key={name}><th scope="row"><button type="button" onClick={() => setMonth(key)}>{name}<ArrowUpRight size={13} /></button></th><td>{number.format(monthTotals.orders)}</td><td>{displayTotal(monthTotals.payable)}</td><td>{displayMoney(monthTotals.paid)}</td><td>{weight(monthTotals.fabric)}</td><td>{displayMoney(monthTotals.fabricAmount)}</td></tr>;
        })}</tbody>
      </table></div>
    </section>}

    <section className="history-panel panel">
      <div className="history-panel-heading history-detail-heading">
        <div><h2>Registros do período</h2><p>{period}</p></div>
        {section === "bills" && <button className="secondary" type="button" onClick={openFinance}>Abrir Financeiro <ArrowUpRight size={14} /></button>}
        {section === "fabric" && <button className="secondary" type="button" onClick={openMaterials}>Abrir Materiais <ArrowUpRight size={14} /></button>}
      </div>
      <div className="history-tabs" aria-label="Tipo de registro">
        {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={section === id} onClick={() => { setSection(id); setError(""); }}><Icon size={16} /> {label}</button>)}
      </div>
      {section === "orders" && undatedOrders > 0 && <p className="history-context">{undatedOrders === 1 ? "1 pedido antigo está sem data de cadastro." : `${undatedOrders} pedidos antigos estão sem data de cadastro.`} Use o registro manual se souber a quantidade de cada mês.</p>}
      {section === "bills" && <p className="history-context">As pendências de contas mensais e parceladas aparecem no mês atual. Os pagamentos ficam na data em que foram registrados.</p>}
      {section === "fabric" && <p className="history-context"><strong>{weight(pendingKg)} de malha a comprar agora.</strong> Este total vem da lista atual de Materiais.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {details.length ? <ul className="history-records">{details.map(row => <li key={`${row.source}-${row.id}`}>
        <div className="history-record-info">
          <strong>{row.title}</strong>
          <small>{[shortDate(row.date), row.supplier, row.kind === "payable" || row.kind === "paid" ? historyKinds[row.kind] : "", row.source === "manual" ? "Registro manual" : ""].filter(Boolean).join(" · ")}</small>
          {row.notes && <small className="history-record-notes">{row.notes}</small>}
        </div>
        <div className="history-record-value">
          <strong>{row.kind === "orders" ? `${number.format(row.quantity)} ${row.quantity === 1 ? "pedido" : "pedidos"}` : row.kind === "fabric" ? weight(row.quantity) : displayMoney(row.amount)}</strong>
          {row.kind === "fabric" && <small>{displayMoney(row.amount)}</small>}
        </div>
        {row.source === "manual" && <div className="history-row-actions">
          <button type="button" title="Editar registro" aria-label={`Editar ${row.title}`} disabled={!ready || !!removing} onClick={() => setEditor({ kind: row.kind, row })}><Pencil size={16} /></button>
          <button type="button" title="Excluir registro" aria-label={`Excluir ${row.title}`} disabled={!ready || !!removing} onClick={() => void remove(row)}><Trash2 size={16} /></button>
        </div>}
      </li>)}</ul> : <div className="history-empty"><History size={24} /><strong>Nenhum registro para este período</strong><p>{section === "orders" ? "Pedidos da Produção entram aqui automaticamente." : section === "bills" ? "As contas e os pagamentos do Financeiro aparecem aqui." : "Conclua uma compra em Materiais ou registre uma compra avulsa."}</p></div>}
      {section === "fabric" && !!legacy.length && <details className="history-undated">
        <summary>Compras antigas sem data <span>{legacy.length}</span></summary>
        <p>Informe a data real da compra para somar essas malhas ao mês correto.</p>
        <ul>{legacy.map(item => <li key={item.id}><span>{item.title} · <strong>{weight(item.quantity)}</strong></span><button className="secondary" type="button" onClick={() => setDating(item)}>Registrar data</button></li>)}</ul>
      </details>}
    </section>

    {editor && <HistoryEditor initialKind={editor.kind} row={editor.row} date={initialDate} today={today} close={() => setEditor(undefined)} save={async (input, id) => { await onSave(input, id); showRecord(input.date, input.kind); setEditor(undefined); }} />}
    {dating && <HistoryEditor purchase={dating} initialKind="fabric" date={initialDate} today={today} close={() => setDating(undefined)} save={async input => { await onDatePurchase(dating.id, dating.materialIds, input.date); showRecord(input.date, "fabric"); setDating(undefined); }} />}
  </div>;
}

function HistoryEditor({ row, purchase, initialKind, date, today, close, save }: {
  row?: HistoryRow;
  purchase?: Props["legacy"][number];
  initialKind: HistoryKind;
  date: string;
  today: string;
  close: () => void;
  save: Props["onSave"];
}) {
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dateLabel = purchase || kind === "fabric" ? "Data da compra" : kind === "payable" ? "Vencimento" : kind === "paid" ? "Data do pagamento" : "Data de referência";
  const isBill = kind === "payable" || kind === "paid";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const input: HistoryInput = {
      kind, date: field("date"), title: field("title") || "Registro de pedidos",
      quantity: Number(field("quantity")), amount: Number(field("amount")),
      supplier: field("supplier"), notes: field("notes"),
    };
    setBusy(true);
    setError("");
    try { await save(input, row?.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o registro."); setBusy(false); }
  }

  return <Modal titleId="history-editor-title" busy={busy} close={close}>
    <header><h2 id="history-editor-title">{purchase ? "Datar compra antiga" : row ? "Editar registro" : "Registrar histórico"}</h2><button type="button" disabled={busy} onClick={close} aria-label="Fechar"><X size={19} /></button></header>
    <form className="history-editor" onSubmit={submit}>
      {purchase ? <p className="history-context">{purchase.title} · {weight(purchase.quantity)}</p> : <label>Tipo de registro<select aria-label="Tipo de registro" data-initial-focus value={kind} onChange={event => setKind(event.target.value as HistoryKind)}>{Object.entries(historyKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {isBill && <p className="history-context">Este lançamento fica no Histórico. Para cadastrar ou pagar uma conta do dia a dia, use o Financeiro.</p>}
      <label>{dateLabel}<input data-initial-focus={purchase ? true : undefined} name="date" type="date" min="1900-01-01" max={kind === "payable" ? "9999-12-31" : today} required defaultValue={purchase ? undefined : row?.date ?? (date > today && kind !== "payable" ? today : date)} /></label>
      {!purchase && <>
        <label>Descrição {kind === "orders" && <span>(opcional)</span>}<input name="title" defaultValue={row?.title} required={kind !== "orders"} maxLength={200} placeholder={kind === "fabric" ? "Ex. Malha penteada preta" : isBill ? "Ex. Aluguel" : "Ex. Pedidos anotados em outubro"} /></label>
        <div key={kind === "orders" ? "orders" : kind === "fabric" ? "fabric" : "bill"} className="history-editor-numbers">
          {!isBill && <label>{kind === "fabric" ? "Quantidade (kg)" : "Quantidade de pedidos"}<input name="quantity" type="number" min={kind === "fabric" ? ".001" : "1"} max="1000000" step={kind === "fabric" ? ".001" : "1"} defaultValue={row && kind === row.kind ? row.quantity : kind === "orders" ? 1 : undefined} required /></label>}
          {kind !== "orders" && <label>Valor total (R$)<input name="amount" type="number" min={isBill ? ".01" : "0"} max="100000000" step=".01" defaultValue={row && sectionFor(row.kind) === sectionFor(kind) ? row.amount : undefined} required /></label>}
        </div>
        {kind === "fabric" && <label>Fornecedor <span>(opcional)</span><input name="supplier" maxLength={120} defaultValue={row?.supplier} /></label>}
        <label>Observações <span>(opcional)</span><textarea name="notes" rows={3} maxLength={1200} defaultValue={row?.notes} /></label>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button className="secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="primary" type="submit" disabled={busy}><Check size={17} />{busy ? "Salvando…" : purchase ? "Salvar data" : "Salvar registro"}</button></footer>
    </form>
  </Modal>;
}
