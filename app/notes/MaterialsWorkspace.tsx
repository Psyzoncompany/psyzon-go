"use client";
import { CountUp } from "../MotionValue";

import { ArrowLeft, ArrowUpRight, Clipboard, Download, Layers, PackageCheck, Printer, Search } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { currency, decimal, type NoteMaterial } from "../notes-model";
import MaterialEntryDialog from "./MaterialEntryDialog";
import type { MaterialTarget, MaterialProductionOrder, MaterialCustomer, MaterialSaveInput } from "./material-binding";
import { Plus, Link2 } from "lucide-react";
import { customerNameKey, localDateValue } from "../finance-model";
import NoteDialog from "./NoteDialog";
import PdfDownloadButton from "../PdfDownloadButton";
import { fabricShoppingList, groupMaterialLines, materialLines, materialQuantity, materialsCsv, materialsText, materialTotals, splitMaterialOrders, type MaterialLine, type MaterialOrder } from "./materials-model";
import "./materials.css";
import PurchaseCostReview, { type PurchaseCostInput, type LinkedExpense } from "./PurchaseCostReview";

type Props = {
  uid: string;
  expenses: LinkedExpense[];
  reviewPurchase: (input: PurchaseCostInput) => Promise<void>;
  targets: MaterialTarget[];
  productionOrders: MaterialProductionOrder[];
  customers: MaterialCustomer[];
  saveMaterial: (input: MaterialSaveInput) => Promise<void>;
  orders: MaterialOrder[];
  back: () => void;
  openNote: (id: string) => void;
  complete: (id: string, materialIds: string[], completed: boolean) => Promise<void>;
};

