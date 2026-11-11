"use client";
import { useRef, useState, type FormEvent } from "react";
import type { Order } from "./order-model";
import {
  sewingBalances,
  sewingOrderBalances,
  sewingPerson,
  type SewingLedger,
  type SewingEntry,
} from "./sewing-model";
import { CountUp } from "./MotionValue";
import "./sewing.css";
import NoteDialog from "./notes/NoteDialog";
export type SewingChange =
  | { type: "person"; name: string }
  | { type: "person-rename"; from: string; name: string }
  | { type: "person-remove"; from: string; name: string }
  | { type: "assign"; orderId: string; person: string; rate: number }
  | { type: "entry"; entry: SewingEntry }
  | { type: "remove"; id: string }
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
  const [kind, setKind] = useState<"print" | "payment">("print");
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const working = useRef(false);
  const balances = sewingBalances(orders, ledger),
    current = balances.find((item) => item.person === person) || balances[0];
  const orderRows = sewingOrderBalances(orders, ledger, current.person);
  const visible = orderRows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "paid" ? row.remaining === 0 : row.remaining > 0)) &&
      (row.order.customer + " " + row.order.product)
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
  }).format(new Date());
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
    const kind = values.get("kind") as "print" | "payment",
      quantity = Number(values.get("quantity"));
    const amount =
      kind === "print" ? quantity * 4 : Number(values.get("amount"));
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
        {[
          ["Costura", current.total],
          ["Estampagens descontadas", current.prints],
          ["Pago", current.paid],
          [
            current.balance < 0 ? "Crédito disponível" : "A pagar",
            Math.abs(current.balance),
          ],
        ].map(([label, amount]) => (
          <article className="panel" key={label}>
            <small>{label}</small>
            <strong>
              <CountUp value={Number(amount)} format={money} />
            </strong>
          </article>
        ))}
      </div>
      <form className="panel sewing-entry" onSubmit={addEntry}>
        <label>
          Nome / referência
          <input
            name="name"
            maxLength={160}
            required={kind === "print"}
            placeholder={
              kind === "print"
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
            onChange={(e) => setKind(e.target.value as "print" | "payment")}
          >
            <option value="print">Estampagens · R$ 4 cada</option>
            <option value="payment">Pagamento de costura</option>
          </select>
        </label>
        {kind === "print" ? (
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
      <section className="panel sewing-orders">
        <h2>Pedidos vinculados</h2>
        <div className="sewing-filters">
          <input
            aria-label="Buscar pedidos de costura"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente ou produto"
          />
          <select
            aria-label="Situação da costura"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="pending">Pendentes</option>
            <option value="paid">Quitados</option>
            <option value="all">Todos</option>
          </select>
        </div>
        {!visible.length && (
          <p className="sewing-empty">Nenhum pedido nesta seleção.</p>
        )}
        {visible.map(({ order, cost, paid, credit, remaining }) => (
          <div key={order.id}>
            <div>
              <b>{order.customer}</b>
              <small>
                {order.product} · {order.quantity} camisas
              </small>
            </div>
            <select
              aria-label={"Costureira de " + order.customer}
              disabled={busy}
              value={sewingPerson(ledger, order.id)}
              onChange={(e) =>
                void run({
                  type: "assign",
                  orderId: order.id,
                  person: e.target.value,
                  rate:
                    ledger.rates[order.id] ??
                    (/\bpolo\b/i.test(order.product) ? 7 : 4),
                })
              }
            >
              {ledger.people.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label={"Tipo de costura de " + order.customer}
              disabled={busy}
              value={
                ledger.rates[order.id] ??
                (/\bpolo\b/i.test(order.product) ? 7 : 4)
              }
              onChange={(e) =>
                void run({
                  type: "assign",
                  orderId: order.id,
                  person: sewingPerson(ledger, order.id),
                  rate: Number(e.target.value),
                })
              }
            >
              <option value={4}>Camisa · R$ 4</option>
              <option value={7}>Polo · R$ 7</option>
            </select>
            <div className="sewing-order-balance">
              <strong>{money(cost)}</strong>
              <small>
                {remaining === 0
                  ? credit === cost
                    ? "Compensado com estampagens"
                    : "Quitado"
                  : paid + credit > 0
                    ? "Parcial"
                    : "Pendente"}
              </small>
              {paid > 0 && <small>Pago {money(paid)}</small>}
              {credit > 0 && <small>Descontado {money(credit)}</small>}
              {remaining > 0 && <b>Falta {money(remaining)}</b>}
            </div>
            {remaining > 0 && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Registrar pagamento de " +
                        money(remaining) +
                        " da costura de " +
                        order.customer +
                        "?",
                    )
                  )
                    void run({
                      type: "pay-order",
                      id: crypto.randomUUID(),
                      orderId: order.id,
                      expected: remaining,
                      date: today,
                    });
                }}
              >
                Marcar como pago
              </button>
            )}
            {ledger.entries.some(
              (entry) =>
                entry.kind === "payment" &&
                entry.orderId === order.id &&
                entry.person === current.person,
            ) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  const entry = ledger.entries
                    .filter(
                      (entry) =>
                        entry.kind === "payment" &&
                        entry.orderId === order.id &&
                        entry.person === current.person,
                    )
                    .at(-1);
                  if (
                    entry &&
                    confirm("Desfazer o último pagamento deste pedido?")
                  )
                    void run({ type: "remove", id: entry.id });
                }}
              >
                Desfazer pagamento
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="panel sewing-orders">
        <h2>Lançamentos de {current.person}</h2>
        {ledger.entries
          .filter((entry) => entry.person === current.person)
          .slice()
          .sort(
            (a, b) =>
              b.date.localeCompare(a.date) ||
              ledger.entries.indexOf(b) - ledger.entries.indexOf(a),
          )
          .map((entry) => (
            <div key={entry.id}>
              <div>
                <b>
                  {entry.name ||
                    (entry.kind === "print"
                      ? entry.quantity + " estampagens"
                      : "Pagamento")}
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
              <strong>{money(entry.amount)}</strong>
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
    </section>
  );
}
