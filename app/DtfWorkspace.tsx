"use client";

import Image from "next/image";
import { ArrowRight, CalendarDays, Clipboard, FileImage, Link2, Pencil, Plus, Printer, Ruler, Search, Trash2, WalletCards, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import Modal from "./Modal";
import DtfPrints from "./DtfPrints";
import DtfPhotoField from "./DtfPhotoField";
import DtfNamesLink from "./DtfNamesLink";
import { customerNameKey, type Customer } from "./finance-model";
import { millis, type BusinessNote } from "./notes-model";
import { indexDtfCustomerLinks, type DtfCustomerLink } from "./dtf-links";
import type { Order } from "./order-model";
import { dtfArtworkLink, dtfCode, dtfDate, dtfForCustomer, dtfOverdue, dtfPending, dtfPhotos, dtfStages, dtfTitle, dtfTotal, packDtfPhotos, readDtfPrints, validateDtf, type DtfInput, type DtfOrder, type DtfPrintChange, type DtfStage } from "./dtf-model";
import "./dtf.css";

type Connection = "connecting" | "live" | "error";
type Props = {
  orders: DtfOrder[];
  customers: Customer[];
  productionOrders: Order[];
  notes: BusinessNote[];
  customerId: string;
  connection: Connection;
  today: string;
  displayMoney: (amount: number) => string;
  displayTotal: (amount: number) => string;
  clearCustomer: () => void;
  onSave: (input: DtfInput, previous?: DtfOrder) => Promise<void>;
  onMove: (id: string, stage: DtfStage) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPrintChange: (id: string, change: DtfPrintChange) => Promise<void>;
  openNote: (id: string) => void;
};

const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const meterLabel = (lengthCm: number) => `${number.format(lengthCm / 100)} m`;
const widthLabel = (widthCm: number) => widthCm ? `${number.format(widthCm)} cm` : "Largura livre";

export default function DtfWorkspace({ orders, customers, productionOrders, notes, customerId, connection, today, displayMoney, displayTotal, clearCustomer, onSave, onMove, onDelete, onPrintChange, openNote }: Props) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<DtfStage | "all">("all");
  const [link, setLink] = useState("all");
  const [editor, setEditor] = useState<DtfOrder | "new" | null>(null);
  const [ticketId, setTicketId] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");

  const customer = customers.find(item => item.id === customerId);
  const names = new Map(customers.map(item => [item.id, item.name]));
  const printsByOrder = useMemo(() => new Map(orders.map(order => [order.id, readDtfPrints(order.printsData)])), [orders]);
  const links = useMemo(() => indexDtfCustomerLinks(customers, productionOrders, notes), [customers, productionOrders, notes]);
  const linkedDeadlines = new Map(orders.map(order => [order.id, [order, ...(printsByOrder.get(order.id) ?? [])]
    .flatMap(item => links.get(item.customerId)?.deadline ?? []).sort()[0]]));
  const deadlineFor = (order: DtfOrder) => linkedDeadlines.get(order.id) ?? order.dueDate;
  const nameFor = (order: DtfOrder) => names.get(order.customerId) || order.customerName || "Sem cliente";
  const scoped = customerId ? orders.filter(order => [order, ...(printsByOrder.get(order.id) ?? [])].some(item => customer ? dtfForCustomer(item, customer) : item.customerId === customerId)) : orders;
  const linked = scoped.filter(order => link === "all" || Boolean(order.customerId) === (link === "linked"));
  const term = customerNameKey(query);
  const filtered = linked.filter(order => !term || customerNameKey([order.title, nameFor(order), dtfCode(order.id), ...(printsByOrder.get(order.id) ?? []).flatMap(print => [print.title, names.get(print.customerId) || print.customerName])].join(" ")).includes(term));
  const visible = filtered.filter(order => stage === "all" || order.stage === stage).sort((a, b) =>
    Number(a.stage === "Entregue") - Number(b.stage === "Entregue") ||
    (deadlineFor(a) || "9999").localeCompare(deadlineFor(b) || "9999") || millis(b.updatedAt) - millis(a.updatedAt));
  const active = scoped.filter(order => order.stage !== "Entregue");
  const late = active.filter(order => dtfOverdue({ ...order, dueDate: deadlineFor(order) }, today)).length;
  const queued = active.filter(order => order.stage === "Aguardando arte" || order.stage === "Em impressão").reduce((sum, order) => sum + order.lengthCm, 0);
  const pending = scoped.filter(order => order.stage !== "Orçamento" && (!customerId || (customer ? dtfForCustomer(order, customer) : order.customerId === customerId))).reduce((sum, order) => sum + dtfPending(order), 0);
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
      <div className="dtf-title"><span className="dtf-title-icon"><Printer size={23} /></span><div><h1>Pedidos DTF</h1><p>Monte a lista de estampas de cada metro e acompanhe a separação.</p></div></div>
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
          const dueDate = deadlineFor(order);
          const overdue = dtfOverdue({ ...order, dueDate }, today);
          const due = dueDate === today && order.stage !== "Entregue" ? "Entrega hoje" : dtfDate(dueDate);
          const prints = printsByOrder.get(order.id) ?? [];
          const title = dtfTitle(order);
          return <article className="dtf-order" key={order.id}>
            <div className="dtf-thumb" aria-hidden="true">
              {order.photoData ? <Image unoptimized src={order.photoData} width={88} height={88} alt="" /> : <FileImage size={23} />}
            </div>
            <div className="dtf-order-description">
              <div><span className="dtf-code">#{dtfCode(order.id)}</span><span className="dtf-stage" data-stage={dtfStages.indexOf(order.stage)}>{order.stage}</span></div>
              <h2>{title}</h2><div className="dtf-client-line"><p>{nameFor(order)} <span className="dtf-link-tag">{order.customerId ? "Vinculado" : "Avulso"}</span></p><DtfNamesLink noteId={links.get(order.customerId)?.noteId} openNote={openNote} /></div>
              {order.notes?.trim() && <p className="dtf-order-notes"><b>Observações</b><span>{order.notes}</span></p>}
            </div>
            <div className="dtf-order-specs"><b>{order.quantity ? `${order.quantity} un.` : order.lengthCm ? meterLabel(order.lengthCm) : "—"}</b>{order.quantity && order.lengthCm ? <span>{meterLabel(order.lengthCm)}</span> : order.widthCm > 0 && <span>{widthLabel(order.widthCm)}</span>}</div>
            <div className="dtf-order-deadline" data-late={overdue}><CalendarDays size={15} /><span>{overdue ? `Atrasado · ${due}` : due}{linkedDeadlines.get(order.id) && <small>Prazo DTF vinculado</small>}</span></div>
            <div className="dtf-order-money"><b>{displayMoney(dtfTotal(order))}</b><span>{dtfPending(order) > 0 ? `${displayMoney(dtfPending(order))} pendente` : dtfTotal(order) ? "Quitado" : "Sem cobrança"}</span></div>
            <div className="dtf-order-actions">
              <button className="dtf-open-ticket" type="button" aria-label={`Abrir ficha de ${title}`} onClick={() => setTicketId(order.id)}><Clipboard size={15} /> Ficha</button>
              {next && <button className="dtf-advance" type="button" disabled={!live || !!workingId} onClick={() => void run(order.id, () => onMove(order.id, next))}>{next === "Entregue" ? "Entregar" : "Avançar"} <ArrowRight size={14} /></button>}
              <button type="button" aria-label={`Editar DTF ${title}`} title="Editar pedido" disabled={!live || !!workingId} onClick={() => setEditor(order)}><Pencil size={16} /></button>
            </div>
            <DtfPrints order={order} prints={prints} customers={customers} links={links} live={live} onChange={onPrintChange} openNote={openNote} />
          </article>;
        })}
        {live && !visible.length && <div className="dtf-empty"><Printer size={29} /><h2>{scoped.length ? "Nenhum pedido com esses filtros" : "Nenhum pedido DTF por aqui"}</h2><p>{scoped.length ? "Altere a busca, o vínculo ou a etapa." : "Cadastre o primeiro pedido com um cliente vinculado ou como avulso."}</p>{!scoped.length && <button className="secondary" onClick={() => setEditor("new")}><Plus size={16} /> Novo pedido DTF</button>}</div>}
      </div>
    </section>
    {editor && <DtfEditor order={editor === "new" ? undefined : editor} customers={customers} links={links} customer={customer} displayMoney={displayMoney} onSave={onSave} onDelete={onDelete} close={() => setEditor(null)} />}
    {ticket && <DtfTicket order={{ ...ticket, dueDate: deadlineFor(ticket) }} customerName={nameFor(ticket)} close={() => setTicketId("")} />}
  </section>;
}

