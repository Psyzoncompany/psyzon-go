"use client";

import { useState, type FormEvent } from "react";
import Modal from "./Modal";
import { Check, MessageCircle, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import type { CustomerBalance } from "./finance-model";

type Props = {
  customers: CustomerBalance[];
  displayMoney: (value: number) => string;
  onCreate: () => void;
  onSave: (customer: CustomerBalance, total: number, pending: number) => Promise<void>;
  onDelete: (customer: CustomerBalance) => Promise<void>;
  dtfCount: (customer: CustomerBalance) => number;
  openDtf: (customerId: string) => void;
};

export default function CustomersWorkspace({ customers, displayMoney, onCreate, onSave, onDelete, dtfCount, openDtf }: Props) {
  const [editing, setEditing] = useState<CustomerBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSave(editing, Number(form.get("total")), Number(form.get("pending")));
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar os valores.");
    } finally { setBusy(false); }
  };
  return <>
    <div className="page-heading compact"><div><h1>Clientes</h1><p>Cadastro e valores a receber.</p></div><button className="primary" onClick={onCreate}><Plus size={17} /> Novo cliente</button></div>
    {error && !editing && <p role="alert" className="form-error">{error}</p>}
    <div className="customer-grid">{customers.map((customer) => {
      const phone = customer.phone.replace(/\D/g, "");
      const count = dtfCount(customer);
      return <article className="customer-card" key={customer.id}>
        <div className="customer-card-top"><span className="avatar large">{customer.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><h3>{customer.name}</h3><p>{customer.company || customer.phone || "Sem contato"}</p></div><div className="customer-actions"><button aria-label={`Editar valores de ${customer.name}`} title="Editar valores" onClick={() => { setError(""); setEditing(customer); }}><Pencil size={16} /></button><button disabled={busy} aria-label={`Excluir cliente ${customer.name}`} title="Excluir cliente" onClick={async () => { setBusy(true); setError(""); try { await onDelete(customer); } catch { setError("Não foi possível excluir o cliente."); } finally { setBusy(false); } }}><Trash2 size={16} /></button></div></div>
        <div className="customer-stats"><span><small>Total comprado</small><b>{displayMoney(customer.total)}</b></span><span><small>Saldo pendente</small><b className={customer.pending ? "negative" : "positive"}>{displayMoney(customer.pending)}</b></span></div>
        <footer><span>{customer.orderCount} {customer.orderCount === 1 ? "pedido" : "pedidos"}</span><button type="button" className="customer-dtf-link" aria-label={`Pedidos DTF de ${customer.name}`} onClick={() => openDtf(customer.id)}><Printer size={14} /> {count ? `${count} DTF` : "DTF"}</button>{phone && <a href={`https://wa.me/${phone.length <= 11 ? `55${phone}` : phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> WhatsApp</a>}</footer>
      </article>;
    })}</div>
    {!customers.length && <div className="panel finance-empty">Nenhum cliente cadastrado.</div>}
    {editing && <Modal titleId="customer-edit-title" busy={busy} close={() => setEditing(null)}><header><div><h2 id="customer-edit-title">Editar valores</h2><p>{editing.name}</p></div><button disabled={busy} aria-label="Fechar" onClick={() => setEditing(null)}><X size={20} /></button></header><form onSubmit={save}><label className="full">Total comprado<input name="total" type="number" min="0" max="100000000" step="0.01" required defaultValue={editing.total} /></label><label className="full">Saldo pendente<input name="pending" type="number" min="0" max="100000000" step="0.01" required defaultValue={editing.pending} /></label>{error && <p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="primary" disabled={busy}><Check size={17} />{busy ? "Salvando…" : "Salvar valores"}</button></footer></form></Modal>}
  </>;
}
