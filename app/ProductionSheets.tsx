import { productionPages, productionSummary, type ProductionChecklist, type ProductionRow } from "./production-checklist";

function groups(rows: ProductionRow[], key: "model" | "size") {
  const result = new Map<string, ProductionRow[]>();
  rows.forEach((row) => result.set(row[key], [...(result.get(row[key]) ?? []), row]));
  return [...result];
}

export default function ProductionSheets({ checklist }: { checklist: ProductionChecklist }) {
  const pages = productionPages(checklist.rows);
  const summary = productionSummary(checklist.rows);
  const attention = [checklist.notes, ...checklist.warnings].filter(Boolean).join("\n");
  const extra = attention.length > 200 ? attention.match(/[\s\S]{1,1200}/g) ?? [] : [];
  const totalPages = pages.length + extra.length;
  const header = <header className="production-sheet-header"><div><small>PSYZON · CONTROLE DE PRODUÇÃO</small><h1>LISTA DE CAMISAS</h1><p>{checklist.client || "Pedido"}{checklist.deadline ? ` · Entrega: ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${checklist.deadline}T12:00:00`))}` : ""}</p></div><div><strong>{checklist.rows.length} UNIDADES</strong><small>Total do pedido</small></div></header>;
  const footer = (index: number) => <footer className="production-sheet-footer"><h2>RESUMO POR TAMANHO</h2><div>{summary.map((item) => <span key={item.size}><small>{item.size}</small><b>{item.quantity} un.</b></span>)}</div><p>{checklist.rows.filter((row) => row.name === "Sem nome").length} peça(s) sem nome · {checklist.rows.length} peças no total <span>A4 · Página {index + 1} de {totalPages}</span></p></footer>;
  return <>{pages.map((columns, pageIndex) => <article className="production-sheet" key={pageIndex}>{header}<div className="production-stages">{["Corte", "Costura", "Estampa", "Conferência", "Embalagem"].map((stage) => <span key={stage}><i /> {stage}</span>)}</div><div className="production-sheet-columns">{columns.map((rows, column) => <div key={column}>{groups(rows, "model").map(([model, items]) => <section className="production-group" key={model}><h2><span>{model}</span><b>{items.length} un.</b></h2>{groups(items, "size").map(([size, pieces]) => <div className="production-size" key={size}><h3><span>TAMANHO {size}</span><b>{pieces.length} un.</b></h3>{pieces.map((row) => <div className="production-piece" key={row.id}><i>{row.done ? "✓" : ""}</i><span>{row.name}</span></div>)}</div>)}</section>)}</div>)}</div>{attention && !extra.length && <section className="production-attention"><h2>ATENÇÃO NA PRODUÇÃO</h2><p>{attention}</p></section>}{footer(pageIndex)}</article>)}{extra.map((text, index) => <article className="production-sheet" key={`notes-${index}`}>{header}<section className="production-attention"><h2>ATENÇÃO NA PRODUÇÃO · OBSERVAÇÕES E CONFERÊNCIA</h2><p>{text}</p></section>{footer(pages.length + index)}</article>)}</>;
}
