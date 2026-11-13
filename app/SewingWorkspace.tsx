"use client";
import MoneyText from "./MoneyText";
import { useRef, useState, type FormEvent } from "react";
import { Ellipsis, Printer, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import type { Order } from "./order-model";
import {
  sewingBalances,
  sewingEntriesForPeriod,
  sewingEntryTotals,
  sewingOrderBalances,
  sewingPerson,
  type SewingLedger,
  type SewingEntry,
} from "./sewing-model";
import { poloExtra } from "./order-pricing";
import { CountUp } from "./MotionValue";
import "./sewing.css";
import NoteDialog from "./notes/NoteDialog";
import PdfDownloadButton from "./PdfDownloadButton";
import SewingOperations from "./SewingOperations";
import type { SewingMovement } from "./sewing-model";
import type { PdfReport } from "./pdf-report";

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2020, index, 1))),
}));
export type SewingChange =
  | { type: "person"; name: string }
  | { type: "person-rename"; from: string; name: string }
  | { type: "person-remove"; from: string; name: string }
  | { type: "assign"; orderId: string; person: string; rate: number }
  | { type: "entry"; entry: SewingEntry }
  | { type: "movement"; movement: SewingMovement }
  | { type: "remove"; id: string }
  | { type: "exclude-order"; orderId: string; excluded: boolean }
  | { type: "hide-order"; orderId: string }
  | { type: "rename"; id: string; name: string }
  | {
      type: "pay-order";
      id: string;
      orderId: string;
      expected: number;
      date: string;
    };
