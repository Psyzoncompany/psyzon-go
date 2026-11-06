"use client";

import Image from "next/image";
import { ArrowRight, CalendarDays, Clipboard, FileImage, Link2, Pencil, Plus, Printer, Ruler, Search, Trash2, WalletCards, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import Modal from "./Modal";
import OrderPhotoField from "./OrderPhotoField";
import { customerNameKey, type Customer } from "./finance-model";
import { millis } from "./notes-model";
import { dtfArtworkLink, dtfCode, dtfDate, dtfForCustomer, dtfOverdue, dtfPending, dtfStages, dtfTotal, validateDtf, type DtfInput, type DtfOrder, type DtfStage } from "./dtf-model";
import "./dtf.css";

type Connection = "connecting" | "live" | "error";
type Props = {
  orders: DtfOrder[];
  customers: Customer[];
  customerId: string;
  connection: Connection;
  today: string;
  displayMoney: (amount: number) => string;
  displayTotal: (amount: number) => string;
  clearCustomer: () => void;
  onSave: (input: DtfInput, id?: string) => Promise<void>;
  onMove: (id: string, stage: DtfStage) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const meterLabel = (lengthCm: number) => `${number.format(lengthCm / 100)} m`;
const widthLabel = (widthCm: number) => widthCm ? `${number.format(widthCm)} cm` : "Largura livre";

export default function DtfWorkspace({ orders, customers, customerId, connection, today, displayMoney, displayTotal, clearCustomer, onSave, onMove, onDelete }: Props) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<DtfStage | "all">("all");
  const [link, setLink] = useState("all");
  const [editor, setEditor] = useState<DtfOrder | "new" | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  const customer = customers.find(item => item.id === customerId);
  const names = new Map(customers.map(item => [item.id, item.name]));
  const nameFor = (order: DtfOrder) => names.get(order.customerId) || order.customerName || "Sem cliente";
  const scoped = customer ? orders.filter(order => dtfForCustomer(order, customer)) : customerId ? orders.filter(order => order.customerId === customerId) : orders;
  const linked = scoped.filter(order => link === "all" || Boolean(order.customerId) === (link === "linked"));
  const term = customerNameKey(query);
  const filtered = linked.filter(order => (!term || customerNameKey(`${order.title} ${nameFor(order)} ${dtfCode(order.id)}`).includes(term)));
  const visible = filtered.filter(order => stage === "all" || order.stage === stage).sort((a, b) =>
    Number(a.stage === "Entregue") - Number(b.stage === "Entregue") ||
    (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || millis(b.updatedAt) - millis(a.updatedAt));
  const active = scoped.filter(order => order.stage !== "Entregue");
  const late = active.filter(order => dtfOverdue(order, today)).length;
  const queued = active.filter(order => order.stage === "Aguardando arte" || order.stage === "Em impressão").reduce((sum, order) => sum + order.lengthCm, 0);
  const pending = scoped.filter(order => order.stage !== "Orçamento").reduce((sum, order) => sum + dtfPending(order), 0);
  const ticket = scoped.find(order => order.id === ticketId);
  const live = connection === "live";

  async function run(id: string, action: () => Promise<void>) {
    if (workingId || !live) return;
    setWorkingId(id);
    setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o pedido."); }
    finally { setWorkingId(""); }
  }

  return <section className="dtf-workspace">
    <header className="dtf-header">
      <div className="dtf-title"><span className="dtf-title-icon"><Printer size={23} /></span><div><h1>Pedidos DTF</h1><p>Organize a impressão, os prazos e os pagamentos.</p></div></div>
      <button className="primary" disabled={!live} onClick={() => setEditor("new")}><Plus size={17} /> Novo pedido DTF</button>
    </header>
    {customerId && <div className="dtf-customer-scope"><Link2 size={16} /> <strong>{customer?.name || "Cliente vinculado"}</strong><button type="button" onClick={clearCustomer}>Ver todos os pedidos <X size={14} /></button></div>}
    {!live && <p className="dtf-connection" role={connection === "error" ? "alert" : "status"}>{connection === "error" ? "Não foi possível sincronizar os pedidos DTF. Atualize a página para tentar novamente." : "Carregando os pedidos DTF…"}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dtf-metrics">
      <article><Clipboard size={17} /><div><span>Em andamento</span><strong>{active.length}</strong><small>{scoped.length - active.length} entregues</small></div></article>
      <article><Ruler size={17} /><div><span>Metragem na fila</span><strong>{meterLabel(queued)}</strong><small>Aguardando arte ou em impressão</small></div></article>
      <article data-alert={late > 0}><CalendarDays size={17} /><div><span>Pedidos atrasados</span><strong>{late}</strong><small>Prazo vencido, sem entrega</small></div></article>
      <article><WalletCards size={17} /><div><span>A receber no DTF</span><strong>{displayTotal(pending)}</strong><small>Pedidos confirmados</small></div></article>
    </div>
    <section className="dtf-pipeline" aria-label="Acompanhamento dos pedidos DTF">
      <div className="dtf-tools">
        <label className="dtf-search"><Search size={17} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Buscar pedidos DTF" placeholder="Buscar por pedido, cliente ou código" /></label>
        <select aria-label="Tipo de vínculo" value={link} onChange={event => setLink(event.target.value)}><option value="all">Todos os vínculos</option><option value="linked">Clientes vinculados</option><option value="unlinked">Pedidos avulsos</option></select>
        <span className="dtf-results" aria-live="polite">{visible.length} {visible.length === 1 ? "pedido" : "pedidos"}</span>
      </div>
      <div className="dtf-filters" aria-label="Filtrar por etapa">
        <button type="button" aria-pressed={stage === "all"} onClick={() => setStage("all")}>Todos <span>{filtered.length}</span></button>
        {dtfStages.map(value => <button key={value} type="button" aria-pressed={stage === value} onClick={() => setStage(value)}>{value} <span>{filtered.filter(item => item.stage === value).length}</span></button>)}
      </div>
      <div className="dtf-orders">
        {visible.map(order => {
          const next = dtfStages[dtfStages.indexOf(order.stage) + 1];
          const overdue = dtfOverdue(order, today);
          const due = order.dueDate === today && order.stage !== "Entregue" ? "Entrega hoje" : dtfDate(order.dueDate);
          return <article className="dtf-order" key={order.id}>
            <div className="dtf-thumb" aria-hidden="true">
              {order.photoData ? <Image unoptimized src={order.photoData} width={88} height={88} alt="" /> : <FileImage size={23} />}
            </div>
            <div className="dtf-order-description">
              <div><span className="dtf-code">#{dtfCode(order.id)}</span><span className="dtf-stage" data-stage={dtfStages.indexOf(order.stage)}>{order.stage}</span></div>
              <h2>{order.title}</h2><p>{nameFor(order)} <span className="dtf-link-tag">{order.customerId ? "Vinculado" : "Avulso"}</span></p>
            </div>
            <div className="dtf-order-specs"><b>{meterLabel(order.lengthCm)}</b><span>{widthLabel(order.widthCm)}</span></div>
            <div className="dtf-order-deadline" data-late={overdue}><CalendarDays size={15} /><span>{overdue ? `Atrasado · ${due}` : due}</span></div>
            <div className="dtf-order-money"><b>{displayMoney(dtfTotal(order))}</b><span>{dtfPending(order) > 0 ? `${displayMoney(dtfPending(order))} pendente` : dtfTotal(order) ? "Quitado" : "Sem cobrança"}</span></div>
            <div className="dtf-order-actions">
              <button className="dtf-open-ticket" type="button" aria-label={`Abrir ficha de ${order.title}`} onClick={() => setTicketId(order.id)}><Clipboard size={15} /> Ficha</button>
              {next && <button className="dtf-advance" type="button" disabled={!live || !!workingId} onClick={() => void run(order.id, () => onMove(order.id, next))}>{next === "Entregue" ? "Entregar" : "Avançar"} <ArrowRight size={14} /></button>}
              <button type="button" aria-label={`Editar DTF ${order.title}`} title="Editar pedido" disabled={!live || !!workingId} onClick={() => setEditor(order)}><Pencil size={16} /></button>
            </div>
          </article>;
        })}
        {live && !visible.length && <div className="dtf-empty"><Printer size={29} /><h2>{scoped.length ? "Nenhum pedido com esses filtros" : "Nenhum pedido DTF por aqui"}</h2><p>{scoped.length ? "Altere a busca, o vínculo ou a etapa." : "Cadastre o primeiro pedido com um cliente vinculado ou como avulso."}</p>{!scoped.length && <button className="secondary" onClick={() => setEditor("new")}><Plus size={16} /> Novo pedido DTF</button>}</div>}
      </div>
    </section>
    {editor && <DtfEditor order={editor === "new" ? undefined : editor} customers={customers} customer={customer} displayMoney={displayMoney} onSave={onSave} onDelete={onDelete} close={() => setEditor(null)} />}
    {ticket && <DtfTicket order={ticket} customerName={nameFor(ticket)} close={() => setTicketId("")} />}
  </section>;
}

function DtfEditor({ order, customers, customer, displayMoney, onSave, onDelete, close }: Pick<Props, "customers" | "displayMoney" | "onSave" | "onDelete"> & { order?: DtfOrder; customer?: Customer; close: () => void }) {
  const [selectedId, setSelectedId] = useState(order?.customerId ?? customer?.id ?? "");
  const [meters, setMeters] = useState(order ? String(order.lengthCm / 100) : "");
  const [price, setPrice] = useState(order ? String(order.priceCents / 100) : "");
  const [paid, setPaid] = useState(order ? String(order.paidCents / 100) : "");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const linked = customers.find(item => item.id === selectedId);
  const blocked = busy || photoBusy;
  const lengthCm = Math.round(Number(meters) * 100);
  const priceCents = Math.round(Number(price) * 100);
  const paidCents = Math.round(Number(paid) * 100);
  const total = dtfTotal({ lengthCm, priceCents });
  const entries = [...customers].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "").trim();
    const input: DtfInput = {
      title: get("title"), customerId: selectedId,
      customerName: selectedId ? linked?.name ?? order?.customerName ?? "" : get("customerName"),
      phone: selectedId ? linked?.phone ?? order?.phone ?? "" : get("phone"),
      lengthCm, widthCm: Number(get("widthCm")), priceCents, paidCents, dueDate: get("dueDate"),
      stage: get("stage") as DtfStage, artworkUrl: get("artworkUrl").replace(/^https?:/i, value => value.toLowerCase()), notes: get("notes"), photoData: get("photoData"),
    };
    setError("");
    setBusy(true);
    try { validateDtf(input); await onSave(input, order?.id); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o pedido."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!order || blocked || !window.confirm(`Excluir o pedido DTF “${order.title}”?`)) return;
    setBusy(true);
    setError("");
    try { await onDelete(order.id); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o pedido."); }
    finally { setBusy(false); }
  }

  return <Modal titleId="dtf-editor-title" busy={blocked} close={close}>
    <header><div><span className="eyebrow">IMPRESSÃO DTF</span><h2 id="dtf-editor-title">{order ? "Editar pedido DTF" : "Novo pedido DTF"}</h2></div><button type="button" onClick={close} disabled={blocked} aria-label="Fechar"><X size={19} /></button></header>
    <form className="dtf-editor" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>Pedido e cliente</legend>
        <label>Nome do pedido<input name="title" required maxLength={160} placeholder="Ex.: Estampas para uniformes" defaultValue={order?.title} /></label>
        <label>Cliente vinculado<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">Pedido avulso</option>{selectedId && !linked && <option value={selectedId}>{order?.customerName} (cadastro indisponível)</option>}{entries.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        {!selectedId && <div className="form-row"><label>Nome avulso (opcional)<input name="customerName" maxLength={120} defaultValue={order?.customerName} /></label><label>Contato (opcional)<input name="phone" type="tel" maxLength={40} defaultValue={order?.phone} /></label></div>}
        <div className="form-row"><label>Etapa<select name="stage" defaultValue={order?.stage ?? "Aguardando arte"}>{dtfStages.map(value => <option key={value}>{value}</option>)}</select></label><label>Prazo<input name="dueDate" type="date" max="9999-12-31" defaultValue={order?.dueDate} /></label></div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Metragem e valores</legend>
        <div className="form-row"><label>Metragem (m)<input type="number" min="0.01" max="10000" step="0.01" required value={meters} onChange={event => setMeters(event.target.value)} /></label><label>Largura (cm)<input name="widthCm" type="number" min="0.01" max="300" step="0.01" placeholder="Opcional" defaultValue={order?.widthCm || ""} /></label></div>
        <div className="form-row"><label>Preço por metro (R$)<input type="number" min="0" max="10000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label><label>Valor recebido (R$)<input type="number" min="0" max="100000000" step="0.01" value={paid} onChange={event => setPaid(event.target.value)} /></label></div>
        <div className="dtf-estimate" aria-live="polite"><div><span>Total do pedido</span><strong>{displayMoney(total)}</strong></div><div><span>Pendente</span><strong>{displayMoney(Math.max(0, total - paidCents / 100))}</strong></div></div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Arte e instruções</legend>
        <label>Link do arquivo<input name="artworkUrl" type="url" maxLength={2000} placeholder="https://…" defaultValue={order?.artworkUrl} /></label>
        <OrderPhotoField label="Imagem de referência" initialValue={order?.photoData} onBusyChange={setPhotoBusy} />
        <label>Observações<textarea name="notes" rows={3} maxLength={4000} placeholder="Detalhes para preparar e conferir a impressão" defaultValue={order?.notes} /></label>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer>{order && <button className="dtf-delete" type="button" disabled={blocked} onClick={() => void remove()}><Trash2 size={17} /> Excluir</button>}<button className="secondary" type="button" disabled={blocked} onClick={close}>Cancelar</button><button className="primary" type="submit" disabled={blocked}>{busy ? "Salvando…" : "Salvar pedido"}</button></footer>
    </form>
  </Modal>;
}

function DtfTicket({ order, customerName, close }: { order: DtfOrder; customerName: string; close: () => void }) {
  const [notice, setNotice] = useState("");
  const link = dtfArtworkLink(order.artworkUrl);
  const lines = [
    `Pedido #${dtfCode(order.id)} · ${order.title}`, `Cliente: ${customerName}`, `Etapa: ${order.stage}`,
    `Prazo: ${dtfDate(order.dueDate)}`, `Impressão: ${meterLabel(order.lengthCm)} · ${widthLabel(order.widthCm)}`,
    ...(order.phone ? [`Contato: ${order.phone}`] : []), ...(link ? [`Arte: ${link}`] : []), ...(order.notes ? [`\nObservações\n${order.notes}`] : []),
  ];
  const ticketText = lines.join("\n");

  async function copy() {
    try { await navigator.clipboard.writeText(ticketText); setNotice("Ficha copiada."); }
    catch { setNotice("Selecione o texto da ficha para copiar."); }
  }

  function print() {
    const frame = document.createElement("iframe");
    frame.className = "dtf-print-frame";
    frame.title = "Ficha DTF para impressão";
    const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const photo = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(order.photoData) ? `<img alt="Referência" src="${order.photoData}">` : "";
    frame.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha DTF ${dtfCode(order.id).replace(/[^A-Z0-9]/g, "")}</title><style>@page{size:A4;margin:16mm}body{font:14px/1.5 system-ui,sans-serif;color:#111}h1{font-size:23px;margin:0 0 12px;border-bottom:2px solid #111;padding-bottom:8px}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}img{display:block;max-width:100%;max-height:85mm;object-fit:contain;break-inside:avoid;margin-top:12px}</style></head><body><h1>Ficha de impressão DTF</h1><pre>${escape(ticketText)}</pre>${photo}</body></html>`;
    frame.onload = () => {
      const target = frame.contentWindow;
      if (!target) { frame.remove(); return; }
      target.addEventListener("afterprint", () => frame.remove(), { once: true });
      target.print();
    };
    document.body.append(frame);
  }

  return <Modal titleId="dtf-ticket-title" busy={false} close={close}>
    <header><div><span className="eyebrow">ORDEM DE IMPRESSÃO</span><h2 id="dtf-ticket-title">Ficha DTF</h2></div><button type="button" onClick={close} aria-label="Fechar"><X size={19} /></button></header>
    <div className="dtf-ticket">
      {order.photoData && <Image unoptimized width={440} height={280} src={order.photoData} alt="Referência da impressão" />}
      <pre>{ticketText}</pre>
      {link && <a className="secondary" href={link} target="_blank" rel="noopener noreferrer"><Link2 size={16} /> Abrir arquivo da arte</a>}
      <div><button type="button" className="secondary" onClick={() => void copy()}><Clipboard size={16} /> Copiar ficha</button><button type="button" className="primary" onClick={print}><Printer size={16} /> Imprimir ficha</button></div>
      {notice && <p role="status">{notice}</p>}
    </div>
  </Modal>;
}
