"use client";

import {
  browserLocalPersistence,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import {
  Bell,
  Boxes,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  CalendarClock,
  Clock3,
  Eye,
  EyeOff,
  Home,
  LayoutGrid,
  List,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Plus,
  LogOut,
  RotateCcw,
  Search,
  Settings,
  Sun,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "inicio" | "producao" | "clientes" | "financeiro" | "pessoal" | "mais";
type CreateKind = "pedido" | "cliente" | "entrada" | "despesa" | "transferencia" | "conta";
type AccountType = "business" | "personal";
type OrderStatus =
  | "Orçamento"
  | "Aprovado"
  | "Aguardando material"
  | "Produção"
  | "Finalização"
  | "Pronto"
  | "Entregue";

type Order = {
  id: string;
  customer: string;
  phone?: string;
  product: string;
  quantity: number;
  total: number;
  paid: number;
  dueDate: string;
  status: OrderStatus;
  createdAt?: unknown;
};

type Customer = { id: string; name: string; phone: string; company?: string };
type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account: "business" | "personal";
  createdAt?: unknown;
};
type Bill = {
  id: string;
  description: string;
  amount: number;
  account: AccountType;
  billingType: "fixed" | "installment";
  dueDay: number;
  category: string;
  totalInstallments?: number;
  paidInstallments?: number;
  lastPaidMonth?: string;
  createdAt?: unknown;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isFirebaseConfigured = [firebaseConfig.apiKey, firebaseConfig.authDomain, firebaseConfig.projectId, firebaseConfig.databaseURL, firebaseConfig.appId].every(Boolean);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function isoOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const statusProgress: Record<OrderStatus, number> = {
  Orçamento: 8,
  Aprovado: 20,
  "Aguardando material": 35,
  Produção: 65,
  Finalização: 82,
  Pronto: 100,
  Entregue: 100,
};

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "producao", label: "Produção", icon: Boxes },
  { id: "clientes", label: "Clientes", icon: UsersRound },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
  { id: "pessoal", label: "Pessoal", icon: UserRound },
  { id: "mais", label: "Mais", icon: MoreHorizontal },
];

const mobileNavItems = navItems.filter((item) => ["inicio", "producao", "pessoal", "mais"].includes(item.id));

function dueLabel(dateString: string, status: OrderStatus) {
  if (status === "Entregue") return "Entregue";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `ATRASADO ${Math.abs(days)} ${Math.abs(days) === 1 ? "DIA" : "DIAS"}`;
  if (days === 0) return "Entrega hoje";
  if (days === 1) return "Entrega amanhã";
  return `Entrega em ${days} dias`;
}

function dueTone(dateString: string, status: OrderStatus) {
  const label = dueLabel(dateString, status);
  if (label.startsWith("ATRASADO")) return "danger";
  if (label === "Entrega hoje" || label === "Entrega amanhã") return "warning";
  return "normal";
}

