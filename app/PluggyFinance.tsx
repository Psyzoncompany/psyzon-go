"use client";

import type { User } from "firebase/auth";
import { AlertTriangle, ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Building2, Check, Link2, LoaderCircle, RefreshCw, Unlink, WalletCards } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const PluggyConnect = dynamic(() => import("react-pluggy-connect").then((module) => module.PluggyConnect), { ssr: false });

type PluggyItem = {
  id: string;
  connectorName?: string;
  status?: string;
  executionStatus?: string;
  needsReconnect?: boolean;
  errorMessage?: string | null;
  userActionInstructions?: string | null;
  lastUpdatedAt?: string | null;
  supportsPaymentInitiation?: boolean;
  supportsAutomaticPix?: boolean;
};

type PluggyAccount = {
  id: string;
  itemId?: string;
  name?: string;
  marketingName?: string | null;
  number?: string;
  type?: "BANK" | "CREDIT";
  subtype?: string;
  balance?: number;
  availableBalance?: number | null;
  currencyCode?: string;
};

type PluggyTransaction = {
  id: string;
  accountId?: string;
  description?: string;
  amount?: number;
  direction?: "CREDIT" | "DEBIT";
  kind?: "pix" | "transfer" | "income" | "expense";
  date?: string;
  category?: string | null;
  paymentMethod?: string | null;
  counterpartName?: string | null;
  status?: string;
  reconciliationStatus?: "matched" | "imported" | "ignored";
  matchedSystemTransactionId?: string;
  suggestion?: { id: string; description: string; transactionDate: string } | null;
};

type PluggyData = {
  configured: boolean;
  webhookConfigured: boolean;
  paymentsPrepared: boolean;
  paymentsEnabled: boolean;
  sync: { status?: string; lastSyncedAt?: number | null; lastError?: string | null; recordsChecked?: number };
  items: PluggyItem[];
  accounts: PluggyAccount[];
  transactions: PluggyTransaction[];
  reconciliation: { pending: number; matched: number };
};

type WidgetState = { accessToken: string; itemId?: string; includeSandbox: boolean } | null;
type Filter = "all" | "pending" | "pix" | "matched";

const privateHeaders = { Accept: "application/json", "Content-Type": "application/json" };

function dateLabel(value?: string | null) {
  if (!value) return "Ainda não sincronizada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function itemState(item: PluggyItem) {
  if (item.needsReconnect) return { label: "Reconexão necessária", tone: "danger" };
  if (["UPDATING", "WAITING_USER_INPUT", "WAITING_USER_ACTION"].includes(String(item.status)) || String(item.executionStatus).includes("IN_PROGRESS")) return { label: "Sincronizando", tone: "pending" };
  if (item.status === "DELETED") return { label: "Conta desconectada", tone: "danger" };
  return { label: "Conectada", tone: "connected" };
}