export default function SewingWorkspace({
  orders,
  ledger,
  save,
  money,
}: {
  orders: Order[];
  ledger: SewingLedger;
  save: (change: SewingChange) => Promise<void>;
  money: (amount: number) => string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [person, setPerson] = useState("Zefa");
  const [personDialog, setPersonDialog] = useState<"edit" | "remove" | null>(
    null,
  );
  const [kind, setKind] = useState<"print" | "print-front" | "payment">("print");
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const working = useRef(false);
  const balances = sewingBalances(orders, ledger),
    current = balances.find((item) => item.person === person) || balances[0];
  const orderRows = sewingOrderBalances(orders, ledger, current.person);
  const visible = orderRows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "excluded" ? row.excluded : !row.excluded && (filter === "paid" ? row.remaining === 0 : row.remaining > 0))) &&
      (row.order.customer + " " + row.order.product)
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
  }).format(new Date());
  const summary = [
    ["Costura", current.total],
    ["Crédito de estampagens", current.printCredit],
    ["Pago", current.paid],
    ["Crédito utilizado", current.offsets],
    [current.balance < 0 ? "Pagamento a maior" : "A pagar", Math.abs(current.balance)],
  ] as const;
  const years = [...new Set([today.slice(0, 4), ...ledger.entries.map(entry => entry.date.slice(0, 4)).filter(value => /^\d{4}$/.test(value))])].sort().reverse();
  const period = year && month ? `${year}-${month}` : year;
  const periodLabel = month && year ? `${months.find(item => item.value === month)?.label} de ${year}` : year || "Todos os períodos";
  const periodEntries = sewingEntriesForPeriod(ledger.entries, current.person, period);
  const periodTotals = sewingEntryTotals(periodEntries);
  const allPaidInPeriod = ledger.people.length > 1 ? sewingEntryTotals(sewingEntriesForPeriod(ledger.entries, undefined, period)).paid : null;
  async function run(change: SewingChange) {
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await save(change);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally {
      setBusy(false);
      working.current = false;
    }
  }
  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    const kind = values.get("kind") === "payment" ? "payment" : "print",
      quantity = Number(values.get("quantity"));
    const amount =
      kind === "print" ? quantity * (values.get("kind") === "print-front" ? 2 : 4) : Number(values.get("amount"));
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (kind === "print" && (!Number.isInteger(quantity) || quantity < 1))
    ) {
      setError("Informe uma quantidade ou valor válido.");
      return;
    }
    void run({
      type: "entry",
      entry: {
        id: crypto.randomUUID(),
        person: current.person,
        kind,
        quantity: kind === "print" ? quantity : 0,
        amount: Math.round(amount * 100) / 100,
        date: String(values.get("date")),
        name: String(values.get("name") || "").trim(),
      },
    }).then((saved) => {
      if (saved)
        form
          .querySelectorAll<HTMLInputElement>(
            'input[name="name"],input[name="quantity"],input[name="amount"]',
          )
          .forEach((input) => {
            input.value = "";
          });
    });
  }
  return (
    <section className="sewing-workspace">
      <header className="page-heading">
        <h1>Costureiras</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void run({
              type: "person",
              name: String(new FormData(form).get("name") || "").trim(),
            });
          }}
        >
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Nome da costureira"
            aria-label="Nova costureira"
          />
          <button className="secondary" disabled={busy}>
            Adicionar
          </button>
        </form>
      </header>
      <nav className="sewing-people">
        {ledger.people.map((name) => (
          <button
            className={current.person === name ? "primary" : "secondary"}
            disabled={busy}
            key={name}
            onClick={() => setPerson(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="sewing-person-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setPersonDialog("edit")}
        >
          Editar costureira
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setPersonDialog("remove")}
        >
          Remover costureira
        </button>
      </div>
      {personDialog && (
        <NoteDialog
          title={
            personDialog === "edit" ? "Editar costureira" : "Remover costureira"
          }
          close={() => {
            if (!busy) setPersonDialog(null);
          }}
        >
          <form
            className="sewing-person-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name") || "",
              ).trim();
              void run({
                type:
                  personDialog === "edit" ? "person-rename" : "person-remove",
                from: current.person,
                name,
              }).then((saved) => {
                if (saved) {
                  setPerson(name);
                  setPersonDialog(null);
                }
              });
            }}
          >
            <strong>{current.person}</strong>
            {personDialog === "edit" ? (
              <label>
                Nome
                <input
                  aria-label="Nome da costureira"
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={current.person}
                />
              </label>
            ) : ledger.people.length > 1 ? (
              <label>
                Transferir pedidos e lançamentos para
                <select aria-label="Transferir para" name="name" required>
                  {ledger.people
                    .filter((name) => name !== current.person)
                    .map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                </select>
              </label>
            ) : (
              <p>
                Cadastre outra costureira para receber os pedidos e lançamentos
                antes de remover esta.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary"
              disabled={
                busy || (personDialog === "remove" && ledger.people.length < 2)
              }
            >
              {personDialog === "edit" ? "Salvar nome" : "Transferir e remover"}
            </button>
          </form>
        </NoteDialog>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="sewing-summary">
        {summary.map(([label, amount]) => (
          <article className="panel" key={label}>
            <small>{label}</small>
            <strong>
              <CountUp value={amount} format={money} />
            </strong>
          </article>
        ))}
      </div>
      <SewingOperations person={current.person} ledger={ledger} orders={orders.filter(order => order.status !== "Orçamento")} credit={current.printCredit} balance={current.balance} save={save} money={money} />
      <form className="panel sewing-entry" onSubmit={addEntry}>
        <label>
          Nome / referência
          <input
            name="name"
            maxLength={160}
            required={kind !== "payment"}
            placeholder={
              kind !== "payment"
                ? "Ex.: Camisas Igreja · João"
                : "Ex.: Acerto da semana"
            }
          />
        </label>
        <label>
          Lançamento
          <select
            aria-label="Lançamento"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="print">Estampagens · R$ 4 cada</option>
            <option value="print-front">Estampagem só frente · R$ 2 cada</option>
            <option value="payment">Pagamento de costura</option>
          </select>
        </label>
        {kind !== "payment" ? (
          <label>
            Quantidade de estampagens
            <input name="quantity" type="number" min="1" step="1" required />
          </label>
        ) : (
          <label>
            Valor pago
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
        )}
        <label>
          Data
          <input
            name="date"
            type="date"
            required
            defaultValue={new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Bahia",
            }).format(new Date())}
          />
        </label>
        <button className="primary" disabled={busy}>
          Registrar
        </button>
      </form>
      <section className="panel sewing-orders sewing-linked-orders">
        <header className="sewing-orders-header">
          <h2>Pedidos vinculados</h2>
          <div className="sewing-filters">
            <input aria-label="Buscar pedidos de costura" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou produto" />
            <select aria-label="Situação da costura" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="pending">Pendentes</option>
              <option value="paid">Quitados</option>
              <option value="excluded">Sem cobrança</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </header>
        {!visible.length && <p className="sewing-empty">Nenhum pedido nesta seleção.</p>}
        {visible.map(({ order, cost, paid, offset, remaining, excluded }) => {
          const expanded = expandedOrderId === order.id;
          const rate = ledger.rates[order.id] ?? (poloExtra(order.shirtType, order.product) > 0 ? 7 : 4);
          const linkedPayments = ledger.entries.filter(entry => entry.orderId === order.id && entry.kind === "payment");
          const lastPayment = linkedPayments.findLast(entry => entry.person === current.person);
          const status = remaining === 0 ? "Quitado" : paid + offset > 0 ? "Pagamento parcial" : "Pendente";
          return (
            <div key={order.id} className="sewing-linked-row">
              <div className="sewing-linked-name">
                <b>{order.customer}</b>
                <small>{order.product} · {order.quantity} {order.quantity === 1 ? "camisa" : "camisas"}</small>
              </div>
              <div className="sewing-linked-value">
                {excluded ? <small>Sem cobrança</small> : <>
                  <strong><MoneyText>{money(remaining || cost)}</MoneyText></strong>
                  <small>{remaining > 0 ? `A pagar · ${status}` : status}</small>
                </>}
              </div>
              <div className="sewing-linked-actions">
                {excluded ? <>
                  <button type="button" className="secondary" disabled={busy} onClick={() => void run({ type: "exclude-order", orderId: order.id, excluded: false })}>Restaurar cobrança</button>
                  <button type="button" className="secondary sewing-delete-link" disabled={busy || linkedPayments.length > 0} onClick={() => {
                    if (confirm(`Remover o pedido de ${order.customer} da lista de costura? O pedido continua na Produção.`))
                      void run({ type: "hide-order", orderId: order.id });
                  }}><Trash2 size={15} /> Remover da lista</button>
                </> : <>
                  {remaining > 0 && <button type="button" className="primary" disabled={busy} onClick={() => {
                    if (confirm(`Registrar pagamento de ${money(remaining)} da costura de ${order.customer}?`))
                      void run({ type: "pay-order", id: crypto.randomUUID(), orderId: order.id, expected: remaining, date: today });
                  }}>Marcar como pago</button>}
                  <button type="button" className="secondary sewing-more-actions" aria-expanded={expanded} aria-label={`Ações de costura de ${order.customer}`} onClick={() => setExpandedOrderId(expanded ? "" : order.id)}><Ellipsis size={18} /></button>
                </>}
              </div>
              {!excluded && expanded && <div className="sewing-linked-details">
                <label>Costureira<select aria-label={`Costureira de ${order.customer}`} disabled={busy} value={current.person} onChange={event =>
                  void run({ type: "assign", orderId: order.id, person: event.target.value, rate })
                }>{ledger.people.map(name => <option key={name}>{name}</option>)}</select></label>
                <label>Tarifa<select aria-label={`Tipo de costura de ${order.customer}`} disabled={busy} value={rate} onChange={event =>
                  void run({ type: "assign", orderId: order.id, person: current.person, rate: Number(event.target.value) })
                }><option value={4}>Camisa · R$ 4</option><option value={7}>Polo · R$ 7</option></select></label>
                <span className="sewing-linked-breakdown"><small>Costura {money(cost)}</small><small>Pago {money(paid)}</small>{offset > 0 && <small>Crédito utilizado {money(offset)}</small>}</span>
                {linkedPayments.length === 0 && <button type="button" className="secondary" disabled={busy} onClick={() => {
                  if (confirm("Remover a cobrança de costura deste pedido?"))
                    void run({ type: "exclude-order", orderId: order.id, excluded: true });
                }}>Remover cobrança</button>}
                {lastPayment && <button type="button" className="secondary" disabled={busy} onClick={() => {
                  if (confirm("Desfazer o último pagamento deste pedido?")) void run({ type: "remove", id: lastPayment.id });
                }}>Desfazer pagamento</button>}
              </div>}
            </div>
          );
        })}
      </section>
      <section className="panel sewing-orders sewing-history">
        <header className="sewing-orders-header">
          <h2>Lançamentos de {current.person}</h2>
          <div className="sewing-filters">
            <select aria-label="Ano dos lançamentos" value={year} onChange={event => { setYear(event.target.value); setMonth(""); }}>
              <option value="">Todos os anos</option>
              {years.map(item => <option key={item}>{item}</option>)}
            </select>
            {year && <select aria-label="Mês dos lançamentos" value={month} onChange={event => setMonth(event.target.value)}>
              <option value="">Todos os meses</option>
              {months.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>}
            <button type="button" className="secondary" onClick={() => setReportOpen(true)}><Printer size={16} /> PDF de costura</button>
          </div>
        </header>
        <dl className="sewing-period-totals">
          <div><dt>Pago no período</dt><dd><MoneyText>{money(periodTotals.paid)}</MoneyText></dd></div>
          <div><dt>Crédito líquido de estampagens no período</dt><dd><MoneyText>{money(periodTotals.printCredit)}</MoneyText></dd></div>
          <div><dt>Crédito utilizado no período</dt><dd><MoneyText>{money(periodTotals.offsets)}</MoneyText></dd></div>
          {allPaidInPeriod !== null && <div><dt>Pago a todas no período</dt><dd><MoneyText>{money(allPaidInPeriod)}</MoneyText></dd></div>}
        </dl>
        {!periodEntries.length && <p className="sewing-empty">Nenhum lançamento no período.</p>}
        {periodEntries.map((entry) => (
            <div key={entry.id}>
              <div>
                <b>
                  {entry.name ||
                    (entry.kind === "print"
                      ? entry.quantity + " estampagens"
                      : entry.kind === "offset" ? "Acerto de crédito" : "Pagamento")}
                </b>
                <small>
                  {entry.date.split("-").reverse().join("/")}
                  {entry.kind === "print"
                    ? " · " + entry.quantity + " estampagens"
                    : ""}
                  {entry.orderId
                    ? " · Pedido " +
                      (orders.find((order) => order.id === entry.orderId)
                        ?.customer || "removido")
                    : ""}
                </small>
              </div>
              {entry.kind === "print" && (
                <form
                  className="sewing-rename"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run({
                      type: "rename",
                      id: entry.id,
                      name: String(
                        new FormData(e.currentTarget).get("reference") || "",
                      ).trim(),
                    });
                  }}
                >
                  <input
                    aria-label={
                      "Nome da estampagem " +
                      (entry.name || entry.quantity + " estampagens")
                    }
                    name="reference"
                    defaultValue={entry.name || ""}
                    maxLength={160}
                    required
                    placeholder="Nome da estampagem"
                  />
                  <button className="secondary" disabled={busy}>
                    Salvar nome
                  </button>
                </form>
              )}
              <strong><MoneyText>{money(entry.amount)}</MoneyText></strong>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (confirm("Desfazer este lançamento?"))
                    void run({ type: "remove", id: entry.id });
                }}
              >
                Desfazer
              </button>
            </div>
          ))}
      </section>
      {reportOpen && <SewingReport close={() => setReportOpen(false)} report={{
        title: "Extrato de costura",
        filename: `costura-${current.person}-${period || today}`,
        subtitle: `${current.person} · ${periodLabel}`,
        text: [
          `Pago no período: ${money(periodTotals.paid)}`,
          `Crédito líquido de estampagens no período: ${money(periodTotals.printCredit)}`,
          `Crédito utilizado no período: ${money(periodTotals.offsets)}`,
          `A pagar atualmente: ${money(Math.max(0, current.balance))}`,
        ].join("\n"),
        sections: [
          {
            title: "Pedidos vinculados · situação atual",
            columns: ["Pedido", "Peças", "Costura", "Pago", "Crédito usado", "Pendente", "Situação"],
            rows: orderRows.map(({ order, cost, paid, offset, remaining, excluded }) => [
              `${order.customer}\n${order.product}`, order.quantity, money(cost), money(paid), money(offset), money(remaining),
              excluded ? "Sem cobrança" : remaining === 0 ? "Quitado" : paid + offset > 0 ? "Parcial" : "Pendente",
            ]),
          },
          {
            title: "Lançamentos do período",
            columns: ["Data", "Tipo", "Referência", "Valor"],
            rows: periodEntries.map(entry => [
              entry.date.split("-").reverse().join("/"),
              entry.kind === "print" ? "Crédito de estampagem" : entry.kind === "offset" ? "Acerto de crédito" : "Pagamento",
              [entry.name, entry.kind === "print" ? `${entry.quantity} estampagens` : "", orders.find(order => order.id === entry.orderId)?.customer].filter(Boolean).join(" · ") || "—",
              money(entry.amount),
            ]),
          },
        ].filter(section => section.rows.length > 0),
      }} />}
    </section>
  );
}

function SewingReport({ report, close }: { report: PdfReport; close: () => void }) {
  return <NoteDialog title="Extrato de costura" close={close}>
    <div className="sewing-report-preview">
      <strong>{report.subtitle}</strong>
      <p>{report.text}</p>
    </div>
    <footer className="an-export-actions">
      <PdfDownloadButton report={report} />
      <button type="button" className="an-primary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
    </footer>
    {createPortal(<article className="sewing-print-report" aria-hidden="true">
      <header><small>PSYZON GO</small><h1>{report.title}</h1><p>{report.subtitle}</p></header>
      <p>{report.text}</p>
      {report.sections?.map(section => <section key={section.title}>
        <h2>{section.title}</h2>
        <table>
          <thead><tr>{section.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{section.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </section>)}
    </article>, document.body)}
  </NoteDialog>;
}