export default function MaterialsWorkspace({ uid, targets, productionOrders, customers, saveMaterial, orders, back, openNote, complete, expenses, reviewPurchase }: Props) {
  const [entry,setEntry] = useState<{ id?: string; bindingOnly?: boolean; material?: NoteMaterial } | null>(null);
  const [completed, setCompleted] = useState(false);
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [review, setReview] = useState<{ order: MaterialOrder; material: NoteMaterial }>();
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const pending = splitMaterialOrders(orders, false);
  const finished = splitMaterialOrders(orders, true);
  const current = completed ? finished : pending;
  const suppliers = [...new Set(current.flatMap(order => order.materials.map(item => item.supplier)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const selectedSupplier = suppliers.includes(supplier) ? supplier : "";
  const search = customerNameKey(query);
  const filtered = current.filter(order => (!selectedSupplier || order.materials.some(item => item.supplier === selectedSupplier)) && (!search || customerNameKey([order.title, order.client, ...order.materials.flatMap(item => [item.supplier, item.fabricType, item.color, item.collarColor ?? ""])].join(" ")).includes(search))).map(order => ({ ...order, materials: selectedSupplier ? order.materials.filter(material => material.supplier === selectedSupplier) : order.materials }));
  const allLines = filtered.flatMap(materialLines);
  const totals = materialTotals(filtered.flatMap(materialLines));
  const actualTotal = (items: NoteMaterial[]) => items.reduce((sum, item) => sum + (item.actualCost === undefined ? 0 : item.actualCost + (item.purchaseFreight ?? 0)), 0);
  const unreviewed = filtered.flatMap(order => order.materials).filter(item => item.actualCost === undefined).length;
  const shopping = shoppingOpen ? fabricShoppingList(orders, productionOrders) : [];

  function show(next: boolean) {
    setCompleted(next);
    setSupplier("");
    setFeedback(undefined);
  }

  async function change(order: MaterialOrder) {
    if (busy) return;
    setBusy(order.id);
    setFeedback(undefined);
    try {
      await complete(order.id, order.materials.map(item => item.id), !completed);
      setFeedback({ text: completed ? "Pedido devolvido aos pendentes." : "Pedido marcado como concluído." });
    } catch (cause) {
      setFeedback({ text: cause instanceof Error ? cause.message : "Não foi possível atualizar o pedido.", error: true });
    } finally { setBusy(""); }
  }

  return <section className="materials-workspace">
    <button type="button" className="materials-back" onClick={back}><ArrowLeft size={16} /> Bloco de notas</button>
    <header className="materials-heading">
      <div><h1>Materiais</h1></div>
      <div className="materials-heading-actions"><button type="button" className="primary" onClick={() => setEntry({})}><Plus size={17} /> Adicionar materiais</button><button type="button" className="secondary" onClick={() => setShoppingOpen(true)}><Clipboard size={17} /> Compras por fornecedor</button><button type="button" className="secondary" disabled={!allLines.length} onClick={() => setExportOpen(true)}><Download size={17} /> Exportar materiais</button></div>
    </header>
    <div className="materials-totals" aria-label="Resumo dos pedidos exibidos">
      <article><small>Pedidos na lista</small><strong><CountUp value={filtered.length} /></strong><span>{completed ? "Concluídos" : "Pendentes de compra"}</span></article>
      <article><small>Quantidade total</small><strong><CountUp value={totals.kg} format={decimal} /> kg</strong><span>{totals.sets} conjuntos de gola e punho</span></article>
      <article><small>{completed ? "Custo real conferido" : "Valor estimado"}</small><strong><CountUp value={completed ? actualTotal(filtered.flatMap(order => order.materials)) : totals.cost} format={currency} /></strong><span>{completed && unreviewed ? `${unreviewed} compra(s) a conferir` : "Materiais dos pedidos exibidos"}</span></article>
    </div>
    <div className="materials-toolbar">
      <div className="materials-tabs" aria-label="Situação da compra">
        <button type="button" aria-pressed={!completed} disabled={!!busy} onClick={() => show(false)}>Pendentes <span>{pending.length}</span></button>
        <button type="button" aria-pressed={completed} disabled={!!busy} onClick={() => show(true)}>Concluídos <span>{finished.length}</span></button>
      </div>
      <label className="materials-search"><Search size={16} /><input type="search" aria-label="Buscar pedidos de materiais" placeholder="Buscar pedido, cliente ou material" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="Filtrar pedidos por fornecedor" value={selectedSupplier} onChange={event => setSupplier(event.target.value)}><option value="">Todos os fornecedores</option>{suppliers.map(name => <option key={name}>{name}</option>)}</select>
    </div>
    {feedback && <p className={feedback.error ? "form-error" : "materials-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    <div className="materials-orders">
      {filtered.map(order => {
        const lines = materialLines(order);
        return <article className="materials-order" key={order.id}>
          <header><div><h2>{order.title}</h2>{order.client && <p>{order.client}</p>}</div><strong>{completed ? order.materials.some(item => item.actualCost === undefined) ? "Custo a conferir" : currency(actualTotal(order.materials)) : currency(materialTotals(lines).cost)}</strong><button className="materials-note-link" type="button" aria-label={`Abrir anotação ${order.title}`} onClick={() => openNote(order.id)}><ArrowUpRight size={16} /></button></header>
          {!completed && order.purchaseDueDate && <p className="materials-purchase-deadline" data-overdue={order.purchaseDueDate < localDateValue()}>Comprar até {order.purchaseDueDate.split("-").reverse().join("/")}</p>}
          <MaterialTable lines={lines} prices={!completed} />
          {completed && <div className="materials-order-actions">{order.materials.map(material => <button className="secondary" key={material.id} onClick={() => setReview({ order, material })}>{material.actualCost === undefined ? "Conferir custo" : "Editar custo real"} · {material.fabricType} · {material.color}{material.actualCost === undefined ? "" : " · " + currency(material.actualCost + (material.purchaseFreight ?? 0))}</button>)}</div>}
          {completed && (order.extraFabricKg ?? 0) > 0 && <p className="materials-extra-forecast">Previsão adicional de malha · {decimal(order.extraFabricKg ?? 0)} kg</p>}
          <footer><div className="materials-order-actions"><button type="button" className="secondary" onClick={() => setEntry({id:order.id})}><Plus size={14} /> Adicionar material</button><button type="button" className="secondary" onClick={() => setEntry({id:order.id,bindingOnly:true})}><Link2 size={14} /> Vincular pedido / cliente</button><label><input type="checkbox" checked={completed} disabled={!!busy} onChange={() => void change(order)} aria-label={`${completed ? "Reabrir" : "Concluir"} pedido ${order.title}`} />{busy === order.id ? "Salvando…" : completed ? "Reabrir pedido" : "Concluir pedido"}</label></div>{!completed && <div className="materials-item-edit">{order.materials.map(material => <button key={material.id} onClick={() => setEntry({id:order.id,material})}>Editar {material.fabricType} · {material.color}</button>)}</div>}</footer>
        </article>;
      })}
      {!filtered.length && <div className="materials-empty"><PackageCheck size={29} /><h2>{current.length ? "Nenhum pedido encontrado" : completed ? "Nenhum pedido concluído" : "Nenhum pedido pendente"}</h2><p>{current.length ? "Experimente outra busca ou fornecedor." : completed ? "Os pedidos marcados com check aparecem aqui." : "Use Adicionar materiais para começar o planejamento de compras."}</p></div>}
    </div>
    {review && <PurchaseCostReview noteId={review.order.id} orderId={review.order.productionOrderId} material={review.material} expenses={expenses} save={reviewPurchase} close={() => setReview(undefined)} />}
    {entry && <MaterialEntryDialog uid={uid} targets={targets} orders={productionOrders} customers={customers} initialId={entry.id} material={entry.material} bindingOnly={entry.bindingOnly} save={saveMaterial} close={() => setEntry(null)} />}
    {exportOpen && <MaterialsExport lines={allLines} title={completed ? "Planejamento dos materiais concluídos" : "Materiais pendentes"} close={() => setExportOpen(false)} />}
    {shoppingOpen && <NoteDialog title="Compras por fornecedor" close={() => setShoppingOpen(false)} wide>
      <div className="materials-shopping">
        {shopping.length ? <>
          <p><strong>{decimal(shopping.reduce((sum, group) => sum + group.kg, 0))} kg</strong> de malha pendente</p>
          {shopping.map(group => <article className="materials-order" key={JSON.stringify([group.supplier, group.fabric, group.color])}>
            <header><div><h2>{group.supplier}</h2><p>{group.fabric} · {group.color}</p></div><strong>{decimal(group.kg)} kg</strong></header>
            <ul>{[...group.orders].map(([id, order]) => <li key={id}>
              <button type="button" className="materials-note-link" onClick={() => { setShoppingOpen(false); openNote(order.noteId); }}>{order.label}</button>
              <span>{decimal(order.kg)} kg</span>
            </li>)}</ul>
          </article>)}
        </> : <p>Nenhuma compra de malha pendente para pedidos confirmados em andamento.</p>}
      </div>
    </NoteDialog>}
  </section>;
}

function MaterialTable({ lines, prices, report = false }: { lines: MaterialLine[]; prices: boolean; report?: boolean }) {
  return <table className="materials-table">
    <thead><tr>{report && <th scope="col">Pedido</th>}<th scope="col">Material</th><th scope="col">Quantidade</th>{prices && <><th scope="col">Valor unitário</th><th scope="col">Subtotal</th></>}</tr></thead>
    <tbody>{lines.map((line, index) => <tr key={index}>
      {report && <td>{line.order}{line.client && <small>{line.client}</small>}</td>}
      <td><b>{line.material}</b><small>{line.color}{!report && ` · ${line.supplier}`}</small></td>
      <td data-label="Quantidade">{materialQuantity(line)}</td>
      {prices && <><td data-label="Valor unitário">{currency(line.price)}/{line.unit}</td><td data-label="Subtotal"><b>{currency(line.cost)}</b></td></>}
    </tr>)}</tbody>
  </table>;
}

function MaterialsExport({ lines, title, close }: { lines: MaterialLine[]; title: string; close: () => void }) {
  const [prices, setPrices] = useState(true);
  const [supplier, setSupplier] = useState("");
  const [notice, setNotice] = useState("");
  const selected = supplier ? lines.filter(line => line.supplier === supplier) : lines;
  const groups = groupMaterialLines(selected);
  const text = materialsText(selected, title, prices);
  const totals = materialTotals(selected);

  function download() {
    const url = URL.createObjectURL(new Blob([materialsCsv(selected, prices)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "materiais-psyzon.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(text); setNotice("Lista copiada."); }
    catch { setNotice("Selecione o texto da prévia para copiar."); }
  }

  return <NoteDialog title="Exportar materiais" close={close} wide>
    <div className="materials-export-options"><label>Fornecedor<select value={supplier} onChange={event => setSupplier(event.target.value)}><option value="">Todos os fornecedores</option>{groupMaterialLines(lines).map(([name]) => <option key={name}>{name}</option>)}</select></label><label><input type="checkbox" checked={prices} onChange={event => setPrices(event.target.checked)} /> Incluir valores</label><p>{selected.length} linhas de material · {decimal(totals.kg)} kg{totals.sets ? ` · ${totals.sets} conj.` : ""}</p></div>
    <textarea className="materials-export-preview" aria-label="Prévia da exportação de materiais" value={text} readOnly />
    <footer className="materials-export-actions"><button className="secondary" type="button" onClick={() => void copy()}><Clipboard size={16} /> Copiar lista</button><button className="secondary" type="button" onClick={download}><Download size={16} /> Baixar CSV</button><PdfDownloadButton disabled={!selected.length} report={{
      title, filename: "materiais-psyzon", subtitle: "Lista de compras",
      sections: groups.map(([name, items]) => ({
        title: prices ? `${name} · ${currency(materialTotals(items).cost)}` : name,
        columns: ["Pedido", "Material", "Quantidade", ...(prices ? ["Valor unitário", "Subtotal"] : [])],
        rows: items.map(line => [[line.order, line.client].filter(Boolean).join("\n"), [line.material, line.color].filter(Boolean).join("\n"), materialQuantity(line), ...(prices ? [`${currency(line.price)}/${line.unit}`, currency(line.cost)] : [])]),
      })),
      footer: `${decimal(totals.kg)} kg${totals.sets ? ` · ${totals.sets} conj.` : ""}${prices ? ` · Total geral: ${currency(totals.cost)}` : ""}`,
    }} /><button className="primary" type="button" onClick={() => window.print()}><Printer size={16} /> Imprimir</button></footer>
    {notice && <p className="materials-feedback" role="status">{notice}</p>}
    {typeof document !== "undefined" && createPortal(<div className="materials-report" aria-hidden="true"><header><Layers size={20} /><div><h1>{title}</h1><p>PSYZON GO · Lista de compras</p></div></header>{groups.map(([name, items]) => <section key={name}><h2>{name}</h2><MaterialTable lines={items} prices={prices} report />{prices && <p>Subtotal · <b>{currency(materialTotals(items).cost)}</b></p>}</section>)}<footer>{decimal(totals.kg)} kg{totals.sets ? ` · ${totals.sets} conj.` : ""}{prices && <strong>Total geral · {currency(totals.cost)}</strong>}</footer></div>, document.body)}
  </NoteDialog>;
}
