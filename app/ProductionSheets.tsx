import { productionCollarLabels, productionPages, productionSummary, type ProductionChecklist, type ProductionRow } from "./production-checklist";
import { productionSizeColor } from "./production-size-color";

const productionStages = ["Corte", "Estampa", "Prensagem", "Embalagem"];

function groups(rows: ProductionRow[], key: "model" | "size") {
  const result = new Map<string, ProductionRow[]>();
  rows.forEach((row) => result.set(row[key], [...(result.get(row[key]) ?? []), row]));
  return [...result];
}

export default function ProductionSheets({ checklist, photoData }: { checklist: ProductionChecklist; photoData?: string }) {
  const unnamedTotals = new Map<string, number>();
  const printedUnnamed = new Set<string>();
  const defaultCollar = checklist.defaultCollar;
  const defaultCollarLabel = defaultCollar && `${productionCollarLabels[defaultCollar]} como padrão`;
  const printPieces = defaultCollar ? checklist.rows.map(row => row.collar === defaultCollar ? { ...row, collar: undefined } : row) : checklist.rows;
  const unnamedKey = (row: ProductionRow) => JSON.stringify([row.model, row.size, row.collar]);
  const isUnnamed = (row: ProductionRow) => !row.name.trim() || row.name.trim().toLocaleLowerCase("pt-BR") === "sem nome";
  const collar = (row: ProductionRow) => row.collar && <small> · {productionCollarLabels[row.collar]}</small>;
  printPieces.filter(isUnnamed).forEach(row => { const key = unnamedKey(row); unnamedTotals.set(key, (unnamedTotals.get(key) ?? 0) + 1); });
  const printRows = printPieces.filter(row => {
    if (!isUnnamed(row)) return true;
    const key = unnamedKey(row);
    if (printedUnnamed.has(key)) return false;
    printedUnnamed.add(key); return true;
  });
  const pages = productionPages(printRows, 24);
  const sizesOnly = checklist.rows.every(isUnnamed);
  if (sizesOnly && pages.length === 1) {
    const models = groups(printRows, "model");
    const middle = Math.ceil(models.length / 2);
    pages[0] = [models.slice(0, middle).flatMap(([, rows]) => rows), models.slice(middle).flatMap(([, rows]) => rows)];
  }
  const summary = groups(checklist.rows, "model");
  const modelTotals = new Map(summary.map(([model, items]) => [model, items.length]));
  const sizeTotals = new Map(summary.flatMap(([model, items]) => productionSummary(items).map(item => [JSON.stringify([model, item.size]), item.quantity] as const)));
  const firstModel = new Map<string, string>();
  const firstSize = new Map<string, string>();
  pages.flat(2).forEach(row => { if (!firstModel.has(row.model)) firstModel.set(row.model, row.id); const key = JSON.stringify([row.model, row.size]); if (!firstSize.has(key)) firstSize.set(key, row.id); });
  const attention = [checklist.notes, ...checklist.warnings].filter(Boolean).join("\n");
  const inlineLimit = photoData && checklist.rows.length <= 20 ? 420 : 200;
  const extra = attention.length > inlineLimit || attention.split("\n").length > 8 ? attention.match(/[\s\S]{1,1200}/g) ?? [] : [];
  const totalPages = pages.length + extra.length;
  const showOpeningSummary = pages.length > 1 || checklist.rows.length >= 30;
  const showClosingSummary = totalPages > 1 || (!sizesOnly && !showOpeningSummary);
  const photoNotes = Boolean(photoData && attention && !extra.length);
  const total = <><strong>{checklist.rows.length} UNIDADES</strong><small>Total do pedido</small></>;
  const header = <header className="production-sheet-header">
    <div><small>PSYZON · CONTROLE DE PRODUÇÃO</small><h1>LISTA DE CAMISAS</h1><p>{checklist.client || "Pedido"}{checklist.deadline ? ` · Entrega: ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${checklist.deadline}T12:00:00`))}` : ""}{defaultCollarLabel && ` · ${defaultCollarLabel}`}</p>
      {photoData && <div className="production-inline-total">{total}</div>}
      {photoNotes && <section className="production-photo-notes"><h2>ATENÇÃO NA PRODUÇÃO</h2><p>{attention}</p></section>}
    </div>
    {photoData ? <figure className="production-product-photo"><img src={photoData} alt="Foto do produto" /><figcaption>Referência do produto</figcaption></figure> : <div className="production-sheet-total">{total}</div>}
  </header>;
  const sizeSummary = (opening = false) => <section className={opening ? "production-summary production-opening-summary" : "production-summary"}><h2>RESUMO POR TAMANHO</h2>
        <div className="production-summary-models">{summary.map(([model, items]) => <section className="production-summary-model" key={model}>
          <h3><span>{model}</span><b>{items.length} un.</b></h3>
          <div className="production-summary-sizes">{productionSummary(items).map(item => <span key={item.size} style={productionSizeColor(item.size)}><small>{item.size}</small><b>{item.quantity} un.</b></span>)}</div>
        </section>)}</div>
      </section>;
  const footer = (index: number) => <footer className="production-sheet-footer">
    {index === totalPages - 1 && <div className={`production-sheet-bottom${showClosingSummary ? "" : " production-additions-only"}`}>
      {showClosingSummary && sizeSummary()}
      <section className="production-additions" aria-label="Pedidos adicionais para preencher à mão">
        <h2>PEDIDOS ADICIONAIS</h2>
        <table><colgroup><col className="addition-name" /><col className="addition-model" /><col className="addition-size" /><col className="addition-quantity" /></colgroup>
          <thead><tr><th scope="col">Nome</th><th scope="col">Modelo</th><th scope="col">Tam.</th><th scope="col">Qtd.</th></tr></thead>
          <tbody>{Array.from({ length: 4 }, (_, index) => <tr key={index}>{Array.from({ length: 4 }, (_, cell) => <td key={cell}>{"\u00a0"}</td>)}</tr>)}</tbody>
        </table>
        <div className="production-additions-totals"><span>Extras: <b /></span><span>Total atualizado: <b /></span></div>
      </section>
    </div>}
    <p><span>{checklist.client && <b>{checklist.client} · </b>}{defaultCollarLabel && index > 0 && `${defaultCollarLabel} · `}{checklist.rows.filter(isUnnamed).length} peça(s) sem nome · {checklist.rows.length} peças no total</span><span className="production-page-number">Página {index + 1} de {totalPages}</span></p>
  </footer>;
  return <>{pages.map((columns, pageIndex) => <article className={`production-sheet${sizesOnly ? " production-sizes-only" : ""}`} key={pageIndex}>
    {pageIndex === 0 && header}
    {pageIndex === 0 && showOpeningSummary && sizeSummary(true)}
    {pageIndex === 0 && attention && !extra.length && !photoNotes && <section className="production-attention"><h2>ATENÇÃO NA PRODUÇÃO</h2><p>{attention}</p></section>}
    <div className="production-sheet-columns">{columns.map((rows, column) => <div key={column}>{groups(rows, "model").map(([model, items]) => <section className="production-group" key={model}>
      {firstModel.get(model) === items[0].id && <h2><span>{model}</span><b>{modelTotals.get(model)} un.</b></h2>}
      {groups(items, "size").map(([size, pieces]) => <div className="production-size" key={size} style={productionSizeColor(size)}>
        <h3><span>TAMANHO {size}{firstSize.get(JSON.stringify([model, size])) !== pieces[0].id && <small className="production-continuation"> · continuação</small>}</span><b>{sizeTotals.get(JSON.stringify([model, size]))} un.</b></h3>
        <div className="production-piece-head"><span>{pieces.some(row => !isUnnamed(row)) ? "Nome" : "Quantidade"}</span>{productionStages.map(stage => <span key={stage}>{stage}</span>)}</div>
        {pieces.filter(row => !isUnnamed(row)).map(row => <div className="production-piece" key={row.id}>
          <span>{row.name}{collar(row)}</span>
          {productionStages.map(stage => <i key={stage} aria-label={`${stage} · ${row.name}`} />)}
        </div>)}
        {pieces.filter(isUnnamed).map(row => <div className="production-piece production-size-checks" key={row.id}>
          <span>{unnamedTotals.get(unnamedKey(row))} un.{pieces.some(row => !isUnnamed(row)) ? " sem personalização de nome" : ""}{collar(row)}</span>
          {productionStages.map(stage => <i key={stage} aria-label={`${stage} · ${model} · Tamanho ${size} · ${unnamedTotals.get(unnamedKey(row))} un.`} />)}
        </div>)}
      </div>)}
    </section>)}</div>)}</div>
    {footer(pageIndex)}
  </article>)}{extra.map((text, index) => <article className="production-sheet" key={`notes-${index}`}><section className="production-attention"><h2>ATENÇÃO NA PRODUÇÃO · OBSERVAÇÕES E CONFERÊNCIA</h2><p>{text}</p></section>{footer(pages.length + index)}</article>)}</>;
}