function DtfEditor({ order, customers, links, customer, displayMoney, onSave, onDelete, close }: Pick<Props, "customers" | "displayMoney" | "onSave" | "onDelete"> & { order?: DtfOrder; customer?: Customer; links: Map<string, DtfCustomerLink>; close: () => void }) {
  const [selectedId, setSelectedId] = useState(order?.customerId ?? customer?.id ?? "");
  const [photos, setPhotos] = useState(() => order ? dtfPhotos(order) : []);
  const [meters, setMeters] = useState(order?.lengthCm ? String(order.lengthCm / 100) : "");
  const [price, setPrice] = useState(order ? String(order.priceCents / 100) : "");
  const [paid, setPaid] = useState(order ? String(order.paidCents / 100) : "");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const linked = customers.find(item => item.id === selectedId);
  const clientLink = links.get(selectedId);
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
    setError("");
    setBusy(true);
    try {
      const input: DtfInput = {
        title: get("title"), customerId: selectedId, quantity: Number(get("quantity")),
        customerName: selectedId ? linked?.name ?? order?.customerName ?? "" : get("customerName"),
        phone: selectedId ? linked?.phone ?? order?.phone ?? "" : get("phone"),
        lengthCm, widthCm: Number(get("widthCm")), priceCents, paidCents, dueDate: get("dueDate"),
        stage: (get("stage") || "Aguardando arte") as DtfStage,
        artworkUrl: get("artworkUrl").replace(/^https?:/i, value => value.toLowerCase()), notes: get("notes"),
        ...packDtfPhotos(photos),
      };
      validateDtf(input);
      await onSave(input, order);
      close();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar o pedido."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!order || blocked || !window.confirm(`Excluir o pedido DTF “${dtfTitle(order)}”?`)) return;
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
        <p className="form-help">Preencha só o que tiver agora.</p>
        <DtfPhotoField photos={photos} setPhotos={setPhotos} onBusyChange={setPhotoBusy} />
        <label>Nome do pedido<input name="title" maxLength={160} placeholder="Ex.: Estampas para uniformes" defaultValue={order?.title} /></label>
        <div className="dtf-client-field"><label>Cliente vinculado<select value={selectedId} onChange={event => setSelectedId(event.target.value)}><option value="">Pedido avulso</option>{selectedId && !linked && <option value={selectedId}>{order?.customerName} (cadastro indisponível)</option>}{entries.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><DtfNamesLink noteId={clientLink?.noteId} /></div>
        {clientLink?.deadline && <p className="form-help">Prazo DTF: {dtfDate(clientLink.deadline)} · 7 dias antes da entrega.</p>}
        <label>Quantidade<input name="quantity" type="number" min="1" max="10000" step="1" placeholder="Opcional" defaultValue={order?.quantity || ""} /></label>
        <label>Observações<textarea name="notes" rows={3} maxLength={4000} placeholder="Detalhes para preparar e conferir a impressão" defaultValue={order?.notes} /></label>
      </fieldset>
      {order && <details className="dtf-editor-extra"><summary>Mais detalhes</summary><fieldset disabled={busy}>
        {!selectedId && <div className="form-row"><label>Nome avulso<input name="customerName" maxLength={120} defaultValue={order.customerName} /></label><label>Contato<input name="phone" type="tel" maxLength={40} defaultValue={order.phone} /></label></div>}
        <div className="form-row"><label>Etapa<select name="stage" defaultValue={order.stage}>{dtfStages.map(value => <option key={value}>{value}</option>)}</select></label><label>Prazo manual<input name="dueDate" type="date" max="9999-12-31" defaultValue={order.dueDate} /></label></div>
        <div className="form-row"><label>Metragem (m)<input type="number" min="0" max="10000" step="0.01" value={meters} onChange={event => setMeters(event.target.value)} /></label><label>Largura (cm)<input name="widthCm" type="number" min="0" max="300" step="0.01" defaultValue={order.widthCm || ""} /></label></div>
        <div className="form-row"><label>Preço por metro (R$)<input type="number" min="0" max="10000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} /></label><label>Valor recebido (R$)<input type="number" min="0" max="100000000" step="0.01" value={paid} onChange={event => setPaid(event.target.value)} /></label></div>
        <div className="dtf-estimate" aria-live="polite"><div><span>Total do pedido</span><strong>{displayMoney(total)}</strong></div><div><span>Pendente</span><strong>{displayMoney(Math.max(0, total - paidCents / 100))}</strong></div></div>
        <label>Link do arquivo<input name="artworkUrl" type="url" maxLength={2000} placeholder="https://…" defaultValue={order.artworkUrl} /></label>
      </fieldset></details>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer>{order && <button className="dtf-delete" type="button" disabled={blocked} onClick={() => void remove()}><Trash2 size={17} /> Excluir</button>}<button className="secondary" type="button" disabled={blocked} onClick={close}>Cancelar</button><button className="primary" type="submit" disabled={blocked}>{busy ? "Salvando…" : "Salvar pedido"}</button></footer>
    </form>
  </Modal>;
}

function DtfTicket({ order, customerName, close }: { order: DtfOrder; customerName: string; close: () => void }) {
  const [notice, setNotice] = useState("");
  const link = dtfArtworkLink(order.artworkUrl);
  const prints = readDtfPrints(order.printsData);
  const photos = dtfPhotos(order);
  const lines = [
    `Pedido #${dtfCode(order.id)}${order.title ? ` · ${order.title}` : ""}`, `Cliente: ${customerName}`, `Etapa: ${order.stage}`,
    ...(order.quantity ? [`Quantidade: ${order.quantity} un.`] : []),
    ...(order.dueDate ? [`Prazo DTF: ${dtfDate(order.dueDate)}`] : []),
    ...(order.lengthCm ? [`Impressão: ${meterLabel(order.lengthCm)} · ${widthLabel(order.widthCm)}`] : []),
    ...(order.phone ? [`Contato: ${order.phone}`] : []), ...(link ? [`Arte: ${link}`] : []), ...(order.notes ? [`\nObservações\n${order.notes}`] : []),
    ...(prints.length ? ["\nEstampas do metro", ...prints.map(print => `${print.separated ? "☑" : "☐"} ${print.title} · ${print.customerName || "Sem cliente"} · ${print.quantity} un.`)] : []),
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
    const photo = photos.map((source, index) => `<img alt="Referência ${index + 1}" src="${source}">`).join("");
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
      {photos.length > 0 && <div className="dtf-ticket-photos">{photos.map((photo, index) => <Image key={index} unoptimized width={440} height={280} src={photo} alt={photos.length === 1 ? "Referência da impressão" : `Referência da impressão ${index + 1}`} />)}</div>}
      <pre>{ticketText}</pre>
      {link && <a className="secondary" href={link} target="_blank" rel="noopener noreferrer"><Link2 size={16} /> Abrir arquivo da arte</a>}
      <div><button type="button" className="secondary" onClick={() => void copy()}><Clipboard size={16} /> Copiar ficha</button><button type="button" className="primary" onClick={print}><Printer size={16} /> Imprimir ficha</button></div>
      {notice && <p role="status">{notice}</p>}
    </div>
  </Modal>;
}