async function authenticatedFetch(user: User, path: string, init?: RequestInit) {
  const request = async (forceRefresh: boolean) => fetch(path, {
    ...init,
    headers: { ...privateHeaders, ...init?.headers, Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` },
  });
  let response = await request(false);
  if (response.status === 401) response = await request(true);
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível acessar a integração bancária.");
  return body;
}

export default function PluggyFinance({ user, displayMoney, notify }: { user: User; displayMoney: (value: number) => string; notify: (message: string) => void }) {
  const [data, setData] = useState<PluggyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [widget, setWidget] = useState<WidgetState>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [importAccount, setImportAccount] = useState<"business" | "personal">("business");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await authenticatedFetch(user, "/api/integrations/pluggy");
      setData(response as unknown as PluggyData);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível carregar suas contas bancárias.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!data?.items.some((item) => itemState(item).tone === "pending")) return;
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [data?.items, load]);
  useEffect(() => {
    if (!widget) return;
    document.documentElement.classList.add("pluggy-connect-visible");
    return () => document.documentElement.classList.remove("pluggy-connect-visible");
  }, [widget]);

  const openWidget = async (itemId?: string) => {
    setBusy(itemId ? `reconnect-${itemId}` : "connect");
    setError("");
    try {
      const response = await authenticatedFetch(user, "/api/integrations/pluggy/connect-token", { method: "POST", body: JSON.stringify(itemId ? { itemId } : {}) });
      setWidget({ accessToken: String(response.accessToken), itemId, includeSandbox: response.includeSandbox === true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível abrir a conexão bancária.");
    } finally {
      setBusy("");
    }
  };

  const registerItem = async (itemId: string) => {
    setWidget(null);
    setBusy("register");
    try {
      await authenticatedFetch(user, "/api/integrations/pluggy", { method: "POST", body: JSON.stringify({ action: "register", itemId }) });
      await load(true);
      notify("Conta bancária conectada e movimentações sincronizadas");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "A conta foi conectada, mas a sincronização ainda não terminou.");
      await load(true);
    } finally {
      setBusy("");
    }
  };

  const synchronize = async (itemId?: string) => {
    setBusy(itemId ? `sync-${itemId}` : "sync");
    setError("");
    try {
      await authenticatedFetch(user, "/api/integrations/pluggy", { method: "POST", body: JSON.stringify({ action: "sync", ...(itemId ? { itemId } : {}) }) });
      await load(true);
      notify("Dados bancários atualizados");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível sincronizar agora.");
    } finally {
      setBusy("");
    }
  };

  const reconcile = async (transaction: PluggyTransaction, action: "match" | "import" | "ignore" | "unlink") => {
    setBusy(`${action}-${transaction.id}`);
    setError("");
    try {
      await authenticatedFetch(user, "/api/integrations/pluggy/reconciliation", {
        method: "POST",
        body: JSON.stringify({
          action,
          bankTransactionId: transaction.id,
          systemTransactionId: action === "match" ? transaction.suggestion?.id : undefined,
          account: importAccount,
          category: transaction.kind === "pix" ? "Pix" : transaction.category ?? undefined,
        }),
      });
      await load(true);
      notify(action === "import" ? "Movimentação adicionada ao financeiro" : action === "match" ? "Movimentações conciliadas" : action === "ignore" ? "Movimentação ignorada na conciliação" : "Conciliação desfeita");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível concluir a conciliação.");
    } finally {
      setBusy("");
    }
  };

  const accountById = useMemo(() => new Map((data?.accounts ?? []).map((account) => [account.id, account])), [data?.accounts]);
  const transactions = useMemo(() => (data?.transactions ?? []).filter((transaction) => {
    if (filter === "pending") return !transaction.reconciliationStatus;
    if (filter === "pix") return transaction.kind === "pix";
    if (filter === "matched") return ["matched", "imported"].includes(String(transaction.reconciliationStatus));
    return true;
  }).slice(0, 120), [data?.transactions, filter]);
  const bankBalance = (data?.accounts ?? []).filter((account) => account.type === "BANK").reduce((sum, account) => sum + Number(account.balance ?? 0), 0);

  return <section className="panel pluggy-panel">
    <div className="pluggy-heading">
      <div className="pluggy-title"><span className="pluggy-logo"><Link2 size={18} /></span><div><span className="eyebrow">OPEN FINANCE · PLUGGY</span><h2>Contas e movimentações bancárias</h2><p>Saldo bancário separado do caixa contábil até a conciliação.</p></div></div>
      <div className="pluggy-heading-actions">
        {data?.items.length ? <button className="secondary" onClick={() => void synchronize()} disabled={Boolean(busy)}><RefreshCw size={15} className={busy === "sync" ? "spin" : ""} /> Sincronizar</button> : null}
        <button className="primary" onClick={() => void openWidget()} disabled={Boolean(busy) || data?.configured === false}><Building2 size={16} /> {busy === "connect" ? "Abrindo…" : "Conectar banco"}</button>
      </div>
    </div>

    {widget ? createPortal(<div className="pluggy-widget-portal">
      <PluggyConnect
        connectToken={widget.accessToken}
        updateItem={widget.itemId}
        includeSandbox={widget.includeSandbox}
        language="pt"
        theme={document.documentElement.dataset.theme === "dark" ? "dark" : "light"}
        products={["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS", "PAYMENT_DATA"]}
        allowFullscreen
        allowConnectInBackground
        onSuccess={({ item }) => void registerItem(item.id)}
        onError={({ message, data: errorData }) => {
          setWidget(null);
          setError(message || "A instituição não concluiu a conexão. Tente novamente.");
          if (errorData?.item?.id) void registerItem(errorData.item.id);
        }}
        onClose={() => setWidget(null)}
        onLoadError={() => { setWidget(null); setError("Não foi possível carregar o ambiente seguro da Pluggy."); }}
      />
    </div>, document.body) : null}

    {loading ? <div className="pluggy-state"><LoaderCircle className="spin" size={24} /><b>Carregando dados bancários</b><small>Consultando apenas o cache seguro do servidor.</small></div>
      : data?.configured === false ? <div className="pluggy-state warning"><AlertTriangle size={24} /><b>Pluggy ainda não configurada</b><small>Adicione PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET somente no ambiente do servidor.</small></div>
        : error && !data ? <div className="pluggy-state error"><AlertTriangle size={24} /><b>Não foi possível carregar a integração</b><small>{error}</small><button onClick={() => void load()}>Tentar novamente</button></div>
          : <>
            {error && <div className="pluggy-alert" role="alert"><AlertTriangle size={15} /><span>{error}</span><button onClick={() => setError("")} aria-label="Fechar aviso">×</button></div>}
            {busy === "register" && <div className="pluggy-alert info"><LoaderCircle className="spin" size={15} /><span>A instituição foi conectada. Estamos carregando contas, saldos e transações.</span></div>}
            {!data?.webhookConfigured && <div className="pluggy-alert info"><AlertTriangle size={15} /><span>Sincronização manual ativa. Configure PLUGGY_WEBHOOK_URL e PLUGGY_WEBHOOK_SECRET para atualizações automáticas.</span></div>}

            {(data?.items ?? []).map((item) => { const state = itemState(item); return <div className={`pluggy-item ${state.tone}`} key={item.id}><span className="pluggy-bank-icon"><Building2 size={18} /></span><div><b>{item.connectorName || "Instituição financeira"}</b><small>{state.label} · Última atualização: {dateLabel(item.lastUpdatedAt)}</small>{(item.errorMessage || item.userActionInstructions) && <em>{item.userActionInstructions || item.errorMessage}</em>}</div><span className={`pluggy-status ${state.tone}`}>{state.label}</span>{state.tone === "danger" ? <button className="secondary" onClick={() => void openWidget(item.id)} disabled={Boolean(busy)}>{busy === `reconnect-${item.id}` ? "Abrindo…" : "Reconectar"}</button> : <button className="icon-button" onClick={() => void synchronize(item.id)} disabled={Boolean(busy)} aria-label={`Sincronizar ${item.connectorName}`}><RefreshCw size={15} className={busy === `sync-${item.id}` ? "spin" : ""} /></button>}</div>; })}

            {!data?.items.length ? <div className="pluggy-state empty"><WalletCards size={25} /><b>Nenhuma conta bancária conectada</b><small>Use o ambiente seguro da Pluggy para autorizar sua instituição.</small><button onClick={() => void openWidget()}>Conectar primeira conta</button></div> : <>
              <div className="pluggy-account-summary"><div><small>Saldo em contas bancárias</small><strong>{displayMoney(bankBalance)}</strong><span>{data.accounts.filter((account) => account.type === "BANK").length} conta(s) bancária(s)</span></div><div><small>Conciliação</small><strong>{data.reconciliation.pending}</strong><span>movimentações aguardando análise</span></div><div><small>Pix e pagamentos</small><strong>{data.items.some((item) => item.supportsPaymentInitiation || item.supportsAutomaticPix) ? "Compatível" : "Preparado"}</strong><span>{data.paymentsEnabled ? "Recursos habilitados" : "Ativação server-side necessária"}</span></div></div>
              <div className="pluggy-accounts">{data.accounts.map((account) => <article key={account.id}><span><Building2 size={15} /></span><div><b>{account.marketingName || account.name || "Conta"}</b><small>{account.type === "CREDIT" ? "Cartão de crédito" : "Conta bancária"}{account.number ? ` · ${account.number}` : ""}</small></div><strong>{displayMoney(Number(account.balance ?? 0))}</strong></article>)}</div>
              <div className="pluggy-transactions-head"><div><span className="eyebrow">CONCILIAÇÃO</span><h3>Movimentações bancárias</h3></div><div className="pluggy-controls"><label>Importar em <select value={importAccount} onChange={(event) => setImportAccount(event.target.value as "business" | "personal")}><option value="business">Empresa</option><option value="personal">Pessoal</option></select></label><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="Filtrar movimentações bancárias"><option value="all">Todas</option><option value="pending">Pendentes</option><option value="pix">Pix</option><option value="matched">Conciliadas</option></select></div></div>
              <div className="pluggy-transaction-list">{transactions.length ? transactions.map((transaction) => {
                const incoming = transaction.direction === "CREDIT";
                const account = accountById.get(transaction.accountId ?? "");
                const transactionBusy = busy.endsWith(transaction.id);
                return <article className="pluggy-transaction" key={transaction.id}><span className={incoming ? "incoming" : "outgoing"}>{transaction.kind === "transfer" ? <ArrowRightLeft size={15} /> : incoming ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div className="pluggy-transaction-info"><b>{transaction.description || "Movimentação bancária"}</b><small>{dateLabel(transaction.date)} · {transaction.kind === "pix" ? "Pix" : transaction.kind === "transfer" ? "Transferência" : incoming ? "Entrada" : "Saída"} · {account?.marketingName || account?.name || "Conta"}</small>{transaction.counterpartName && <em>{incoming ? "De" : "Para"}: {transaction.counterpartName}</em>}{transaction.status === "PENDING" && <em>Movimentação pendente na instituição</em>}{transaction.suggestion && !transaction.reconciliationStatus && <em className="suggestion">Possível correspondência: {transaction.suggestion.description}</em>}</div><strong className={incoming ? "positive" : "negative"}>{incoming ? "+ " : "− "}{displayMoney(Number(transaction.amount ?? 0))}</strong><div className="pluggy-reconcile-actions">{transaction.reconciliationStatus ? <><span className={`reconciliation-badge ${transaction.reconciliationStatus}`}><Check size={12} /> {transaction.reconciliationStatus === "imported" ? "Importada" : transaction.reconciliationStatus === "matched" ? "Conciliada" : "Ignorada"}</span><button className="icon-button" onClick={() => void reconcile(transaction, "unlink")} disabled={transactionBusy} aria-label="Desfazer conciliação"><Unlink size={14} /></button></> : <>{transaction.suggestion && <button className="secondary compact-button" onClick={() => void reconcile(transaction, "match")} disabled={transactionBusy}><Link2 size={13} /> Conciliar</button>}<button className="secondary compact-button" onClick={() => void reconcile(transaction, "import")} disabled={transactionBusy || transaction.status === "PENDING"}>{transactionBusy ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />} {transaction.status === "PENDING" ? "Pendente" : "Importar"}</button><button className="text-button" onClick={() => void reconcile(transaction, "ignore")} disabled={transactionBusy}>Ignorar</button></>}</div></article>;
              }) : <div className="pluggy-state empty compact"><ArrowRightLeft size={23} /><b>Nenhuma movimentação neste filtro</b><small>Novos dados aparecerão depois da sincronização bancária.</small></div>}</div>
            </>}
          </>}
  </section>;
}
