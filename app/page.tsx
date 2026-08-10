"use client";

import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
} from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import {
  Bell,
  Boxes,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  EyeOff,
  Home,
  LayoutGrid,
  List,
  Menu,
  MessageCircle,
  Moon,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  Settings,
  Sun,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "inicio" | "producao" | "clientes" | "financeiro" | "mais";
type CreateKind = "pedido" | "cliente" | "entrada" | "despesa" | "transferencia";
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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function isoOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const demoOrders: Order[] = [
  { id: "103", customer: "Igreja Batista", phone: "5571999991103", product: "Camisetas do evento", quantity: 45, total: 2250, paid: 1500, dueDate: isoOffset(-2), status: "Finalização" },
  { id: "105", customer: "João Silva", phone: "5571999991105", product: "Camisetas personalizadas", quantity: 30, total: 1500, paid: 750, dueDate: isoOffset(1), status: "Produção" },
  { id: "108", customer: "Maria Santos", phone: "5571999991108", product: "Uniformes escolares", quantity: 18, total: 1260, paid: 910, dueDate: isoOffset(3), status: "Finalização" },
  { id: "112", customer: "Escola ABC", phone: "5571999991112", product: "Kits esportivos", quantity: 32, total: 2880, paid: 2880, dueDate: isoOffset(5), status: "Produção" },
  { id: "114", customer: "Studio Norte", phone: "5571999991114", product: "Canecas sublimadas", quantity: 24, total: 840, paid: 420, dueDate: isoOffset(8), status: "Aguardando material" },
];

const demoTransactions: Transaction[] = [
  { id: "t1", description: "Entrada · João Silva · #105", amount: 750, type: "income", account: "business" },
  { id: "t2", description: "Compra de camisas", amount: 320, type: "expense", account: "business" },
  { id: "t3", description: "Impressão DTF · #103", amount: 180, type: "expense", account: "business" },
  { id: "t4", description: "Pró-labore", amount: 1000, type: "transfer", account: "personal" },
];

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
  { id: "mais", label: "Mais", icon: MoreHorizontal },
];

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
  const [orders, setOrders] = useState<Order[]>(demoOrders);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [firebaseState, setFirebaseState] = useState<"connecting" | "live" | "demo">("connecting");
  const [uid, setUid] = useState("");
  const [dark, setDark] = useState(false);
  const [privateValues, setPrivateValues] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<CreateKind | null>(null);
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem("psy-theme");
    setDark(storedTheme === "dark");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    if (!isFirebaseConfigured) {
      setFirebaseState("demo");
      return;
    }

    let cleanups: (() => void)[] = [];
    const connect = async () => {
      try {
        const app = getApps()[0] ?? initializeApp(firebaseConfig);
        const auth = getAuth(app);
        await setPersistence(auth, browserLocalPersistence);
        const credential = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
        const userId = credential.user.uid;
        setUid(userId);
        const db = getFirestore(app);
        const base = collection(db, "users", userId, "orders");
        const unsubOrders = onSnapshot(query(base, orderBy("createdAt", "desc")), (snapshot) => {
          const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Order));
          setOrders(next.length ? next : demoOrders);
          setFirebaseState("live");
        });
        const unsubTransactions = onSnapshot(collection(db, "users", userId, "transactions"), (snapshot) => {
          const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Transaction));
          if (next.length) setTransactions(next);
        });
        const unsubCustomers = onSnapshot(collection(db, "users", userId, "customers"), (snapshot) => {
          setCustomers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Customer)));
        });
        cleanups = [unsubOrders, unsubTransactions, unsubCustomers];
      } catch (error) {
        console.error("Firebase connection failed", error);
        setFirebaseState("demo");
      }
    };
    connect();
    return () => cleanups.forEach((cleanup) => cleanup());
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
  const pending = orders.reduce((sum, order) => sum + Math.max(0, order.total - order.paid), 0);
  const businessBalance = 7680 + businessIncome - businessExpense;
  const personalBalance = 2300;
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
        if (firebaseState === "live" && uid) {
          const app = getApps()[0];
          const db = getFirestore(app);
          const batch = writeBatch(db);
          const orderRef = doc(collection(db, "users", uid, "orders"));
          batch.set(orderRef, nextOrder);
          const customerRef = doc(db, "users", uid, "customers", nextOrder.customer.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-") || orderRef.id);
          batch.set(customerRef, { name: nextOrder.customer, phone: nextOrder.phone }, { merge: true });
          if (nextOrder.paid > 0) {
            const transactionRef = doc(collection(db, "users", uid, "transactions"));
            batch.set(transactionRef, { description: `Entrada · ${nextOrder.customer} · #${orderRef.id.slice(0, 5).toUpperCase()}`, amount: nextOrder.paid, type: "income", account: "business", orderId: orderRef.id, createdAt: serverTimestamp() });
          }
          await batch.commit();
        } else {
          const id = String(Math.floor(115 + Math.random() * 80));
          setOrders((current) => [{ id, ...nextOrder }, ...current]);
          if (nextOrder.paid > 0) setTransactions((current) => [{ id: `t-${Date.now()}`, description: `Entrada · ${nextOrder.customer} · #${id}`, amount: nextOrder.paid, type: "income", account: "business" }, ...current]);
        }
        showToast("Pedido criado e financeiro atualizado");
      } else if (kind === "cliente") {
        const customer = { name: String(form.get("name")), phone: String(form.get("phone")), company: String(form.get("company") || "") };
        if (firebaseState === "live" && uid) {
          const db = getFirestore(getApps()[0]);
          await addDoc(collection(db, "users", uid, "customers"), customer);
        } else setCustomers((current) => [{ id: `c-${Date.now()}`, ...customer }, ...current]);
        showToast("Cliente adicionado");
      } else {
        const amount = Number(form.get("amount"));
        const description = String(form.get("description"));
        const transaction: Omit<Transaction, "id"> = {
          description,
          amount,
          type: kind === "entrada" ? "income" : kind === "despesa" ? "expense" : "transfer",
          account: kind === "transferencia" ? "personal" : "business",
          createdAt: serverTimestamp(),
        };
        if (firebaseState === "live" && uid) {
          const db = getFirestore(getApps()[0]);
          await addDoc(collection(db, "users", uid, "transactions"), transaction);
        } else setTransactions((current) => [{ id: `t-${Date.now()}`, ...transaction }, ...current]);
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
      const db = getFirestore(getApps()[0]);
      await setDoc(doc(db, "users", uid, "orders", order.id), { status }, { merge: true });
    }
    showToast("Pedido atualizado");
  };

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
        <div className={`sync-status ${firebaseState}`}><span />{firebaseState === "live" ? "Firebase em tempo real" : firebaseState === "connecting" ? "Conectando…" : "Modo demonstração"}</div>
        <button className="profile"><span>RS</span><span><b>Rodrigo</b><small>PSYZON Company</small></span><ChevronRight size={15} /></button>
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
          {view === "inicio" && <Dashboard orders={activeOrders} transactions={transactions} businessBalance={businessBalance} businessIncome={businessIncome} businessExpense={businessExpense} pending={pending} personalBalance={personalBalance} overdue={overdue} urgent={urgent} displayMoney={displayMoney} setModal={setModal} setView={setView} updateStatus={updateStatus} />}
          {view === "producao" && <Production orders={activeOrders} board={board} setBoard={setBoard} displayMoney={displayMoney} updateStatus={updateStatus} />}
          {view === "clientes" && <Customers customers={derivedCustomers} orders={orders} displayMoney={displayMoney} setModal={setModal} />}
          {view === "financeiro" && <Finance transactions={transactions} businessBalance={businessBalance} businessIncome={businessIncome} businessExpense={businessExpense} pending={pending} personalBalance={personalBalance} displayMoney={displayMoney} setModal={setModal} />}
          {view === "mais" && <MoreView firebaseState={firebaseState} dark={dark} setDark={setDark} privateValues={privateValues} setPrivateValues={setPrivateValues} />}
        </section>
      </main>

      <button className="floating-new" onClick={() => setModal("pedido")}><Plus size={21} /> <span>Novo</span></button>
      <nav className="mobile-nav">
        {navItems.slice(0, 2).map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
        <button className="mobile-new" onClick={() => setModal("pedido")} aria-label="Novo pedido"><Plus /></button>
        {navItems.slice(3).map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
      </nav>

      {modal && <CreateModal kind={modal} setKind={setModal} close={() => setModal(null)} onSubmit={submitCreate} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
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

function Finance({ transactions, businessBalance, businessIncome, businessExpense, pending, personalBalance, displayMoney, setModal }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">FINANCEIRO</span><h1>Seu dinheiro, sem mistura.</h1><p>Empresa e pessoal claramente separados.</p></div><button className="primary" onClick={() => setModal("entrada")}><Plus size={18} /> Movimentação</button></div><div className="account-grid"><article className="account-card business"><div><span><BriefcaseBusiness size={19} /> EMPRESA</span><small>Saldo disponível</small><strong>{displayMoney(businessBalance)}</strong></div><div className="account-stats"><span><small>Entradas</small><b className="positive">{displayMoney(businessIncome)}</b></span><span><small>Saídas</small><b>{displayMoney(businessExpense)}</b></span><span><small>A receber</small><b>{displayMoney(pending)}</b></span></div></article><article className="account-card personal"><div><span><UserRound size={19} /> PESSOAL</span><small>Saldo pessoal</small><strong>{displayMoney(personalBalance)}</strong></div><div className="account-stats"><span><small>Pró-labore</small><b>{displayMoney(1000)}</b></span><button onClick={() => setModal("transferencia")}>Transferir <ChevronRight size={15} /></button></div></article></div><div className="finance-grid"><section className="panel finance-summary"><div className="section-title"><h2>Resumo do mês</h2><button>Ver relatório</button></div><div><span><small>Faturamento</small><b>{displayMoney(18300)}</b></span><span><small>Despesas</small><b>{displayMoney(9100)}</b></span><span><small>Resultado</small><b className="positive">{displayMoney(9200)}</b></span><span><small>A receber</small><b>{displayMoney(pending)}</b></span></div></section><section className="panel movement-panel full"><div className="section-title"><h2>Movimentações</h2><div><button onClick={() => setModal("entrada")}>+ Entrada</button><button onClick={() => setModal("despesa")}>+ Despesa</button></div></div>{transactions.map((transaction: Transaction) => <div className="movement" key={transaction.id}><span className={transaction.type}><span>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : "↗"}</span></span><div><b>{transaction.description}</b><small>Conta {transaction.account === "business" ? "empresa" : "pessoal"}</small></div><strong className={transaction.type === "income" ? "positive" : transaction.type === "expense" ? "negative" : ""}>{displayMoney(transaction.amount)}</strong></div>)}</section></div></>;
}

function MoreView({ firebaseState, dark, setDark, privateValues, setPrivateValues }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">PREFERÊNCIAS</span><h1>Mais</h1><p>Só o que não precisa ocupar sua rotina.</p></div></div><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Settings size={20} /></div><div><h3>Aparência e privacidade</h3><p>Personalize como o PSYZON GO aparece.</p></div><label><span><b>Tema escuro</b><small>Mais confortável à noite</small></span><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /></label><label><span><b>Ocultar valores</b><small>Privacidade perto de clientes</small></span><input type="checkbox" checked={privateValues} onChange={(e) => setPrivateValues(e.target.checked)} /></label></section><section className="panel settings-card"><div className="settings-icon"><BriefcaseBusiness size={20} /></div><div><h3>Dados e sincronização</h3><p>Seus registros disponíveis em qualquer dispositivo.</p></div><div className={`connection-box ${firebaseState}`}><span /><div><b>{firebaseState === "live" ? "Firebase conectado" : "Firebase aguardando configuração"}</b><small>{firebaseState === "live" ? "Alterações sincronizadas em tempo real" : "A interface funciona com dados de demonstração"}</small></div></div><button className="secondary">Backup e exportação <ChevronRight size={16} /></button></section></div></>;
}

function CreateModal({ kind, setKind, close, onSubmit }: { kind: CreateKind; setKind: (kind: CreateKind) => void; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const titles: Record<CreateKind, string> = { pedido: "Novo pedido", cliente: "Novo cliente", entrada: "Nova entrada", despesa: "Nova despesa", transferencia: "Transferir para pessoal" };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal"><header><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>{titles[kind]}</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><div className="create-tabs"><button className={kind === "pedido" ? "active" : ""} onClick={() => setKind("pedido")}>Pedido</button><button className={kind === "cliente" ? "active" : ""} onClick={() => setKind("cliente")}>Cliente</button><button className={kind === "entrada" ? "active" : ""} onClick={() => setKind("entrada")}>Entrada</button><button className={kind === "despesa" ? "active" : ""} onClick={() => setKind("despesa")}>Despesa</button></div><form onSubmit={onSubmit}>{kind === "pedido" ? <><label className="full">Cliente<input name="customer" required autoFocus placeholder="Nome do cliente" /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" placeholder="55 71 99999-0000" /></label><label className="full">Produto<input name="product" required placeholder="Ex.: Camisetas personalizadas" /></label><div className="form-row"><label>Quantidade<input name="quantity" type="number" min="1" defaultValue="1" required /></label><label>Prazo<input name="dueDate" type="date" defaultValue={isoOffset(7)} required /></label></div><div className="form-row"><label>Valor total<input name="total" type="number" min="0" step="0.01" placeholder="0,00" required /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" placeholder="0,00" defaultValue="0" /></label></div><label className="full">Observação<textarea name="notes" rows={3} placeholder="Só se for importante…" /></label><button type="button" className="details-link">+ Adicionar detalhes</button></> : kind === "cliente" ? <><label className="full">Nome<input name="name" required autoFocus placeholder="Nome do cliente" /></label><label className="full">WhatsApp<input name="phone" required inputMode="tel" placeholder="55 71 99999-0000" /></label><label className="full">Empresa <span>(opcional)</span><input name="company" placeholder="Empresa ou organização" /></label></> : <><label className="full">Descrição<input name="description" required autoFocus placeholder={kind === "despesa" ? "Ex.: Compra de camisas" : kind === "transferencia" ? "Ex.: Pró-labore de agosto" : "Ex.: Pagamento recebido"} /></label><label className="full">Valor<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00" /></label><label className="full">Categoria<select name="category"><option>{kind === "despesa" ? "Material" : kind === "transferencia" ? "Pró-labore" : "Venda"}</option><option>Outros</option></select></label></>}<footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary"><Check size={17} /> {kind === "pedido" ? "Criar pedido" : "Confirmar"}</button></footer></form></aside></div>;
}
