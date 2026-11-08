import { productionPages, productionSummary, type ProductionChecklist, type ProductionRow } from "./production-checklist";

const productionStages = ["Corte", "Estampa", "Prensagem", "Embalagem"];

function groups(rows: ProductionRow[], key: "model" | "size") {
  const result = new Map<string, ProductionRow[]>();
  rows.forEach((row) => result.set(row[key], [...(result.get(row[key]) ?? []), row]));
  return [...result];
}

export default function ProductionSheets({ checklist, photoData }: { checklist: ProductionChecklist; photoData?: string }) {
  const pages = productionPages(checklist.rows);
  const summary = groups(checklist.rows, "model");
  const attention = [checklist.notes, ...checklist.warnings].filter(Boolean).join("\n");
  const inlineLimit = photoData ? 100 : 200;
  const extra = attention.length > inlineLimit || attention.split("\n").length > (photoData ? 1 : 2) ? attention.match(/[\s\S]{1,1200}/g) ?? [] : [];
  const totalPages = pages.length + extra.length;
  const header = <header className="production-sheet-header"><div><small>PSYZON · CONTROLE DE PRODUÇÃO</small><h1>LISTA DE CAMISAS</h1><p>{checklist.client || "Pedido"}{checklist.deadline ? ` · Entrega: ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${checklist.deadline}T12:00:00`))}` : ""}</p></div>{photoData && <figure className="production-product-photo"><img src={photoData} alt="Foto do produto" /><figcaption>Referência do produto</figcaption></figure>}<div><strong>{checklist.rows.length} UNIDADES</strong><small>Total do pedido</small></div></header>;
  const footer = (index: number) => <footer className="production-sheet-footer">
    <h2>RESUMO POR TAMANHO</h2>
    <div className="production-summary-models">{summary.map(([model, items]) => <section className="production-summary-model" key={model}>
      <h3><span>{model}</span><b>{items.length} un.</b></h3>
      <div className="production-summary-sizes">{productionSummary(items).map(item => <span key={item.size}><small>{item.size}</small><b>{item.quantity} un.</b></span>)}</div>
    </section>)}</div>
    <p>{checklist.rows.filter((row) => row.name === "Sem nome").length} peça(s) sem nome · {checklist.rows.length} peças no total <span>A4 · Página {index + 1} de {totalPages}</span></p>
  </footer>;
  return <>{pages.map((columns, pageIndex) => <article className="production-sheet" key={pageIndex}>
    {header}
    <div className="production-sheet-columns">{columns.map((rows, column) => <div key={column}>{groups(rows, "model").map(([model, items]) => <section className="production-group" key={model}>
      <h2><span>{model}</span><b>{items.length} un.</b></h2>
      {groups(items, "size").map(([size, pieces]) => <div className="production-size" key={size}>
        <h3><span>TAMANHO {size}</span><b>{pieces.length} un.</b></h3>
        <div className="production-piece-head"><span>Nome</span>{productionStages.map(stage => <span key={stage}>{stage}</span>)}</div>
        {pieces.map(row => <div className="production-piece" key={row.id}>
          <span>{row.name}</span>
          {productionStages.map(stage => <i key={stage} aria-label={`${stage} · ${row.name}`} />)}
        </div>)}
      </div>)}
    </section>)}</div>)}</div>
    {attention && !extra.length && <section className="production-attention"><h2>ATENÇÃO NA PRODUÇÃO</h2><p>{attention}</p></section>}
    <section className="production-additions" aria-label="Pedidos adicionais para preencher à mão">
      <h2>PEDIDOS ADICIONAIS</h2>
      <p>Preencha à mão os acréscimos recebidos após a impressão.</p>
      <table>
        <colgroup><col className="addition-date" /><col className="addition-name" /><col className="addition-model" /><col className="addition-size" /><col className="addition-quantity" /><col className="addition-price" /></colgroup>
        <thead><tr><th scope="col">Data</th><th scope="col">Nome na peça / pedido</th><th scope="col">Modelo</th><th scope="col">Tam.</th><th scope="col">Qtd.</th><th scope="col">Valor (R$)</th></tr></thead>
        <tbody>{Array.from({ length: 4 }, (_, index) => <tr key={index}>{Array.from({ length: 6 }, (_, cell) => <td key={cell} />)}</tr>)}</tbody>
      </table>
      <div className="production-additions-totals"><span>Peças extras nesta folha: <b /></span><span>Total atualizado do pedido: <b /></span></div>
    </section>
    {footer(pageIndex)}
  </article>)}{extra.map((text, index) => <article className="production-sheet" key={`notes-${index}`}>{header}<section className="production-attention"><h2>ATENÇÃO NA PRODUÇÃO · OBSERVAÇÕES E CONFERÊNCIA</h2><p>{text}</p></section>{footer(pages.length + index)}</article>)}</>;
}
