"use client";
import { useEffect, useState } from "react";
import { getApps } from "firebase/app";
import { collection, getFirestore, onSnapshot } from "firebase/firestore";
import { monthlyClosing, type ClosingData, type MonthlyClosingReport } from "./monthly-closing";
import PdfDownloadButton from "./PdfDownloadButton";
import "./operational-controls.css";

export default function MonthlyClosingWorkspace({ uid, today, data, save, money }: { uid: string; today: string; data: ClosingData; save: (report: MonthlyClosingReport) => Promise<void>; money: (amount: number) => string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [saved, setSaved] = useState<Record<string, MonthlyClosingReport>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => onSnapshot(collection(getFirestore(getApps()[0]), "users", uid, "monthlyClosings"), snapshot => {
    const records: Record<string, MonthlyClosingReport> = {};
    snapshot.docs.forEach(doc => {
      try { const value = JSON.parse(doc.data().snapshot); if (value.month === doc.id) records[doc.id] = value; } catch { /* Keep unreadable saved records out of the list. */ }
    });
    setSaved(records); setReady(true);
  }, () => { setError("Falha ao carregar os fechamentos salvos."); setReady(false); }), [uid]);
  const current = monthlyClosing(data, month, today);
  const report = saved[month] ?? current;
  const frozen = Boolean(saved[month]);
  const changed = frozen && JSON.stringify({ ...current, reviewedOn: report.reviewedOn, totals: { ...current.totals, payableAtReview: report.totals.payableAtReview, receivableAtReview: report.totals.receivableAtReview } }) !== JSON.stringify(report);
  const metrics = [
    ["Pedidos entregues", String(report.totals.delivered)],
    ["Vendas entregues", money(report.totals.sales)],
    ["Recebimentos do mês", money(report.totals.received)],
    ["Devoluções do mês", money(report.totals.refunds)],
    ["Pago em costura", money(report.totals.sewingPaid)],
    ["Crédito usado em costura", money(report.totals.sewingCreditUsed)],
    ["Compras com custo conferido", money(report.totals.purchases)],
    ["Resultado dos pedidos conferidos", money(report.totals.verifiedResult)],
  ];
  return <section className="panel operations-panel">
    <header><h2>Fechamento mensal</h2><div className="operations-actions">
      <input className="operations-month" aria-label="Mês do fechamento" type="month" max={today.slice(0,7)} value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value <= today.slice(0,7)) { setMonth(event.target.value); setChecked(false); } }} />
      <PdfDownloadButton report={{ title: "Fechamento mensal", subtitle: month + (frozen ? " · Salvo em " + report.reviewedOn.split("-").reverse().join("/") : " · Em conferência"), filename: "fechamento-" + month, sections: [
        { title: "Resumo", columns: ["Indicador", "Valor"], rows: metrics },
        { title: "Pedidos entregues", columns: ["Cliente", "Venda", "Recebido", "Custos", "Resultado", "Conferência"], rows: report.delivered.map(item => [item.customer, money(item.sale), money(item.received), money(item.costs), money(item.result), item.confirmed ? "Conferido" : "Pendente"]) },
        { title: "Recebimentos", columns: ["Data", "Descrição", "Valor"], rows: report.receipts.map(item => [item.date.split("-").reverse().join("/"), item.description, money(item.amount)]) },
        { title: "Compras conferidas", columns: ["Data", "Material", "Fornecedor", "Valor com frete"], rows: report.purchases.map(item => [item.date.split("-").reverse().join("/"), item.title, item.supplier, money(item.amount)]) },
        { title: "Costura", columns: ["Data", "Costureira", "Registro", "Valor"], rows: report.sewingPayments.map(item => [item.date.split("-").reverse().join("/"), item.person, item.kind === "offset" ? "Crédito utilizado" : "Pagamento", money(item.amount)]) },
        { title: "Pendências", columns: ["Registro", "Revisão"], rows: report.pending.map(item => [item.title, item.detail]) },
      ] }} />
    </div></header>
    <p className="operations-muted">{frozen ? "Fechamento salvo em " + report.reviewedOn.split("-").reverse().join("/") : month === today.slice(0,7) ? "Mês em andamento · prévia para conferência" : "Mês em conferência"}</p>
    {changed && <p className="operations-warning">Há alterações posteriores nos dados. O fechamento salvo preserva os valores conferidos.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <dl className="operations-metrics">{metrics.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <details><summary>Pedidos entregues ({report.delivered.length})</summary><ul className="operations-list">
      {report.delivered.map(item => <li key={item.id}><span><b>{item.customer} · {item.product}</b><small>{item.date.split("-").reverse().join("/")} · Venda {money(item.sale)} · Custos {money(item.costs)}</small></span><strong>{item.confirmed ? money(item.result) : "Custo pendente"}</strong></li>)}
    </ul></details>
    <details><summary>Recebimentos ({report.receipts.length})</summary><ul className="operations-list">
      {report.receipts.map(item => <li key={item.id}><span><b>{item.description}</b><small>{item.date.split("-").reverse().join("/")}</small></span><strong>{money(item.amount)}</strong></li>)}
    </ul></details>
    <details><summary>Compras conferidas ({report.purchases.length})</summary><ul className="operations-list">
      {report.purchases.map(item => <li key={item.id}><span><b>{item.title}</b><small>{item.supplier} · {item.date.split("-").reverse().join("/")}</small></span><strong>{money(item.amount)}</strong></li>)}
    </ul></details>
    <details><summary>Pagamentos e acertos de costura ({report.sewingPayments.length})</summary><ul className="operations-list">
      {report.sewingPayments.map(item => <li key={item.id}><span><b>{item.person}</b><small>{item.date.split("-").reverse().join("/")} · {item.kind === "offset" ? "Crédito utilizado" : "Pagamento"}</small></span><strong>{money(item.amount)}</strong></li>)}
    </ul></details>
    <details open={report.pending.length > 0}><summary>Pendências da revisão ({report.pending.length})</summary><ul className="operations-list">
      {report.pending.map((item,index) => <li key={index}><span><b>{item.title}</b><small>{item.detail}</small></span></li>)}
    </ul><p className="operations-muted">Na revisão · A pagar {money(report.totals.payableAtReview)} · A receber {money(report.totals.receivableAtReview)}</p></details>
    {!frozen && <div className="operations-actions">
      <label><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> Conferi os valores e as pendências deste mês</label>
      <button className="primary" disabled={!ready || !checked || busy} onClick={async () => {
        setBusy(true); setError("");
        try { await save(current); setSaved(previous => ({ ...previous, [month]: current })); } catch(cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
        finally { setBusy(false); }
      }}>{busy ? "Salvando…" : "Guardar fechamento no histórico"}</button>
    </div>}
    {Object.keys(saved).length > 0 && <details><summary>Fechamentos guardados</summary><div className="operations-actions">{Object.keys(saved).sort().reverse().map(key => <button className="secondary" key={key} onClick={() => { setMonth(key); setChecked(false); }}>{key.split("-").reverse().join("/")}</button>)}</div></details>}
  </section>;
}
