"use client";
import { useState, type FormEvent } from "react";
import type { Order } from "./order-model";
import {
  sewingBalances,
  type SewingLedger,
  type SewingEntry,
} from "./sewing-model";
import { CountUp } from "./MotionValue";
import "./sewing.css";
export type SewingChange =
  | { type: "person"; name: string }
  | { type: "assign"; orderId: string; person: string; rate: number }
  | { type: "entry"; entry: SewingEntry }
  | { type: "remove"; id: string };
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
  const [kind, setKind] = useState<"print" | "payment">("print");
  const balances = sewingBalances(orders, ledger),
    current = balances.find((item) => item.person === person) || balances[0];
  async function run(change: SewingChange) {
    setBusy(true);
    setError("");
    try {
      await save(change);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
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
      },
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
            className={person === name ? "primary" : "secondary"}
            key={name}
            onClick={() => setPerson(name)}
          >
            {name}
          </button>
        ))}
      </nav>
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
        {current.rows.map((order) => (
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
              value={ledger.assignments[order.id] || "Zefa"}
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
                  person: ledger.assignments[order.id] || "Zefa",
                  rate: Number(e.target.value),
                })
              }
            >
              <option value={4}>Camisa · R$ 4</option>
              <option value={7}>Polo · R$ 7</option>
            </select>
            <strong>
              {money(
                order.quantity *
                  (ledger.rates[order.id] ??
                    (/\bpolo\b/i.test(order.product) ? 7 : 4)),
              )}
            </strong>
          </div>
        ))}
      </section>
      <section className="panel sewing-orders">
        <h2>Lançamentos de {current.person}</h2>
        {ledger.entries
          .filter((entry) => entry.person === current.person)
          .map((entry) => (
            <div key={entry.id}>
              <div>
                <b>
                  {entry.kind === "print"
                    ? entry.quantity + " estampagens"
                    : "Pagamento"}
                </b>
                <small>{entry.date}</small>
              </div>
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