export default function HomePage() {
  const [view, setView] = useState<View>("inicio");
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [firebaseState, setFirebaseState] = useState<"connecting" | "live" | "error" | "unconfigured">("connecting");
  const [uid, setUid] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [dark, setDark] = useState(false);
  const [privateValues, setPrivateValues] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<CreateKind | null>(null);
  const [modalAccount, setModalAccount] = useState<AccountType>("business");
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem("psy-theme");
    setDark(storedTheme === "dark");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    if (!isFirebaseConfigured) {
      setFirebaseState("unconfigured");
      setAuthReady(true);
      return;
    }

    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    let unsubscribeData: (() => void) | undefined;
    setPersistence(auth, browserLocalPersistence).catch(() => undefined);

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeData?.();
      setUser(nextUser);
      setUid(nextUser?.uid ?? "");
      setAuthReady(true);
      setAuthError("");

      if (!nextUser) {
        setOrders([]);
        setCustomers([]);
        setTransactions([]);
        setBills([]);
        setFirebaseState("connecting");
        return;
      }

      const db = getDatabase(app);
      setFirebaseState("connecting");
      unsubscribeData = onValue(ref(db, `users/${nextUser.uid}`), (snapshot) => {
        const value = snapshot.val() ?? {};
        const toList = <T extends { id: string }>(record?: Record<string, Omit<T, "id">>) =>
          Object.entries(record ?? {}).map(([id, item]) => ({ id, ...item } as T));
        setOrders(toList<Order>(value.orders).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
        setCustomers(toList<Customer>(value.customers));
        setTransactions(toList<Transaction>(value.transactions).sort((a, b) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0)));
        setBills(toList<Bill>(value.bills).sort((a, b) => a.dueDay - b.dueDay));
        setFirebaseState("live");
      }, (error) => {
        console.error("Firebase connection failed", error);
        setFirebaseState("error");
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeData?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("psy-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("input, textarea, select")) {
        if (event.key === "Escape") setModal(null);
        return;
      }
      if (event.key === "n") setModal("pedido");
      if (event.key === "c") setView("clientes");
      if (event.key === "f") setView("financeiro");
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const openCreate = (kind: CreateKind, account: AccountType = "business") => {
    setModalAccount(account);
    setModal(kind);
  };

  const signInGoogle = async () => {
    if (!isFirebaseConfigured) return;
    setAuthError("");
    try {
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Google sign-in failed", error);
      setAuthError("Não foi possível entrar. Verifique se o Google está habilitado no Firebase.");
    }
  };

  const signOutGoogle = async () => {
    if (!isFirebaseConfigured) return;
    await signOut(getAuth(getApps()[0]));
    setView("inicio");
  };

  const resetAllData = async () => {
    if (!uid || !window.confirm("Apagar definitivamente todos os pedidos, clientes, contas e movimentações desta conta?")) return;
    setResetting(true);
    try {
      await remove(ref(getDatabase(getApps()[0]), `users/${uid}`));
      setOrders([]);
      setCustomers([]);
      setTransactions([]);
      setBills([]);
      showToast("Todos os dados foram removidos");
    } catch (error) {
      console.error("Reset failed", error);
      showToast("Não foi possível resetar os dados");
    } finally {
      setResetting(false);
    }
  };

  const derivedCustomers = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((item) => map.set(item.name, item));
    orders.forEach((order) => {
      if (!map.has(order.customer)) map.set(order.customer, { id: order.customer, name: order.customer, phone: order.phone ?? "" });
    });
    return [...map.values()];
  }, [customers, orders]);

  const businessIncome = transactions.filter((t) => t.account === "business" && t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const businessExpense = transactions.filter((t) => t.account === "business" && t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const businessTransfers = transactions.filter((t) => t.type === "transfer").reduce((sum, t) => sum + t.amount, 0);
  const personalIncome = transactions.filter((t) => t.account === "personal" && t.type !== "expense").reduce((sum, t) => sum + t.amount, 0);
  const personalExpense = transactions.filter((t) => t.account === "personal" && t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const pending = orders.reduce((sum, order) => sum + Math.max(0, order.total - order.paid), 0);
  const businessBalance = businessIncome - businessExpense - businessTransfers;
  const personalBalance = personalIncome - personalExpense;
  const businessTransactions = transactions.filter((transaction) => transaction.account === "business" || transaction.type === "transfer");
  const personalTransactions = transactions.filter((transaction) => transaction.account === "personal");
  const activeOrders = orders.filter((order) => order.status !== "Entregue");
  const overdue = activeOrders.filter((order) => dueTone(order.dueDate, order.status) === "danger");
  const urgent = activeOrders.filter((order) => ["danger", "warning"].includes(dueTone(order.dueDate, order.status)));

  const searchResults = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("pt-BR");
    if (!value) return [];
    return orders.filter((order) => [order.customer, order.product, order.id, order.phone, String(order.total)].some((field) => field?.toLocaleLowerCase("pt-BR").includes(value))).slice(0, 5);
  }, [orders, search]);

  const displayMoney = (value: number) => (privateValues ? "R$ ••••••" : money.format(value));

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = modal;
    if (!kind) return;

    try {
      if (kind === "pedido") {
        const nextOrder: Omit<Order, "id"> = {
          customer: String(form.get("customer")),
          phone: String(form.get("phone") || ""),
          product: String(form.get("product")),
          quantity: Number(form.get("quantity")),
          total: Number(form.get("total")),
          paid: Number(form.get("paid")),
          dueDate: String(form.get("dueDate")),
          status: "Aprovado",
          createdAt: serverTimestamp(),
        };
        if (firebaseState !== "live" || !uid) throw new Error("Firebase ainda não está conectado");
        const db = getDatabase(getApps()[0]);
        const orderKey = push(ref(db, `users/${uid}/orders`)).key;
        if (!orderKey) throw new Error("Não foi possível gerar o pedido");
        const customerKey = nextOrder.customer.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || orderKey;
        const updates: Record<string, unknown> = {
          [`users/${uid}/orders/${orderKey}`]: nextOrder,
          [`users/${uid}/customers/${customerKey}`]: { name: nextOrder.customer, phone: nextOrder.phone ?? "" },
        };
        if (nextOrder.paid > 0) {
          const transactionKey = push(ref(db, `users/${uid}/transactions`)).key;
          if (transactionKey) updates[`users/${uid}/transactions/${transactionKey}`] = { description: `Entrada · ${nextOrder.customer} · #${orderKey.slice(0, 5).toUpperCase()}`, amount: nextOrder.paid, type: "income", account: "business", orderId: orderKey, createdAt: serverTimestamp() };
        }
        await update(ref(db), updates);
        showToast("Pedido criado e financeiro atualizado");
      } else if (kind === "cliente") {
        const customer = { name: String(form.get("name")), phone: String(form.get("phone")), company: String(form.get("company") || "") };
        if (firebaseState !== "live" || !uid) throw new Error("Firebase ainda não está conectado");
        await set(push(ref(getDatabase(getApps()[0]), `users/${uid}/customers`)), customer);
        showToast("Cliente adicionado");
      } else if (kind === "conta") {
        const billingType = String(form.get("billingType")) as Bill["billingType"];
        const bill: Omit<Bill, "id"> = {
          description: String(form.get("description")),
          amount: Number(form.get("amount")),
          account: String(form.get("account")) as AccountType,
          billingType,
          dueDay: Number(form.get("dueDay")),
          category: String(form.get("category") || "Outros"),
          paidInstallments: 0,
          createdAt: serverTimestamp(),
          ...(billingType === "installment" ? { totalInstallments: Number(form.get("totalInstallments")) } : {}),
        };
        if (firebaseState !== "live" || !uid) throw new Error("Firebase ainda não está conectado");
        await set(push(ref(getDatabase(getApps()[0]), `users/${uid}/bills`)), bill);
        showToast(billingType === "fixed" ? "Conta mensal adicionada" : "Compra parcelada adicionada");
      } else {
        const amount = Number(form.get("amount"));
        const description = String(form.get("description"));
        const transaction: Omit<Transaction, "id"> = {
          description,
          amount,
          type: kind === "entrada" ? "income" : kind === "despesa" ? "expense" : "transfer",
          account: kind === "transferencia" ? "personal" : String(form.get("account")) as AccountType,
          createdAt: serverTimestamp(),
        };
        if (firebaseState !== "live" || !uid) throw new Error("Firebase ainda não está conectado");
        await set(push(ref(getDatabase(getApps()[0]), `users/${uid}/transactions`)), transaction);
        showToast(kind === "despesa" ? "Despesa registrada" : kind === "transferencia" ? "Transferência concluída" : "Entrada registrada");
      }
      setModal(null);
    } catch (error) {
      console.error(error);
      showToast("Não foi possível concluir agora");
    }
  };

  const updateStatus = async (order: Order, status: OrderStatus) => {
    setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status } : item)));
    if (firebaseState === "live" && uid) {
      await update(ref(getDatabase(getApps()[0]), `users/${uid}/orders/${order.id}`), { status });
    }
    showToast("Pedido atualizado");
  };

  const payBill = async (bill: Bill) => {
    if (firebaseState !== "live" || !uid) return showToast("Firebase ainda não está conectado");
    const db = getDatabase(getApps()[0]);
    const month = new Date().toISOString().slice(0, 7);
    if (bill.billingType === "fixed" && bill.lastPaidMonth === month) return showToast("Esta conta já foi paga neste mês");
    if (bill.billingType === "installment" && (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1)) return showToast("Todas as parcelas já foram pagas");
    const transactionKey = push(ref(db, `users/${uid}/transactions`)).key;
    if (!transactionKey) return showToast("Não foi possível registrar o pagamento");
    const updates: Record<string, unknown> = {
      [`users/${uid}/transactions/${transactionKey}`]: { description: `${bill.billingType === "fixed" ? "Conta mensal" : `Parcela ${(bill.paidInstallments ?? 0) + 1}/${bill.totalInstallments}`} · ${bill.description}`, amount: bill.amount, type: "expense", account: bill.account, createdAt: serverTimestamp() },
      [`users/${uid}/bills/${bill.id}/${bill.billingType === "fixed" ? "lastPaidMonth" : "paidInstallments"}`]: bill.billingType === "fixed" ? month : (bill.paidInstallments ?? 0) + 1,
    };
    await update(ref(db), updates);
    showToast("Pagamento registrado");
  };

  const deleteBill = async (bill: Bill) => {
    if (!uid || !window.confirm(`Excluir a conta “${bill.description}”?`)) return;
    await remove(ref(getDatabase(getApps()[0]), `users/${uid}/bills/${bill.id}`));
    showToast("Conta removida");
  };

  if (!authReady) return <AuthScreen state="loading" error="" onSignIn={signInGoogle} />;
  if (!isFirebaseConfigured) return <AuthScreen state="unconfigured" error="A configuração do Firebase não foi encontrada neste ambiente." onSignIn={signInGoogle} />;
  if (!user) return <AuthScreen state="signed-out" error={authError} onSignIn={signInGoogle} />;

  const userName = user.displayName || "Usuário PSYZON";
  const initials = userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("inicio")} aria-label="Ir para o início">
          <span className="brand-mark">P</span>
          <span><b>PSYZON</b><small>GO</small></span>
        </button>
        <nav>
          {navItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
        </nav>
        <div className={`sync-status ${firebaseState}`}><span />{firebaseState === "live" ? "Firebase em tempo real" : firebaseState === "connecting" ? "Conectando…" : "Erro de sincronização"}</div>
        <button className="profile" onClick={() => setView("mais")}><span>{initials}</span><span><b>{userName}</b><small>{user.email}</small></span><ChevronRight size={15} /></button>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-logo" onClick={() => setView("inicio")}><span className="brand-mark">P</span><b>PSYZON</b></button>
          <div className="search-wrap">
            <Search size={18} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, pedido ou produto…" aria-label="Busca global" />
            <kbd>/</kbd>
            {!!searchResults.length && <div className="search-results">{searchResults.map((order) => <button key={order.id} onClick={() => { setView("producao"); setSearch(""); }}><span><b>{order.customer}</b><small>Pedido #{order.id} · {order.product}</small></span><strong>{displayMoney(order.total - order.paid)}<small>pendente</small></strong></button>)}</div>}
          </div>
          <div className="top-actions">
            <button onClick={() => setPrivateValues((value) => !value)} aria-label="Ocultar valores">{privateValues ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            <button onClick={() => setDark((value) => !value)} aria-label="Alternar tema">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
            <button className="notification" aria-label="Notificações"><Bell size={19} /><span /></button>
          </div>
        </header>

        <section className="content">
          {view === "inicio" && <Dashboard orders={activeOrders} transactions={businessTransactions} businessBalance={businessBalance} businessIncome={businessIncome} businessExpense={businessExpense} pending={pending} personalBalance={personalBalance} overdue={overdue} urgent={urgent} displayMoney={displayMoney} setModal={(kind: CreateKind) => openCreate(kind, "business")} setView={setView} updateStatus={updateStatus} />}
          {view === "producao" && <Production orders={activeOrders} board={board} setBoard={setBoard} displayMoney={displayMoney} updateStatus={updateStatus} />}
          {view === "clientes" && <Customers customers={derivedCustomers} orders={orders} displayMoney={displayMoney} setModal={(kind: CreateKind) => openCreate(kind, "business")} />}
          {view === "financeiro" && <Finance transactions={businessTransactions} bills={bills.filter((bill) => bill.account === "business")} businessBalance={businessBalance} businessIncome={businessIncome} businessExpense={businessExpense} pending={pending} displayMoney={displayMoney} openCreate={(kind: CreateKind) => openCreate(kind, "business")} payBill={payBill} deleteBill={deleteBill} />}
          {view === "pessoal" && <PersonalFinance transactions={personalTransactions} bills={bills.filter((bill) => bill.account === "personal")} balance={personalBalance} income={personalIncome} expense={personalExpense} displayMoney={displayMoney} openCreate={(kind: CreateKind) => openCreate(kind, "personal")} payBill={payBill} deleteBill={deleteBill} />}
          {view === "mais" && <MoreView firebaseState={firebaseState} dark={dark} setDark={setDark} privateValues={privateValues} setPrivateValues={setPrivateValues} user={user} onSignOut={signOutGoogle} onReset={resetAllData} resetting={resetting} />}
        </section>
      </main>

      <button className="floating-new" onClick={() => setModal("pedido")}><Plus size={21} /> <span>Novo</span></button>
      <nav className="mobile-nav">
        {mobileNavItems.slice(0, 2).map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
        <button className="mobile-new" onClick={() => setModal("pedido")} aria-label="Novo pedido"><Plus /></button>
        {mobileNavItems.slice(2).map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
      </nav>

      {modal && <CreateModal kind={modal} account={modalAccount} setKind={setModal} close={() => setModal(null)} onSubmit={submitCreate} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function AuthScreen({ state, error, onSignIn }: { state: "loading" | "unconfigured" | "signed-out"; error: string; onSignIn: () => void }) {
  return <main className="auth-screen"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">P</span><span><b>PSYZON</b><small>GO</small></span></div><span className="auth-kicker">GESTÃO EM TEMPO REAL</span><h1>{state === "loading" ? "Preparando seu espaço…" : state === "unconfigured" ? "Firebase não configurado" : "Sua operação em um só lugar."}</h1><p>{state === "signed-out" ? "Entre com sua conta Google para acessar pedidos, clientes e financeiro com sincronização segura entre dispositivos." : state === "loading" ? "Conectando com segurança ao Firebase." : error}</p>{state === "signed-out" && <button className="google-button" onClick={onSignIn}><span>G</span> Continuar com Google</button>}{error && state === "signed-out" && <p className="auth-error" role="alert">{error}</p>}<small className="auth-note">Cada conta acessa somente os próprios dados.</small></section></main>;
}

function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={active ? "active" : ""} onClick={onClick}><Icon size={20} /><span>{item.label}</span></button>;
}

function Dashboard({ orders, transactions, businessBalance, businessIncome, businessExpense, pending, personalBalance, overdue, urgent, displayMoney, setModal, setView, updateStatus }: any) {
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">VISÃO DE HOJE</span><h1>Bom dia, Rodrigo.</h1><p>{date.charAt(0).toUpperCase() + date.slice(1)} · Tudo sob controle.</p></div>
      <button className="primary" onClick={() => setModal("pedido")}><Plus size={18} /> Novo pedido <kbd>N</kbd></button>
    </div>
    <div className="metric-grid">
      <Metric icon={BriefcaseBusiness} label="Saldo empresa" value={displayMoney(businessBalance)} detail={<><span className="positive">+ {displayMoney(businessIncome)}</span><span>entradas</span><span className="negative">− {displayMoney(businessExpense)}</span><span>saídas</span></>} />
      <Metric icon={CircleDollarSign} label="A receber" value={displayMoney(pending)} detail={<><span>{orders.filter((o: Order) => o.total > o.paid).length} clientes pendentes</span><ChevronRight size={16} /></>} onClick={() => setView("financeiro")} />
      <Metric icon={Boxes} label="Produção" value={`${orders.length} pedidos`} detail={<><span>{urgent.length} entregas próximas</span>{overdue.length > 0 && <b className="negative">{overdue.length} atrasado</b>}</>} onClick={() => setView("producao")} />
      <Metric icon={UserRound} label="Saldo pessoal" value={displayMoney(personalBalance)} detail={<span className="personal-label">PESSOAL · separado da empresa</span>} />
    </div>
    <div className="dashboard-grid">
      <div className="main-column">
        {overdue.length > 0 && <section className="attention-card"><div className="section-title"><div><span className="alert-dot" /><h2>Precisa da sua atenção</h2></div><span>{overdue.length + orders.filter((o: Order) => o.total > o.paid).length} pendências</span></div>{overdue.slice(0, 1).map((order: Order) => <button key={order.id} onClick={() => setView("producao")}><span className="attention-icon"><Clock3 size={18} /></span><span><b>Pedido #{order.id} está atrasado</b><small>{order.customer} · {order.product}</small></span><strong>{dueLabel(order.dueDate, order.status)}</strong><ChevronRight size={17} /></button>)}</section>}
        <section className="panel"><div className="section-title"><div><h2>Hoje</h2><span className="count">{Math.min(3, orders.length)}</span></div><button onClick={() => setView("producao")}>Ver produção <ChevronRight size={16} /></button></div><div className="today-list">{orders.slice(0, 3).map((order: Order, index: number) => <div className="today-row" key={order.id}><button className="check-button" onClick={() => updateStatus(order, order.status === "Finalização" ? "Pronto" : "Finalização")} aria-label="Concluir etapa"><span /></button><div><span className="task-type">PEDIDO #{order.id}</span><b>{index === 0 ? "Finalizar e embalar" : index === 1 ? "Conferir impressão" : "Separar materiais"}</b><small>{order.customer} · {order.quantity} un.</small></div><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><button className="row-menu"><MoreHorizontal size={18} /></button></div>)}</div></section>
        <section className="panel"><div className="section-title"><div><h2>Próximas entregas</h2></div><button onClick={() => setView("producao")}>Ver todas <ChevronRight size={16} /></button></div><div className="delivery-list">{orders.slice(0, 4).map((order: Order) => <div className="delivery-row" key={order.id}><div className="avatar">{order.customer.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="delivery-customer"><b>{order.customer}</b><small>{order.quantity} {order.product.toLowerCase()}</small></div><div className="delivery-date"><small>PRAZO</small><b>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${order.dueDate}T00:00:00`))}</b></div><div className="progress-cell"><div><span style={{ width: `${statusProgress[order.status]}%` }} /></div><small>{order.status} · {statusProgress[order.status]}%</small></div><div className="pending-cell"><small>PENDENTE</small><b>{displayMoney(order.total - order.paid)}</b></div><ChevronRight size={17} /></div>)}</div></section>
      </div>
      <aside className="side-column">
        <section className="panel quick-panel"><div className="section-title"><h2>Ações rápidas</h2></div><button onClick={() => setModal("pedido")}><Boxes size={18} /><span><b>Novo pedido</b><small>Produção + financeiro</small></span><Plus size={17} /></button><button onClick={() => setModal("cliente")}><UsersRound size={18} /><span><b>Novo cliente</b><small>Cadastro essencial</small></span><Plus size={17} /></button><button onClick={() => setModal("entrada")}><TrendingUp size={18} /><span><b>Nova entrada</b><small>Recebimento avulso</small></span><Plus size={17} /></button><button onClick={() => setModal("despesa")}><TrendingDown size={18} /><span><b>Nova despesa</b><small>Empresa ou pessoal</small></span><Plus size={17} /></button></section>
        <section className="panel movement-panel"><div className="section-title"><h2>Movimentações recentes</h2><button onClick={() => setView("financeiro")}>Ver tudo</button></div>{transactions.slice(0, 4).map((transaction: Transaction) => <div className="movement" key={transaction.id}><span className={transaction.type}><span>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : "↗"}</span></span><div><b>{transaction.description}</b><small>Hoje · Conta {transaction.account === "business" ? "empresa" : "pessoal"}</small></div><strong className={transaction.type === "income" ? "positive" : transaction.type === "expense" ? "negative" : ""}>{transaction.type === "expense" ? "− " : transaction.type === "income" ? "+ " : ""}{displayMoney(transaction.amount)}</strong></div>)}</section>
      </aside>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value, detail, onClick }: any) {
  const Tag = onClick ? "button" : "div";
  return <Tag className="metric-card" onClick={onClick}><div className="metric-top"><span><Icon size={19} /></span><small>{label}</small>{onClick && <ChevronRight size={16} />}</div><strong>{value}</strong><div className="metric-detail">{detail}</div></Tag>;
}

function Production({ orders, board, setBoard, displayMoney, updateStatus }: any) {
  const statuses: OrderStatus[] = ["Aguardando material", "Produção", "Finalização", "Pronto"];
  return <><div className="page-heading compact"><div><span className="eyebrow">OPERAÇÃO</span><h1>Produção</h1><p>{orders.length} pedidos ativos · prazos em primeiro lugar</p></div><div className="view-toggle"><button className={!board ? "active" : ""} onClick={() => setBoard(false)}><List size={17} /> Lista</button><button className={board ? "active" : ""} onClick={() => setBoard(true)}><LayoutGrid size={17} /> Kanban</button></div></div><div className="filter-row"><button className="active">Todos <span>{orders.length}</span></button><button>Hoje</button><button>Esta semana</button><button>Atrasados</button><button>Prontos</button></div>{board ? <div className="kanban">{statuses.map((status) => <div className="kanban-column" key={status}><div className="kanban-title"><span className={`status-dot s-${statusProgress[status]}`} />{status}<b>{orders.filter((o: Order) => o.status === status).length}</b></div>{orders.filter((o: Order) => o.status === status).map((order: Order) => <OrderCard key={order.id} order={order} displayMoney={displayMoney} updateStatus={updateStatus} />)}</div>)}</div> : <section className="panel order-table"><div className="table-head"><span>Pedido / cliente</span><span>Produto</span><span>Prazo</span><span>Status</span><span>Valor</span></div>{orders.map((order: Order) => <div className="table-row" key={order.id}><span><b>#{order.id} · {order.customer}</b><small>{order.quantity} unidades</small></span><span>{order.product}</span><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><span><select value={order.status} onChange={(event) => updateStatus(order, event.target.value as OrderStatus)}>{Object.keys(statusProgress).map((status) => <option key={status}>{status}</option>)}</select></span><span><b>{displayMoney(order.total)}</b><small>{displayMoney(order.total - order.paid)} pendente</small></span></div>)}</section>}</>;
}

function OrderCard({ order, displayMoney, updateStatus }: { order: Order; displayMoney: (value: number) => string; updateStatus: (order: Order, status: OrderStatus) => void }) {
  return <article className="order-card"><div><span>#{order.id}</span><button><MoreHorizontal size={17} /></button></div><h3>{order.customer}</h3><p>{order.quantity} × {order.product}</p><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><div className="progress-line"><span style={{ width: `${statusProgress[order.status]}%` }} /></div><footer><span><small>Pendente</small><b>{displayMoney(order.total - order.paid)}</b></span>{order.status === "Pronto" ? <a href={`https://wa.me/${order.phone}?text=${encodeURIComponent(`Olá, ${order.customer}. Seu pedido da PSYZON ficou pronto e já está disponível para retirada/entrega.`)}`} target="_blank"><MessageCircle size={16} /> Avisar</a> : <button onClick={() => updateStatus(order, order.status === "Produção" ? "Finalização" : "Produção")}>Avançar <ChevronRight size={15} /></button>}</footer></article>;
}

function Customers({ customers, orders, displayMoney, setModal }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">RELACIONAMENTO</span><h1>Clientes</h1><p>Cadastro simples e histórico em um só lugar.</p></div><button className="primary" onClick={() => setModal("cliente")}><Plus size={18} /> Novo cliente</button></div><div className="customer-grid">{customers.map((customer: Customer) => { const clientOrders = orders.filter((order: Order) => order.customer === customer.name); const total = clientOrders.reduce((sum: number, order: Order) => sum + order.total, 0); const pending = clientOrders.reduce((sum: number, order: Order) => sum + order.total - order.paid, 0); return <article className="customer-card" key={customer.id}><div className="customer-card-top"><span className="avatar large">{customer.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><h3>{customer.name}</h3><p>{customer.company || customer.phone || "Cliente PSYZON"}</p></div><button><MoreHorizontal size={18} /></button></div><div className="customer-stats"><span><small>Total comprado</small><b>{displayMoney(total)}</b></span><span><small>Saldo pendente</small><b className={pending ? "negative" : "positive"}>{displayMoney(pending)}</b></span></div><footer><span>{clientOrders.length} {clientOrders.length === 1 ? "pedido" : "pedidos"}</span><a href={`https://wa.me/${customer.phone}`} target="_blank"><MessageCircle size={16} /> WhatsApp</a></footer></article>; })}</div></>;
}

function Finance({ transactions, bills, businessBalance, businessIncome, businessExpense, pending, displayMoney, openCreate, payBill, deleteBill }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">FINANCEIRO EMPRESARIAL</span><h1>Dinheiro da empresa.</h1><p>Caixa, contas e compromissos da operação.</p></div><button className="primary" onClick={() => openCreate("entrada")}><Plus size={18} /> Movimentação</button></div><div className="account-grid single"><article className="account-card business"><div><span><BriefcaseBusiness size={19} /> EMPRESA</span><small>Saldo disponível</small><strong>{displayMoney(businessBalance)}</strong></div><div className="account-stats"><span><small>Entradas</small><b className="positive">{displayMoney(businessIncome)}</b></span><span><small>Saídas</small><b>{displayMoney(businessExpense)}</b></span><span><small>A receber</small><b>{displayMoney(pending)}</b></span></div></article></div><BillsPanel bills={bills} account="business" displayMoney={displayMoney} openCreate={openCreate} payBill={payBill} deleteBill={deleteBill} /><div className="finance-grid"><section className="panel finance-summary"><div className="section-title"><h2>Resumo do mês</h2></div><div><span><small>Faturamento</small><b>{displayMoney(businessIncome)}</b></span><span><small>Despesas</small><b>{displayMoney(businessExpense)}</b></span><span><small>Resultado</small><b className={businessIncome - businessExpense >= 0 ? "positive" : "negative"}>{displayMoney(businessIncome - businessExpense)}</b></span><span><small>A receber</small><b>{displayMoney(pending)}</b></span></div></section><Movements transactions={transactions} displayMoney={displayMoney} openCreate={openCreate} /></div></>;
}

function PersonalFinance({ transactions, bills, balance, income, expense, displayMoney, openCreate, payBill, deleteBill }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">FINANCEIRO PESSOAL</span><h1>Sua vida financeira.</h1><p>Separada da empresa, como deve ser.</p></div><button className="primary personal-action" onClick={() => openCreate("entrada")}><Plus size={18} /> Movimentação pessoal</button></div><div className="account-grid single"><article className="account-card personal"><div><span><UserRound size={19} /> PESSOAL</span><small>Saldo pessoal</small><strong>{displayMoney(balance)}</strong></div><div className="account-stats"><span><small>Entradas + transferências</small><b className="positive">{displayMoney(income)}</b></span><span><small>Despesas pessoais</small><b>{displayMoney(expense)}</b></span></div></article></div><BillsPanel bills={bills} account="personal" displayMoney={displayMoney} openCreate={openCreate} payBill={payBill} deleteBill={deleteBill} /><div className="personal-actions"><button className="secondary" onClick={() => openCreate("entrada")}><TrendingUp size={16} /> Nova entrada</button><button className="secondary" onClick={() => openCreate("despesa")}><TrendingDown size={16} /> Nova despesa</button></div><Movements transactions={transactions} displayMoney={displayMoney} openCreate={openCreate} personal /></>;
}

function BillsPanel({ bills, account, displayMoney, openCreate, payBill, deleteBill }: { bills: Bill[]; account: AccountType; displayMoney: (value: number) => string; openCreate: (kind: CreateKind) => void; payBill: (bill: Bill) => void; deleteBill: (bill: Bill) => void }) {
  const month = new Date().toISOString().slice(0, 7);
  const pendingTotal = bills.reduce((sum, bill) => {
    const paid = bill.billingType === "fixed" ? bill.lastPaidMonth === month : (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1);
    return sum + (paid ? 0 : bill.amount);
  }, 0);
  return <section className="panel bills-panel"><div className="section-title"><div><CalendarClock size={18} /><div><h2>Contas fixas e parceladas</h2><span>{bills.length} cadastradas · {displayMoney(pendingTotal)} neste mês</span></div></div><button onClick={() => openCreate("conta")}><Plus size={15} /> Nova conta</button></div><div className="bill-list">{bills.length === 0 ? <div className="empty-finance"><CalendarClock size={24} /><b>Nenhuma conta cadastrada</b><small>Adicione aluguel, internet, cartão ou compras parceladas.</small><button onClick={() => openCreate("conta")}>Cadastrar primeira conta</button></div> : bills.map((bill) => { const installment = bill.billingType === "installment"; const paid = installment ? (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1) : bill.lastPaidMonth === month; const progress = installment ? Math.min(100, ((bill.paidInstallments ?? 0) / (bill.totalInstallments ?? 1)) * 100) : paid ? 100 : 0; return <article className={`bill-row ${paid ? "paid" : ""}`} key={bill.id}><div className="bill-date"><small>VENCE</small><b>{String(bill.dueDay).padStart(2, "0")}</b></div><div className="bill-info"><span><b>{bill.description}</b><small>{bill.category} · {installment ? `${bill.paidInstallments ?? 0}/${bill.totalInstallments} parcelas pagas` : "Mensal fixa"}</small></span>{installment && <div className="bill-progress"><span style={{ width: `${progress}%` }} /></div>}</div><strong>{displayMoney(bill.amount)}<small>{paid ? "PAGO" : account === "business" ? "EMPRESA" : "PESSOAL"}</small></strong><button className="bill-pay" onClick={() => payBill(bill)} disabled={paid}>{paid ? "Pago" : "Pagar"}</button><button className="bill-delete" onClick={() => deleteBill(bill)} aria-label={`Excluir ${bill.description}`}><Trash2 size={15} /></button></article>; })}</div></section>;
}

function Movements({ transactions, displayMoney, openCreate, personal = false }: { transactions: Transaction[]; displayMoney: (value: number) => string; openCreate: (kind: CreateKind) => void; personal?: boolean }) {
  return <section className="panel movement-panel full"><div className="section-title"><h2>Movimentações</h2><div><button onClick={() => openCreate("entrada")}>+ Entrada</button><button onClick={() => openCreate("despesa")}>+ Despesa</button>{!personal && <button onClick={() => openCreate("transferencia")}>Transferir</button>}</div></div>{transactions.length === 0 ? <div className="empty-movements">Nenhuma movimentação nesta conta.</div> : transactions.map((transaction) => <div className="movement" key={transaction.id}><span className={transaction.type}><span>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : "↗"}</span></span><div><b>{transaction.description}</b><small>{transaction.type === "transfer" ? "Transferência para pessoal" : personal ? "Conta pessoal" : "Conta empresa"}</small></div><strong className={transaction.type === "income" ? "positive" : transaction.type === "expense" ? "negative" : ""}>{transaction.type === "expense" ? "− " : transaction.type === "income" ? "+ " : ""}{displayMoney(transaction.amount)}</strong></div>)}</section>;
}

function MoreView({ firebaseState, dark, setDark, privateValues, setPrivateValues, user, onSignOut, onReset, resetting }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">PREFERÊNCIAS</span><h1>Configurações</h1><p>Conta, privacidade e dados do PSYZON GO.</p></div></div><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Settings size={20} /></div><div><h3>Aparência e privacidade</h3><p>Personalize como o PSYZON GO aparece.</p></div><label><span><b>Tema escuro</b><small>Mais confortável à noite</small></span><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /></label><label><span><b>Ocultar valores</b><small>Privacidade perto de clientes</small></span><input type="checkbox" checked={privateValues} onChange={(e) => setPrivateValues(e.target.checked)} /></label></section><section className="panel settings-card"><div className="settings-icon"><BriefcaseBusiness size={20} /></div><div><h3>Dados e sincronização</h3><p>Seus registros disponíveis em qualquer dispositivo.</p></div><div className={`connection-box ${firebaseState}`}><span /><div><b>{firebaseState === "live" ? "Firebase conectado" : firebaseState === "error" ? "Falha na sincronização" : "Conectando ao Firebase"}</b><small>{firebaseState === "live" ? "Alterações sincronizadas em tempo real" : "Aguardando uma conexão segura"}</small></div></div><div className="account-row"><span><b>{user.displayName || "Conta Google"}</b><small>{user.email}</small></span><button className="secondary" onClick={onSignOut}><LogOut size={16} /> Sair</button></div><div className="danger-zone"><div><b>Resetar todos os dados</b><small>Apaga pedidos, clientes, contas e movimentações desta conta.</small></div><button className="danger-button" onClick={onReset} disabled={resetting}><RotateCcw size={16} /> {resetting ? "Apagando…" : "Resetar tudo"}</button></div></section></div></>;
}

function CreateModal({ kind, account, setKind, close, onSubmit }: { kind: CreateKind; account: AccountType; setKind: (kind: CreateKind) => void; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const titles: Record<CreateKind, string> = { pedido: "Novo pedido", cliente: "Novo cliente", entrada: "Nova entrada", despesa: "Nova despesa", transferencia: "Transferir para pessoal", conta: "Nova conta recorrente" };
  const financeKind = ["entrada", "despesa", "transferencia", "conta"].includes(kind);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal"><header><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>{titles[kind]}</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><div className="create-tabs"><button className={kind === "pedido" ? "active" : ""} onClick={() => setKind("pedido")}>Pedido</button><button className={kind === "cliente" ? "active" : ""} onClick={() => setKind("cliente")}>Cliente</button><button className={kind === "entrada" ? "active" : ""} onClick={() => setKind("entrada")}>Entrada</button><button className={kind === "despesa" ? "active" : ""} onClick={() => setKind("despesa")}>Despesa</button><button className={kind === "conta" ? "active" : ""} onClick={() => setKind("conta")}>Conta</button></div><form onSubmit={onSubmit}>{financeKind && <><input type="hidden" name="account" value={account} /><div className={`account-context ${account}`}><span>{account === "business" ? <BriefcaseBusiness size={15} /> : <UserRound size={15} />}</span><div><small>LANÇAMENTO EM</small><b>{account === "business" ? "Financeiro empresarial" : "Financeiro pessoal"}</b></div></div></>}{kind === "pedido" ? <><label className="full">Cliente<input name="customer" required autoFocus placeholder="Nome do cliente" /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" placeholder="55 71 99999-0000" /></label><label className="full">Produto<input name="product" required placeholder="Ex.: Camisetas personalizadas" /></label><div className="form-row"><label>Quantidade<input name="quantity" type="number" min="1" defaultValue="1" required /></label><label>Prazo<input name="dueDate" type="date" defaultValue={isoOffset(7)} required /></label></div><div className="form-row"><label>Valor total<input name="total" type="number" min="0" step="0.01" placeholder="0,00" required /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" placeholder="0,00" defaultValue="0" /></label></div><label className="full">Observação<textarea name="notes" rows={3} placeholder="Só se for importante…" /></label></> : kind === "cliente" ? <><label className="full">Nome<input name="name" required autoFocus placeholder="Nome do cliente" /></label><label className="full">WhatsApp<input name="phone" required inputMode="tel" placeholder="55 71 99999-0000" /></label><label className="full">Empresa <span>(opcional)</span><input name="company" placeholder="Empresa ou organização" /></label></> : kind === "conta" ? <><label className="full">Nome da conta<input name="description" required autoFocus placeholder="Ex.: Aluguel, internet ou notebook" /></label><div className="form-row"><label>Tipo<select name="billingType"><option value="fixed">Mensal fixa</option><option value="installment">Parcelada</option></select></label><label>Valor mensal/parcela<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00" /></label></div><div className="form-row"><label>Dia do vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue="10" required /></label><label>Total de parcelas<input name="totalInstallments" type="number" min="2" defaultValue="12" required /></label></div><label className="full">Categoria<select name="category"><option>Moradia</option><option>Serviços</option><option>Equipamentos</option><option>Impostos</option><option>Outros</option></select></label><p className="form-help">Em conta fixa, o total de parcelas é ignorado. Em parcelada, informe o total contratado.</p></> : <><label className="full">Descrição<input name="description" required autoFocus placeholder={kind === "despesa" ? "Ex.: Compra de material" : kind === "transferencia" ? "Ex.: Pró-labore de agosto" : "Ex.: Pagamento recebido"} /></label><label className="full">Valor<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00" /></label><label className="full">Categoria<select name="category"><option>{kind === "despesa" ? "Despesa" : kind === "transferencia" ? "Pró-labore" : "Receita"}</option><option>Outros</option></select></label></>}<footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary"><Check size={17} /> {kind === "pedido" ? "Criar pedido" : kind === "conta" ? "Salvar conta" : "Confirmar"}</button></footer></form></aside></div>;
}
