"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import type { BusinessNote } from "./NotesWorkspace";
import {
  browserLocalPersistence,
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  AlertTriangle,
  Bell,
  Boxes,
  BriefcaseBusiness,
  Calculator,
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
  LogOut,
  MessageCircle,
  Moon,
  MoreHorizontal,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PictureInPicture2,
  Plus,
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

type View = "inicio" | "producao" | "notas" | "clientes" | "financeiro" | "pessoal" | "mais";
type CreateKind = "pedido" | "cliente" | "entrada" | "despesa" | "transferencia" | "conta";
type AccountType = "business" | "personal";
type UISize = "compact" | "comfortable" | "large";
type DocumentPictureInPictureController = {
  window: Window | null;
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
};
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
  notes?: string;
  createdAt?: unknown;
};

type Customer = { id: string; name: string; phone: string; company?: string };
type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account: "business" | "personal";
  category?: string;
  transactionDate?: string;
  source?: "bill";
  billId?: string;
  orderId?: string;
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

type AppNotification = {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "info";
  view: View;
};

const NotesWorkspace = dynamic(() => import("./NotesWorkspace"), { ssr: false });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const FIRESTORE_COLLECTIONS = ["orders", "customers", "transactions", "bills", "notes"] as const;
const isFirebaseConfigured = [firebaseConfig.apiKey, firebaseConfig.authDomain, firebaseConfig.projectId, firebaseConfig.appId].every(Boolean);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function userCollection(uid: string, name: (typeof FIRESTORE_COLLECTIONS)[number]) {
  return collection(getFirestore(getApps()[0]), "users", uid, name);
}

function userDocument(uid: string, name: (typeof FIRESTORE_COLLECTIONS)[number], id: string) {
  return doc(getFirestore(getApps()[0]), "users", uid, name, id);
}

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
  { id: "notas", label: "Bloco de notas", icon: NotebookPen },
  { id: "clientes", label: "Clientes", icon: UsersRound },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
  { id: "pessoal", label: "Pessoal", icon: UserRound },
  { id: "mais", label: "Mais", icon: MoreHorizontal },
];
const navGroups = [
  { label: "Operação", items: navItems.filter((item) => ["inicio", "producao", "notas", "clientes"].includes(item.id)) },
  { label: "Gestão", items: navItems.filter((item) => ["financeiro", "pessoal"].includes(item.id)) },
  { label: "Conta", items: navItems.filter((item) => item.id === "mais") },
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
  const [notes, setNotes] = useState<BusinessNote[]>([]);
  const [firebaseState, setFirebaseState] = useState<"connecting" | "live" | "error" | "unconfigured">("connecting");
  const [uid, setUid] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [authError, setAuthError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [dark, setDark] = useState(false);
  const [privateValues, setPrivateValues] = useState(false);
  const [uiSize, setUiSize] = useState<UISize>("comfortable");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<CreateKind | null>(null);
  const [modalAccount, setModalAccount] = useState<AccountType>("business");
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState(false);
  const [floatingModeOpen, setFloatingModeOpen] = useState(false);
  const [mobileFloatingOpen, setMobileFloatingOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const floatingWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroComplete(true), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem("psy-theme");
    setDark(storedTheme === "dark");
    const storedSize = localStorage.getItem("psy-ui-size") as UISize | null;
    if (["compact", "comfortable", "large"].includes(storedSize ?? "")) setUiSize(storedSize!);
    setNotificationsEnabled(localStorage.getItem("psy-notifications") !== "off");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);

    if (!isFirebaseConfigured) {
      setFirebaseState("unconfigured");
      setAuthReady(true);
      setDataReady(true);
      return;
    }

    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const toList = <T extends { id: string }>(snapshot: { docs: Array<{ id: string; data: () => unknown }> }) =>
      snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<T, "id">) } as T));
    let unsubscribers: Array<() => void> = [];
    setPersistence(auth, browserLocalPersistence).catch(() => undefined);

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      setUser(nextUser);
      setUid(nextUser?.uid ?? "");
      setAuthReady(true);
      setAuthError("");
      setDataReady(false);

      if (!nextUser) {
        setOrders([]);
        setCustomers([]);
        setTransactions([]);
        setBills([]);
        setNotes([]);
        setFirebaseState("connecting");
        return;
      }

      const initialized = new Set<string>();
      const markReady = (name: string) => {
        initialized.add(name);
        if (initialized.size === FIRESTORE_COLLECTIONS.length) {
          setFirebaseState("live");
          setDataReady(true);
        }
      };
      const handleError = (error: Error) => {
        console.error("Firestore connection failed", error);
        setFirebaseState("error");
        setDataReady(true);
      };

      setFirebaseState("connecting");
      unsubscribers = [
        onSnapshot(collection(db, "users", nextUser.uid, "orders"), (snapshot) => {
          setOrders(toList<Order>(snapshot).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
          markReady("orders");
        }, handleError),
        onSnapshot(collection(db, "users", nextUser.uid, "customers"), (snapshot) => {
          setCustomers(toList<Customer>(snapshot));
          markReady("customers");
        }, handleError),
        onSnapshot(collection(db, "users", nextUser.uid, "transactions"), (snapshot) => {
          setTransactions(toList<Transaction>(snapshot).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
          markReady("transactions");
        }, handleError),
        onSnapshot(collection(db, "users", nextUser.uid, "bills"), (snapshot) => {
          setBills(toList<Bill>(snapshot).sort((a, b) => a.dueDay - b.dueDay));
          markReady("bills");
        }, handleError),
        onSnapshot(collection(db, "users", nextUser.uid, "notes"), (snapshot) => {
          setNotes(toList<BusinessNote>(snapshot));
          markReady("notes");
        }, handleError),
      ];
    });

    return () => {
      unsubscribeAuth();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("psy-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    document.documentElement.dataset.uiSize = uiSize;
    localStorage.setItem("psy-ui-size", uiSize);
  }, [uiSize]);

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

  const toggleFloatingMode = async () => {
    const controller = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureController }).documentPictureInPicture;
    if (!controller) {
      if (!window.matchMedia("(max-width: 760px)").matches) return showToast("Modo flutuante disponível no Edge ou Chrome atualizado");
      const nextState = !mobileFloatingOpen;
      setMobileFloatingOpen(nextState);
      showToast(nextState ? "Atalho flutuante ativado no celular" : "Atalho flutuante desativado");
      return;
    }
    if (floatingWindowRef.current && !floatingWindowRef.current.closed) {
      floatingWindowRef.current.close();
      floatingWindowRef.current = null;
      setFloatingModeOpen(false);
      return;
    }

    try {
      const floatingWindow = await controller.requestWindow({ width: 230, height: 128 });
      floatingWindowRef.current = floatingWindow;
      floatingWindow.document.title = "PSYZON GO · Acesso rápido";

      const style = floatingWindow.document.createElement("style");
      style.textContent = `
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        body { padding: 10px; background: #071226; font-family: Inter, system-ui, sans-serif; }
        button { width: 100%; height: 100%; padding: 10px 12px; border: 1px solid rgba(96,165,250,.35); border-radius: 16px; background: linear-gradient(145deg,#102753,#0d1d3e); color: white; display: flex; align-items: center; gap: 11px; text-align: left; cursor: pointer; box-shadow: 0 12px 32px rgba(0,0,0,.32); }
        button:hover { border-color: #60a5fa; background: linear-gradient(145deg,#16336a,#102753); }
        img { width: 46px; height: 46px; border-radius: 13px; box-shadow: 0 8px 22px rgba(37,99,235,.35); }
        span { min-width: 0; display: flex; flex-direction: column; }
        b { font-size: 13px; letter-spacing: .035em; }
        small { margin-top: 4px; color: #93c5fd; font-size: 9px; }
      `;
      const launcher = floatingWindow.document.createElement("button");
      launcher.type = "button";
      launcher.setAttribute("aria-label", "Abrir PSYZON GO");
      const logo = floatingWindow.document.createElement("img");
      logo.src = new URL("/icon-192-v3.png", window.location.href).href;
      logo.alt = "";
      const label = floatingWindow.document.createElement("span");
      const title = floatingWindow.document.createElement("b");
      title.textContent = "PSYZON GO";
      const hint = floatingWindow.document.createElement("small");
      hint.textContent = "Clique para abrir o sistema";
      label.append(title, hint);
      launcher.append(logo, label);
      launcher.addEventListener("click", () => window.focus());
      floatingWindow.document.head.append(style);
      floatingWindow.document.body.append(launcher);
      floatingWindow.addEventListener("pagehide", () => {
        floatingWindowRef.current = null;
        setFloatingModeOpen(false);
      });
      setFloatingModeOpen(true);
      showToast("Atalho flutuante ativado");
    } catch {
      showToast("Não foi possível abrir o modo flutuante");
    }
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
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google sign-in failed", error);
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      const messages: Record<string, string> = {
        "auth/unauthorized-domain": "Este endereço ainda não foi autorizado no Firebase. Adicione o domínio em Authentication > Settings > Authorized domains.",
        "auth/operation-not-allowed": "O login com Google ainda não está habilitado no Firebase Authentication.",
        "auth/popup-blocked": "O navegador bloqueou a janela de login. Permita pop-ups para este site e tente novamente.",
        "auth/popup-closed-by-user": "A janela de login foi fechada antes da conclusão. Tente novamente.",
        "auth/network-request-failed": "Não foi possível acessar o Google agora. Verifique sua conexão e tente novamente.",
      };
      setAuthError(messages[code] ?? "Não foi possível entrar. Verifique a configuração do Google no Firebase e tente novamente.");
    }
  };

  const signOutGoogle = async () => {
    if (!isFirebaseConfigured) return;
    await signOut(getAuth(getApps()[0]));
    setView("inicio");
  };

  const resetAllData = async () => {
    if (!uid || !window.confirm("Apagar definitivamente todos os pedidos, clientes, contas, movimentações e anotações desta conta?")) return;
    setResetting(true);
    try {
      const records = [
        ...orders.map((item) => ["orders", item.id] as const),
        ...customers.map((item) => ["customers", item.id] as const),
        ...transactions.map((item) => ["transactions", item.id] as const),
        ...bills.map((item) => ["bills", item.id] as const),
        ...notes.map((item) => ["notes", item.id] as const),
      ];
      for (let start = 0; start < records.length; start += 450) {
        const batch = writeBatch(getFirestore(getApps()[0]));
        records.slice(start, start + 450).forEach(([name, id]) => batch.delete(userDocument(uid, name, id)));
        await batch.commit();
      }
      setOrders([]);
      setCustomers([]);
      setTransactions([]);
      setBills([]);
      setNotes([]);
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

  const notifications = useMemo<AppNotification[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = today.toISOString().slice(0, 7);
    const items: AppNotification[] = [];

    activeOrders.forEach((order) => {
      const due = new Date(`${order.dueDate}T00:00:00`);
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (days < 0) items.push({ id: `order-${order.id}`, title: `Pedido #${order.id} atrasado`, detail: `${order.customer} · ${Math.abs(days)} dia(s) de atraso`, tone: "danger", view: "producao" });
      else if (days <= 2) items.push({ id: `order-${order.id}`, title: days === 0 ? `Pedido #${order.id} vence hoje` : `Pedido #${order.id} próximo do prazo`, detail: `${order.customer} · ${order.product}`, tone: "warning", view: "producao" });
    });

    bills.forEach((bill) => {
      const installmentComplete = bill.billingType === "installment" && (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1);
      const paidThisMonth = bill.lastPaidMonth === month || installmentComplete;
      if (paidThisMonth) return;
      const due = new Date(today.getFullYear(), today.getMonth(), Math.min(bill.dueDay, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()));
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (days < 0) items.push({ id: `bill-${bill.id}`, title: `${bill.description} está vencida`, detail: `${money.format(bill.amount)} · ${Math.abs(days)} dia(s) em atraso`, tone: "danger", view: bill.account === "business" ? "financeiro" : "pessoal" });
      else if (days <= 3) items.push({ id: `bill-${bill.id}`, title: days === 0 ? `${bill.description} vence hoje` : `${bill.description} vence em breve`, detail: `${money.format(bill.amount)} · dia ${bill.dueDay}`, tone: "warning", view: bill.account === "business" ? "financeiro" : "pessoal" });
    });

    return items.sort((a, b) => (a.tone === "danger" ? -1 : 1) - (b.tone === "danger" ? -1 : 1));
  }, [activeOrders, bills]);

  useEffect(() => {
    if (!notificationsEnabled || !dataReady || !notifications.length || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const todayKey = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("psy-last-system-notification") === todayKey) return;
    new Notification("PSYZON GO", { body: `${notifications.length} item(ns) precisam da sua atenção.`, icon: "/icon-192-v3.png" });
    localStorage.setItem("psy-last-system-notification", todayKey);
  }, [dataReady, notifications, notificationsEnabled]);

  const changeNotifications = async (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    localStorage.setItem("psy-notifications", enabled ? "on" : "off");
    if (enabled && typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
  };

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
          notes: String(form.get("notes") || ""),
          createdAt: serverTimestamp(),
        };
        if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
        const db = getFirestore(getApps()[0]);
        const orderReference = doc(userCollection(uid, "orders"));
        const orderKey = orderReference.id;
        const customerKey = nextOrder.customer.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || orderKey;
        const batch = writeBatch(db);
        batch.set(orderReference, nextOrder);
        batch.set(userDocument(uid, "customers", customerKey), { name: nextOrder.customer, phone: nextOrder.phone ?? "" }, { merge: true });
        if (nextOrder.paid > 0) {
          batch.set(doc(userCollection(uid, "transactions")), { description: `Entrada · ${nextOrder.customer} · #${orderKey.slice(0, 5).toUpperCase()}`, amount: nextOrder.paid, type: "income", account: "business", category: "Vendas", orderId: orderKey, transactionDate: localDateValue(), createdAt: serverTimestamp() });
        }
        await batch.commit();
        showToast("Pedido criado e financeiro atualizado");
      } else if (kind === "cliente") {
        const customer = { name: String(form.get("name")), phone: String(form.get("phone")), company: String(form.get("company") || "") };
        if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
        await addDoc(userCollection(uid, "customers"), customer);
        showToast("Cliente adicionado");
      } else if (kind === "conta") {
        const billingType = String(form.get("billingType")) as Bill["billingType"];
        const bill: Omit<Bill, "id"> = {
          description: String(form.get("description")),
          amount: Number(form.get("amount")),
          account: String(form.get("account")) as AccountType,
          billingType,
          dueDay: Number(form.get("dueDay")),
          category: String(form.get("customCategory") || form.get("category") || "Outros"),
          paidInstallments: 0,
          createdAt: serverTimestamp(),
          ...(billingType === "installment" ? { totalInstallments: Number(form.get("totalInstallments")) } : {}),
        };
        if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
        await addDoc(userCollection(uid, "bills"), bill);
        showToast(billingType === "fixed" ? "Conta mensal adicionada" : "Compra parcelada adicionada");
      } else {
        const amount = Number(form.get("amount"));
        const description = String(form.get("description"));
        const transaction: Omit<Transaction, "id"> = {
          description,
          amount,
          type: kind === "entrada" ? "income" : kind === "despesa" ? "expense" : "transfer",
          account: kind === "transferencia" ? "personal" : String(form.get("account")) as AccountType,
          category: String(form.get("customCategory") || form.get("category") || (kind === "entrada" ? "Vendas" : kind === "despesa" ? "Outros" : "Pró-labore")),
          transactionDate: String(form.get("transactionDate") || localDateValue()),
          createdAt: serverTimestamp(),
        };
        if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
        await addDoc(userCollection(uid, "transactions"), transaction);
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
    if (firebaseState === "live") {
      await updateDoc(userDocument(uid, "orders", order.id), { status });
    }
    showToast("Pedido atualizado");
  };

  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingOrder || firebaseState !== "live") return showToast("Firestore ainda não está conectado");
    const form = new FormData(event.currentTarget);
    const updatedOrder = {
      customer: String(form.get("customer")),
      phone: String(form.get("phone") || ""),
      product: String(form.get("product")),
      quantity: Number(form.get("quantity")),
      total: Number(form.get("total")),
      paid: Number(form.get("paid")),
      dueDate: String(form.get("dueDate")),
      status: String(form.get("status")) as OrderStatus,
      notes: String(form.get("notes") || ""),
    };
    const db = getFirestore(getApps()[0]);
    const customerKey = updatedOrder.customer.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || editingOrder.id;
    const linkedPayments = transactions.filter((transaction) => transaction.orderId === editingOrder.id);
    const batch = writeBatch(db);
    batch.update(userDocument(uid, "orders", editingOrder.id), updatedOrder);
    batch.set(userDocument(uid, "customers", customerKey), { name: updatedOrder.customer, phone: updatedOrder.phone }, { merge: true });
    if (updatedOrder.paid > 0) {
      const payment = { description: `Entrada · ${updatedOrder.customer} · #${editingOrder.id.slice(0, 5).toUpperCase()}`, amount: updatedOrder.paid, type: "income", account: "business", category: "Vendas", orderId: editingOrder.id };
      if (linkedPayments[0]) batch.update(userDocument(uid, "transactions", linkedPayments[0].id), payment);
      else batch.set(doc(userCollection(uid, "transactions")), { ...payment, transactionDate: localDateValue(), createdAt: serverTimestamp() });
      linkedPayments.slice(1).forEach((transaction) => batch.delete(userDocument(uid, "transactions", transaction.id)));
    } else {
      linkedPayments.forEach((transaction) => batch.delete(userDocument(uid, "transactions", transaction.id)));
    }
    await batch.commit();
    setEditingOrder(null);
    showToast("Pedido e financeiro atualizados");
  };

  const payBill = async (bill: Bill) => {
    if (firebaseState !== "live") return showToast("Firestore ainda não está conectado");
    const db = getFirestore(getApps()[0]);
    const month = new Date().toISOString().slice(0, 7);
    if (bill.lastPaidMonth === month) return showToast("Esta conta já foi paga neste mês");
    if (bill.billingType === "installment" && (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1)) return showToast("Todas as parcelas já foram pagas");
    const batch = writeBatch(db);
    batch.set(doc(userCollection(uid, "transactions")), { description: `${bill.billingType === "fixed" ? "Conta mensal" : `Parcela ${(bill.paidInstallments ?? 0) + 1}/${bill.totalInstallments}`} · ${bill.description}`, amount: bill.amount, type: "expense", account: bill.account, category: bill.category, source: "bill", billId: bill.id, transactionDate: localDateValue(), createdAt: serverTimestamp() });
    batch.update(userDocument(uid, "bills", bill.id), {
      lastPaidMonth: month,
      ...(bill.billingType === "installment" ? { paidInstallments: (bill.paidInstallments ?? 0) + 1 } : {}),
    });
    await batch.commit();
    showToast("Pagamento registrado");
  };

  const deleteBill = async (bill: Bill) => {
    if (!window.confirm(`Excluir a conta “${bill.description}”?`)) return;
    await deleteDoc(userDocument(uid, "bills", bill.id));
    showToast("Conta removida");
  };

  const saveBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingBill) return;
    const form = new FormData(event.currentTarget);
    const billingType = String(form.get("billingType")) as Bill["billingType"];
    await updateDoc(userDocument(uid, "bills", editingBill.id), {
      description: String(form.get("description")),
      amount: Number(form.get("amount")),
      dueDay: Number(form.get("dueDay")),
      billingType,
      category: String(form.get("customCategory") || form.get("category") || "Outros"),
      totalInstallments: billingType === "installment" ? Number(form.get("totalInstallments")) : deleteField(),
    });
    setEditingBill(null);
    showToast("Conta atualizada");
  };

  const saveTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTransaction) return;
    const form = new FormData(event.currentTarget);
    await updateDoc(userDocument(uid, "transactions", editingTransaction.id), {
      description: String(form.get("description")),
      amount: Number(form.get("amount")),
      category: String(form.get("customCategory") || form.get("category") || "Outros"),
      account: String(form.get("account")) as AccountType,
      type: String(form.get("type")) as Transaction["type"],
      transactionDate: String(form.get("transactionDate") || localDateValue()),
    });
    setEditingTransaction(null);
    showToast("Movimentação atualizada");
  };

  const deleteTransaction = async (transaction: Transaction) => {
    if (!window.confirm(`Excluir a movimentação “${transaction.description}”?`)) return;
    const db = getFirestore(getApps()[0]);
    if (transaction.source === "bill" && transaction.billId) {
      const linkedBill = bills.find((bill) => bill.id === transaction.billId);
      const batch = writeBatch(db);
      batch.delete(userDocument(uid, "transactions", transaction.id));
      batch.update(userDocument(uid, "bills", transaction.billId), {
        lastPaidMonth: deleteField(),
        ...(linkedBill?.billingType === "installment" ? { paidInstallments: Math.max(0, (linkedBill.paidInstallments ?? 1) - 1) } : {}),
      });
      await batch.commit();
    } else {
      await deleteDoc(userDocument(uid, "transactions", transaction.id));
    }
    showToast("Movimentação removida");
  };

  if (!introComplete || !authReady) return <SplashScreen />;
  if (!isFirebaseConfigured) return <ConnectionErrorScreen message="Confira as variáveis NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID e NEXT_PUBLIC_FIREBASE_APP_ID." />;
  if (!user) return <AuthScreenV2 error={authError} onSignIn={signInGoogle} />;
  if (!dataReady) return <SplashScreen />;

  const userName = user.displayName || "Usuário PSYZON";
  const firstName = userName.trim().split(/\s+/)[0] || "Rodrigo";
  const initials = userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const floatingActive = floatingModeOpen || mobileFloatingOpen;

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <button className="brand" onClick={() => setView("inicio")} aria-label="Ir para o início">
            <Image className="brand-mark" src="/icon-192-v3.png" alt="" width={34} height={34} priority />
            <span><b>PSYZON</b><small>GO</small></span>
          </button>
          <button className="sidebar-collapse-button" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Abrir menu lateral" : "Fechar menu lateral"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        </div>
        <nav>
          {navGroups.map((group) => <div className="nav-group" key={group.label}><small>{group.label}</small>{group.items.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}</div>)}
        </nav>
        <div className={`sync-status ${firebaseState}`}><span /><b>{firebaseState === "live" ? "Firebase em tempo real" : firebaseState === "connecting" ? "Conectando…" : "Erro de sincronização"}</b></div>
        <button className="profile" onClick={() => setView("mais")}><span>{initials}</span><span><b>{userName}</b><small>{user.email}</small></span><ChevronRight size={15} /></button>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-logo" onClick={() => setView("inicio")} aria-label="Ir para o início"><Image className="brand-mark" src="/icon-192-v3.png" alt="" width={29} height={29} priority /><b>PSYZON</b></button>
          <div className="search-wrap">
            <Search size={18} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, pedido ou produto…" aria-label="Busca global" />
            <kbd>/</kbd>
            {!!searchResults.length && <div className="search-results">{searchResults.map((order) => <button key={order.id} onClick={() => { setView("producao"); setSearch(""); }}><span><b>{order.customer}</b><small>Pedido #{order.id} · {order.product}</small></span><strong>{displayMoney(order.total - order.paid)}<small>pendente</small></strong></button>)}</div>}
          </div>
          <div className="top-actions">
            <button className={`floating-mode-action ${floatingActive ? "active" : ""}`} onClick={toggleFloatingMode} aria-label={floatingActive ? "Desativar modo flutuante" : "Ativar modo flutuante"} aria-pressed={floatingActive}><PictureInPicture2 size={18} /><span>{floatingActive ? "Flutuante ativo" : "Modo flutuante"}</span></button>
            <button className="desktop-action" onClick={() => setPrivateValues((value) => !value)} aria-label="Ocultar valores">{privateValues ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            <button className="desktop-action" onClick={() => setDark((value) => !value)} aria-label="Alternar tema">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
            <button className="notification" onClick={() => setNotificationsOpen((value) => !value)} aria-label={`${notifications.length} notificações`} aria-expanded={notificationsOpen}><Bell size={19} />{!!notifications.length && <span>{notifications.length > 9 ? "9+" : notifications.length}</span>}</button>
            {notificationsOpen && <div className="notification-panel"><header><div><b>Notificações</b><small>{notifications.length ? `${notifications.length} item(ns) precisam de atenção` : "Tudo em dia por aqui"}</small></div><button onClick={() => setNotificationsOpen(false)} aria-label="Fechar notificações"><X size={16} /></button></header><div>{notifications.length ? notifications.map((item) => <button className="notification-item" key={item.id} onClick={() => { setView(item.view); setNotificationsOpen(false); }}><span className={item.tone}>{item.tone === "danger" ? <AlertTriangle size={15} /> : <Bell size={15} />}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={15} /></button>) : <div className="notification-empty"><Check size={20} /><b>Nenhuma pendência próxima</b><small>Pedidos e contas aparecerão aqui.</small></div>}</div></div>}
          </div>
        </header>

        <section className="content">
          {view === "inicio" && <Dashboard userName={firstName} orders={activeOrders} transactions={businessTransactions} businessBalance={businessBalance} businessIncome={businessIncome} businessExpense={businessExpense} pending={pending} personalBalance={personalBalance} overdue={overdue} urgent={urgent} displayMoney={displayMoney} setModal={(kind: CreateKind) => openCreate(kind, "business")} setView={setView} updateStatus={updateStatus} />}
          {view === "producao" && <Production orders={activeOrders} board={board} setBoard={setBoard} displayMoney={displayMoney} updateStatus={updateStatus} editOrder={setEditingOrder} />}
          {view === "notas" && <NotesWorkspace uid={uid} notes={notes} />}
          {view === "clientes" && <Customers customers={derivedCustomers} orders={orders} displayMoney={displayMoney} setModal={(kind: CreateKind) => openCreate(kind, "business")} />}
          {view === "financeiro" && <Finance transactions={businessTransactions} bills={bills.filter((bill) => bill.account === "business")} orders={activeOrders} businessBalance={businessBalance} businessIncome={businessIncome} businessExpense={businessExpense} pending={pending} displayMoney={displayMoney} openCreate={(kind: CreateKind) => openCreate(kind, "business")} payBill={payBill} deleteBill={deleteBill} editBill={setEditingBill} editTransaction={setEditingTransaction} deleteTransaction={deleteTransaction} />}
          {view === "pessoal" && <PersonalFinance transactions={personalTransactions} bills={bills.filter((bill) => bill.account === "personal")} balance={personalBalance} income={personalIncome} expense={personalExpense} displayMoney={displayMoney} openCreate={(kind: CreateKind) => openCreate(kind, "personal")} payBill={payBill} deleteBill={deleteBill} editBill={setEditingBill} editTransaction={setEditingTransaction} deleteTransaction={deleteTransaction} />}
          {view === "mais" && <MoreView firebaseState={firebaseState} dark={dark} setDark={setDark} privateValues={privateValues} setPrivateValues={setPrivateValues} uiSize={uiSize} setUiSize={setUiSize} notificationsEnabled={notificationsEnabled} setNotificationsEnabled={changeNotifications} user={user} onSignOut={signOutGoogle} onReset={resetAllData} resetting={resetting} />}
        </section>
      </main>

      {view !== "notas" && <button className="floating-new" onClick={() => setModal("pedido")}><Plus size={21} /> <span>Novo</span></button>}
      {mobileFloatingOpen && <button className="mobile-floating-launcher" onClick={() => { setView("inicio"); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Abrir início do PSYZON GO"><Image src="/icon-192-v3.png" alt="" width={40} height={40} /><span>Início</span></button>}
      <nav className="mobile-nav">
        {mobileNavItems.slice(0, 2).map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
        <button className="mobile-new" onClick={() => setModal("pedido")} aria-label="Novo pedido"><Plus /></button>
        {mobileNavItems.slice(2).map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
      </nav>

      {modal && <CreateModalV2 kind={modal} account={modalAccount} setKind={setModal} close={() => setModal(null)} onSubmit={submitCreate} />}
      {editingOrder && <OrderEditModal order={editingOrder} close={() => setEditingOrder(null)} onSubmit={saveOrder} />}
      {editingBill && <FinancialEditModal bill={editingBill} close={() => setEditingBill(null)} onSubmit={saveBill} />}
      {editingTransaction && <FinancialEditModal transaction={editingTransaction} close={() => setEditingTransaction(null)} onSubmit={saveTransaction} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function SplashScreen() {
  return (
    <main className="splash-screen" aria-label="PSYZON GO carregando" aria-busy="true">
      <div className="splash-orbit splash-orbit-one" />
      <div className="splash-orbit splash-orbit-two" />
      <section className="splash-content">
        <div className="splash-logo-wrap">
          <span className="splash-logo-glow" />
          <img src="/icon-512-v3.png" width="164" height="164" alt="Logo PSYZON GO" className="splash-logo" />
        </div>
        <div className="splash-wordmark"><strong>PSYZON</strong><span>GO</span></div>
        <p>Produção e financeiro em tempo real</p>
        <div className="splash-loader" aria-hidden="true"><span /></div>
        <small>Preparando sua operação</small>
      </section>
    </main>
  );
}

function ConnectionErrorScreen({ message }: { message: string }) {
  return <main className="auth-screen auth-screen-v2"><section className="auth-shell"><div className="auth-showcase"><div className="auth-logo"><img src="/icon-192-v3.png" width="54" height="54" alt="PSYZON GO" /><span><b>PSYZON</b><small>GO</small></span></div><div className="auth-message"><span className="auth-kicker">GESTÃO QUE ACOMPANHA SUA PRODUÇÃO</span><h1>Controle a empresa.<br />Sem perder o ritmo.</h1><p>Pedidos, clientes, produção e financeiro trabalhando juntos em uma visão simples.</p></div><div className="auth-benefits"><span><Check size={15} /><b>Dados centralizados</b></span><span><Check size={15} /><b>Sincronização em tempo real</b></span><span><Check size={15} /><b>Custos e prazos sob controle</b></span></div></div><div className="auth-access"><div><span className="auth-kicker">CONFIGURAÇÃO DO FIRESTORE</span><h2>Não foi possível abrir os dados.</h2><p>{message}</p></div><button className="google-button" onClick={() => window.location.reload()}><RotateCcw size={17} /><b>Tentar novamente</b></button><div className="auth-security"><span><span /></span><div><b>Cloud Firestore</b><small>O login Google foi removido nesta etapa.</small></div></div><small className="auth-version">PSYZON COMPANY · OPERAÇÃO EM TEMPO REAL</small></div></section></main>;
}

function AuthScreenV2({ error, onSignIn }: { error: string; onSignIn: () => void }) {
  return <main className="auth-screen auth-screen-v2"><section className="auth-shell"><div className="auth-showcase"><div className="auth-logo"><img src="/icon-192-v3.png" width="54" height="54" alt="PSYZON GO" /><span><b>PSYZON</b><small>GO</small></span></div><div className="auth-message"><span className="auth-kicker">GESTÃO QUE ACOMPANHA SUA PRODUÇÃO</span><h1>Controle a empresa.<br />Sem perder o ritmo.</h1><p>Pedidos, clientes, produção e financeiro trabalhando juntos em uma visão simples.</p></div><div className="auth-benefits"><span><Check size={15} /><b>Dados privados por conta</b></span><span><Check size={15} /><b>Sincronização em tempo real</b></span><span><Check size={15} /><b>Custos e prazos sob controle</b></span></div></div><div className="auth-access"><div><span className="auth-kicker">ACESSO SEGURO</span><h2>Bem-vindo ao seu centro de operação.</h2><p>Entre com sua conta Google para acessar seus dados no Firestore.</p></div><button className="google-button" onClick={onSignIn}><span>G</span><b>Continuar com Google</b><ChevronRight size={17} /></button>{error && <p className="auth-error" role="alert">{error}</p>}<div className="auth-security"><span><span /></span><div><b>Conexão protegida</b><small>Seus dados ficam vinculados somente à sua conta.</small></div></div><small className="auth-version">PSYZON COMPANY · OPERAÇÃO EM TEMPO REAL</small></div></section></main>;
}


function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={active ? "active" : ""} onClick={onClick} title={item.label} aria-label={item.label}><Icon size={20} /><span>{item.label}</span></button>;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function transactionDate(transaction: Transaction) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(transaction.transactionDate ?? "")) {
    return new Date(`${transaction.transactionDate}T12:00:00`);
  }
  const value = transaction.createdAt;
  if (typeof value === "number" || typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (value && typeof value === "object") {
    const firestoreValue = value as { toDate?: () => Date; seconds?: number };
    if (typeof firestoreValue.toDate === "function") return firestoreValue.toDate();
    if (typeof firestoreValue.seconds === "number") return new Date(firestoreValue.seconds * 1000);
  }
  return new Date();
}

function transactionMonth(transaction: Transaction) {
  const date = transactionDate(transaction);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Dashboard({ userName, orders, transactions, businessBalance, businessIncome, businessExpense, pending, personalBalance, overdue, urgent, displayMoney, setModal, setView, updateStatus }: any) {
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">VISÃO DE HOJE</span><div className="greeting-row"><h1>Bom dia, {userName}.</h1><button className="notes-entry-button" onClick={() => setView("notas")}><NotebookPen size={16} /> Bloco de notas</button></div><p>{date.charAt(0).toUpperCase() + date.slice(1)} · Tudo sob controle.</p></div>
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

function Production({ orders, board, setBoard, displayMoney, updateStatus, editOrder }: any) {
  const statuses: OrderStatus[] = ["Aguardando material", "Produção", "Finalização", "Pronto"];
  return <><div className="page-heading compact"><div><span className="eyebrow">OPERAÇÃO</span><h1>Produção</h1><p>{orders.length} pedidos ativos · prazos em primeiro lugar</p></div><div className="view-toggle"><button className={!board ? "active" : ""} onClick={() => setBoard(false)}><List size={17} /> Lista</button><button className={board ? "active" : ""} onClick={() => setBoard(true)}><LayoutGrid size={17} /> Kanban</button></div></div><div className="filter-row"><button className="active">Todos <span>{orders.length}</span></button><button>Hoje</button><button>Esta semana</button><button>Atrasados</button><button>Prontos</button></div>{board ? <div className="kanban">{statuses.map((status) => <div className="kanban-column" key={status}><div className="kanban-title"><span className={`status-dot s-${statusProgress[status]}`} />{status}<b>{orders.filter((o: Order) => o.status === status).length}</b></div>{orders.filter((o: Order) => o.status === status).map((order: Order) => <OrderCard key={order.id} order={order} displayMoney={displayMoney} updateStatus={updateStatus} editOrder={editOrder} />)}</div>)}</div> : <section className="panel order-table"><div className="table-head"><span>Pedido / cliente</span><span>Produto</span><span>Prazo</span><span>Status</span><span>Valor</span><span>Ações</span></div>{orders.map((order: Order) => <div className="table-row" key={order.id}><span><b>#{order.id} · {order.customer}</b><small>{order.quantity} unidades</small></span><span>{order.product}</span><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><span><select value={order.status} onChange={(event) => updateStatus(order, event.target.value as OrderStatus)}>{Object.keys(statusProgress).map((status) => <option key={status}>{status}</option>)}</select></span><span><b>{displayMoney(order.total)}</b><small>{displayMoney(order.total - order.paid)} pendente</small></span><button className="order-edit" onClick={() => editOrder(order)} aria-label={`Editar pedido de ${order.customer}`} title="Editar pedido"><Pencil size={15} /></button></div>)}</section>}</>;
}

function OrderCard({ order, displayMoney, updateStatus, editOrder }: { order: Order; displayMoney: (value: number) => string; updateStatus: (order: Order, status: OrderStatus) => void; editOrder: (order: Order) => void }) {
  return <article className="order-card"><div><span>#{order.id}</span><button onClick={() => editOrder(order)} aria-label={`Editar pedido de ${order.customer}`} title="Editar pedido"><Pencil size={15} /></button></div><h3>{order.customer}</h3><p>{order.quantity} × {order.product}</p><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><div className="progress-line"><span style={{ width: `${statusProgress[order.status]}%` }} /></div><footer><span><small>Pendente</small><b>{displayMoney(order.total - order.paid)}</b></span>{order.status === "Pronto" ? <a href={`https://wa.me/${order.phone}?text=${encodeURIComponent(`Olá, ${order.customer}. Seu pedido da PSYZON ficou pronto e já está disponível para retirada/entrega.`)}`} target="_blank"><MessageCircle size={16} /> Avisar</a> : <button onClick={() => updateStatus(order, order.status === "Produção" ? "Finalização" : "Produção")}>Avançar <ChevronRight size={15} /></button>}</footer></article>;
}

function Customers({ customers, orders, displayMoney, setModal }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">RELACIONAMENTO</span><h1>Clientes</h1><p>Cadastro simples e histórico em um só lugar.</p></div><button className="primary" onClick={() => setModal("cliente")}><Plus size={18} /> Novo cliente</button></div><div className="customer-grid">{customers.map((customer: Customer) => { const clientOrders = orders.filter((order: Order) => order.customer === customer.name); const total = clientOrders.reduce((sum: number, order: Order) => sum + order.total, 0); const pending = clientOrders.reduce((sum: number, order: Order) => sum + order.total - order.paid, 0); return <article className="customer-card" key={customer.id}><div className="customer-card-top"><span className="avatar large">{customer.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><h3>{customer.name}</h3><p>{customer.company || customer.phone || "Cliente PSYZON"}</p></div><button><MoreHorizontal size={18} /></button></div><div className="customer-stats"><span><small>Total comprado</small><b>{displayMoney(total)}</b></span><span><small>Saldo pendente</small><b className={pending ? "negative" : "positive"}>{displayMoney(pending)}</b></span></div><footer><span>{clientOrders.length} {clientOrders.length === 1 ? "pedido" : "pedidos"}</span><a href={`https://wa.me/${customer.phone}`} target="_blank"><MessageCircle size={16} /> WhatsApp</a></footer></article>; })}</div></>;
}

function Finance({ transactions, bills, orders, businessBalance, businessIncome, businessExpense, pending, displayMoney, openCreate, payBill, deleteBill, editBill, editTransaction, deleteTransaction }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">FINANCEIRO EMPRESARIAL</span><h1>Dinheiro da empresa.</h1><p>Caixa, contas e compromissos da operação.</p></div><button className="primary" onClick={() => openCreate("entrada")}><Plus size={18} /> Movimentação</button></div><div className="account-grid single"><article className="account-card business"><div><span><BriefcaseBusiness size={19} /> EMPRESA</span><small>Saldo disponível</small><strong>{displayMoney(businessBalance)}</strong></div><div className="account-stats"><span><small>Entradas</small><b className="positive">{displayMoney(businessIncome)}</b></span><span><small>Saídas</small><b>{displayMoney(businessExpense)}</b></span><span><small>A receber</small><b>{displayMoney(pending)}</b></span></div></article></div><CostPerPiece orders={orders} transactions={transactions} bills={bills} displayMoney={displayMoney} /><BillsPanel bills={bills} account="business" displayMoney={displayMoney} openCreate={openCreate} payBill={payBill} deleteBill={deleteBill} editBill={editBill} /><MonthlyHistory transactions={transactions} displayMoney={displayMoney} openCreate={openCreate} onEdit={editTransaction} onDelete={deleteTransaction} /></>;
}

function CostPerPiece({ orders, transactions, bills, displayMoney }: { orders: Order[]; transactions: Transaction[]; bills: Bill[]; displayMoney: (value: number) => string }) {
  const month = localDateValue().slice(0, 7);
  const units = orders.reduce((sum, order) => sum + Math.max(0, order.quantity), 0);
  const monthlyExpenses = transactions.filter((transaction) => {
    if (transaction.type !== "expense" || transaction.source === "bill") return false;
    return transactionMonth(transaction) === month;
  });
  const directCosts = monthlyExpenses.reduce((totals, item) => {
    const category = (item.category ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (category.includes("material") || category.includes("materia-prima")) totals.materials += item.amount;
    else if (category.includes("fornecedor") || category.includes("terceir")) totals.suppliers += item.amount;
    else if (category.includes("mao de obra") || category.includes("salario") || category.includes("equipe")) totals.labor += item.amount;
    else totals.other += item.amount;
    return totals;
  }, { materials: 0, suppliers: 0, labor: 0, other: 0 });
  const { materials, suppliers, labor, other: otherVariable } = directCosts;
  const fixed = bills.filter((bill) => bill.billingType === "fixed" || (bill.paidInstallments ?? 0) < (bill.totalInstallments ?? 1)).reduce((sum, bill) => sum + bill.amount, 0);
  const totalCost = fixed + materials + suppliers + labor + otherVariable;
  const costPerPiece = units ? totalCost / units : 0;
  const averageSale = units ? orders.reduce((sum, order) => sum + order.total, 0) / units : 0;
  const estimatedMargin = averageSale - costPerPiece;
  const breakdown = [
    { label: "Fixos e parcelas", value: fixed },
    { label: "Materiais", value: materials },
    { label: "Fornecedores", value: suppliers },
    { label: "Mão de obra", value: labor },
    { label: "Outras saídas", value: otherVariable },
  ];

  return <section className="panel cost-panel"><div className="cost-panel-head"><div className="cost-icon"><Calculator size={20} /></div><div><span className="eyebrow">CUSTO REAL SIMPLIFICADO</span><h2>Quanto cada peça precisa pagar</h2><p>Rateio automático das contas do mês e saídas categorizadas entre as unidades dos pedidos ativos.</p></div></div><div className="cost-highlights"><article><small>Custo estimado por peça</small><strong>{units ? displayMoney(costPerPiece) : "Cadastre unidades"}</strong><span>{units} unidade(s) em produção</span></article><article><small>Venda média por peça</small><strong>{displayMoney(averageSale)}</strong><span>Com base nos pedidos ativos</span></article><article className={estimatedMargin >= 0 ? "healthy" : "attention"}><small>Margem estimada por peça</small><strong>{displayMoney(estimatedMargin)}</strong><span>{estimatedMargin >= 0 ? "Acima do custo calculado" : "Preço abaixo do custo"}</span></article></div><div className="cost-breakdown">{breakdown.map((item) => <div key={item.label}><span><b>{item.label}</b><small>{displayMoney(item.value)}</small></span><div><span style={{ width: `${totalCost ? Math.max(2, (item.value / totalCost) * 100) : 0}%` }} /></div></div>)}</div><footer><AlertTriangle size={15} /><span>Para um cálculo mais fiel, categorize toda saída como Material, Fornecedor ou Mão de obra. Contas fixas e parcelas entram automaticamente.</span></footer></section>;
}

function PersonalFinance({ transactions, bills, balance, income, expense, displayMoney, openCreate, payBill, deleteBill, editBill, editTransaction, deleteTransaction }: any) {
  return <><div className="page-heading compact"><div><span className="eyebrow">FINANCEIRO PESSOAL</span><h1>Sua vida financeira.</h1><p>Categorias e histórico separados da empresa, como deve ser.</p></div><button className="primary personal-action" onClick={() => openCreate("entrada")}><Plus size={18} /> Movimentação pessoal</button></div><div className="account-grid single"><article className="account-card personal"><div><span><UserRound size={19} /> PESSOAL</span><small>Saldo pessoal</small><strong>{displayMoney(balance)}</strong></div><div className="account-stats"><span><small>Entradas + transferências</small><b className="positive">{displayMoney(income)}</b></span><span><small>Despesas pessoais</small><b>{displayMoney(expense)}</b></span></div></article></div><BillsPanel bills={bills} account="personal" displayMoney={displayMoney} openCreate={openCreate} payBill={payBill} deleteBill={deleteBill} editBill={editBill} /><div className="personal-actions"><button className="secondary" onClick={() => openCreate("entrada")}><TrendingUp size={16} /> Nova entrada</button><button className="secondary" onClick={() => openCreate("despesa")}><TrendingDown size={16} /> Nova despesa</button></div><div className="personal-finance-grid"><PersonalCategoryChart transactions={transactions} displayMoney={displayMoney} /><MonthlyHistory transactions={transactions} displayMoney={displayMoney} openCreate={openCreate} personal onEdit={editTransaction} onDelete={deleteTransaction} /></div></>;
}

function BillsPanel({ bills, account, displayMoney, openCreate, payBill, deleteBill, editBill }: { bills: Bill[]; account: AccountType; displayMoney: (value: number) => string; openCreate: (kind: CreateKind) => void; payBill: (bill: Bill) => void; deleteBill: (bill: Bill) => void; editBill: (bill: Bill) => void }) {
  const month = new Date().toISOString().slice(0, 7);
  const pendingTotal = bills.reduce((sum, bill) => {
    const paid = bill.lastPaidMonth === month || (bill.billingType === "installment" && (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1));
    return sum + (paid ? 0 : bill.amount);
  }, 0);
  return <section className="panel bills-panel"><div className="section-title"><div><CalendarClock size={18} /><div><h2>Contas fixas e parceladas</h2><span>{bills.length} cadastradas · {displayMoney(pendingTotal)} neste mês</span></div></div><button onClick={() => openCreate("conta")}><Plus size={15} /> Nova conta</button></div><div className="bill-list">{bills.length === 0 ? <div className="empty-finance"><CalendarClock size={24} /><b>Nenhuma conta cadastrada</b><small>Adicione aluguel, internet, cartão ou compras parceladas.</small><button onClick={() => openCreate("conta")}>Cadastrar primeira conta</button></div> : bills.map((bill) => { const installment = bill.billingType === "installment"; const paid = bill.lastPaidMonth === month || (installment && (bill.paidInstallments ?? 0) >= (bill.totalInstallments ?? 1)); const progress = installment ? Math.min(100, ((bill.paidInstallments ?? 0) / (bill.totalInstallments ?? 1)) * 100) : paid ? 100 : 0; return <article className={`bill-row ${paid ? "paid" : ""}`} key={bill.id}><div className="bill-date"><small>VENCE</small><b>{String(bill.dueDay).padStart(2, "0")}</b></div><div className="bill-info"><span><b>{bill.description}</b><small>{bill.category} · {installment ? `${bill.paidInstallments ?? 0}/${bill.totalInstallments} parcelas pagas` : "Mensal fixa"}</small></span>{installment && <div className="bill-progress"><span style={{ width: `${progress}%` }} /></div>}</div><strong>{displayMoney(bill.amount)}<small>{paid ? "PAGO" : account === "business" ? "EMPRESA" : "PESSOAL"}</small></strong><button className="bill-pay" onClick={() => payBill(bill)} disabled={paid}>{paid ? "Pago" : "Pagar"}</button><button className="bill-edit" onClick={() => editBill(bill)} aria-label={`Editar ${bill.description}`}><Pencil size={14} /></button><button className="bill-delete" onClick={() => deleteBill(bill)} aria-label={`Excluir ${bill.description}`}><Trash2 size={15} /></button></article>; })}</div></section>;
}

function PersonalCategoryChart({ transactions, displayMoney }: { transactions: Transaction[]; displayMoney: (value: number) => string }) {
  const currentMonth = localDateValue().slice(0, 7);
  const months = useMemo(() => [...new Set([currentMonth, ...transactions.map(transactionMonth)])].sort().reverse(), [transactions, currentMonth]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const palette = ["#7c3aed", "#2563eb", "#0ea5e9", "#14b8a6", "#f59e0b", "#f97316", "#ec4899", "#64748b"];
  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.filter((item) => item.type === "expense" && transactionMonth(item) === selectedMonth).forEach((item) => {
      const category = item.category || "Outros";
      totals.set(category, (totals.get(category) ?? 0) + item.amount);
    });
    return [...totals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [selectedMonth, transactions]);
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const segments = categories.map((item, index) => {
    const start = cursor;
    cursor += total ? (item.value / total) * 100 : 0;
    return `${palette[index % palette.length]} ${start}% ${cursor}%`;
  });
  const chartBackground = total ? `conic-gradient(${segments.join(", ")})` : "conic-gradient(var(--border) 0 100%)";

  return <section className="panel category-chart"><div className="insight-heading"><div><span className="eyebrow">PESSOAL</span><h2>Gastos por categoria</h2></div><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="Mês do gráfico de gastos">{months.map((month) => <option key={month} value={month}>{monthTitle(month)}</option>)}</select></div>{total ? <div className="category-chart-body"><div className="donut-chart" style={{ background: chartBackground }}><div><small>Total gasto</small><strong>{displayMoney(total)}</strong></div></div><div className="category-legend">{categories.map((item, index) => <div key={item.label}><span className="legend-dot" style={{ background: palette[index % palette.length] }} /><span><b>{item.label}</b><small>{Math.round((item.value / total) * 100)}% do total</small></span><strong>{displayMoney(item.value)}</strong></div>)}</div></div> : <div className="empty-chart"><CircleDollarSign size={24} /><b>Nenhum gasto neste mês</b><small>As despesas pessoais aparecerão aqui por categoria.</small></div>}</section>;
}

function MonthlyHistory({ transactions, displayMoney, openCreate, personal = false, onEdit, onDelete }: { transactions: Transaction[]; displayMoney: (value: number) => string; openCreate: (kind: CreateKind) => void; personal?: boolean; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void }) {
  const currentMonth = localDateValue().slice(0, 7);
  const months = useMemo(() => [...new Set([currentMonth, ...transactions.map(transactionMonth)])].sort().reverse(), [transactions, currentMonth]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const selectedTransactions = useMemo(() => transactions.filter((item) => transactionMonth(item) === selectedMonth).sort((a, b) => transactionDate(b).getTime() - transactionDate(a).getTime()), [selectedMonth, transactions]);
  const incoming = selectedTransactions.filter((item) => item.type === "income" || (personal && item.type === "transfer")).reduce((sum, item) => sum + item.amount, 0);
  const outgoing = selectedTransactions.filter((item) => item.type === "expense" || (!personal && item.type === "transfer")).reduce((sum, item) => sum + item.amount, 0);

  return <section className="panel monthly-history"><div className="history-heading"><div><span className="eyebrow">HISTÓRICO MENSAL</span><h2>Entradas e saídas por mês</h2></div><select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="Selecionar mês do histórico">{months.map((month) => <option key={month} value={month}>{monthTitle(month)}</option>)}</select></div><div className="month-summary"><span><small>Entradas</small><b className="positive">+ {displayMoney(incoming)}</b></span><span><small>Saídas</small><b className="negative">− {displayMoney(outgoing)}</b></span><span><small>Resultado</small><b className={incoming - outgoing >= 0 ? "positive" : "negative"}>{displayMoney(incoming - outgoing)}</b></span></div><div className="history-actions"><span>{selectedTransactions.length} {selectedTransactions.length === 1 ? "movimentação" : "movimentações"} em {monthTitle(selectedMonth).toLocaleLowerCase("pt-BR")}</span><div><button onClick={() => openCreate("entrada")}>+ Entrada</button><button onClick={() => openCreate("despesa")}>+ Saída</button>{!personal && <button onClick={() => openCreate("transferencia")}>Transferir</button>}</div></div><div className="history-list">{selectedTransactions.length === 0 ? <div className="empty-movements">Nenhuma movimentação registrada neste mês.</div> : selectedTransactions.map((item) => { const incomingItem = item.type === "income" || (personal && item.type === "transfer"); return <div className="movement" key={item.id}><span className={incomingItem ? "income" : "expense"}><span>{incomingItem ? "+" : "−"}</span></span><div><b>{item.description}</b><small>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(transactionDate(item))} · {item.category || (item.type === "transfer" ? "Transferência" : "Sem categoria")}</small></div><strong className={incomingItem ? "positive" : "negative"}>{incomingItem ? "+ " : "− "}{displayMoney(item.amount)}</strong><div className="movement-actions"><button onClick={() => onEdit(item)} aria-label={`Editar ${item.description}`}><Pencil size={14} /></button><button onClick={() => onDelete(item)} aria-label={`Excluir ${item.description}`}><Trash2 size={14} /></button></div></div>; })}</div></section>;
}

function MoreView({ firebaseState, dark, setDark, privateValues, setPrivateValues, uiSize, setUiSize, notificationsEnabled, setNotificationsEnabled, user, onSignOut, onReset, resetting }: any) {
  const sizes: { value: UISize; label: string; hint: string }[] = [
    { value: "compact", label: "Menor", hint: "Mais conteúdo" },
    { value: "comfortable", label: "Normal", hint: "Equilibrado" },
    { value: "large", label: "Maior", hint: "Mais legível" },
  ];
  return <><div className="page-heading compact"><div><span className="eyebrow">PREFERÊNCIAS</span><h1>Configurações</h1><p>Conta, alertas, aparência e dados do PSYZON GO.</p></div></div><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Settings size={20} /></div><div><h3>Aparência e privacidade</h3><p>Ajuste a interface sem complicar sua rotina.</p></div><label><span><b>Tema escuro</b><small>Mais confortável à noite</small></span><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} /></label><label><span><b>Ocultar valores</b><small>Privacidade perto de clientes</small></span><input type="checkbox" checked={privateValues} onChange={(event) => setPrivateValues(event.target.checked)} /></label><div className="interface-size"><span><b>Tamanho da interface</b><small>Aumente ou diminua sem usar zoom do navegador</small></span><div>{sizes.map((size) => <button key={size.value} className={uiSize === size.value ? "active" : ""} onClick={() => setUiSize(size.value)}><b>{size.label}</b><small>{size.hint}</small></button>)}</div></div></section><section className="panel settings-card"><div className="settings-icon"><Bell size={20} /></div><div><h3>Alertas importantes</h3><p>Pedidos próximos do prazo e contas a vencer.</p></div><label><span><b>Notificações do sistema</b><small>Um resumo diário, sem excesso de avisos</small></span><input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} /></label><div className="settings-note"><AlertTriangle size={16} /><span>Os alertas continuam disponíveis no sino mesmo se as notificações do dispositivo estiverem desligadas.</span></div></section><section className="panel settings-card settings-data"><div className="settings-icon"><BriefcaseBusiness size={20} /></div><div><h3>Dados e sincronização</h3><p>Seus registros protegidos e centralizados no Cloud Firestore.</p></div><div className={`connection-box ${firebaseState}`}><span /><div><b>{firebaseState === "live" ? "Firestore conectado" : firebaseState === "error" ? "Falha na sincronização" : "Conectando ao Firestore"}</b><small>{firebaseState === "live" ? "Alterações sincronizadas em tempo real" : "Verificando a conexão com os dados"}</small></div></div><div className="account-row"><span><b>{user.displayName || "Conta Google"}</b><small>{user.email}</small></span><button className="secondary" onClick={onSignOut}><LogOut size={16} /> Sair</button></div><div className="danger-zone"><div><b>Resetar todos os dados</b><small>Apaga pedidos, clientes, contas e movimentações desta conta.</small></div><button className="danger-button" onClick={onReset} disabled={resetting}><RotateCcw size={16} /> {resetting ? "Apagando…" : "Resetar tudo"}</button></div></section></div></>;
}

const businessExpenseCategories = ["Material", "Fornecedor", "Mão de obra", "Impostos", "Equipamentos", "Serviços", "Software", "Frete", "Outros"];
const businessIncomeCategories = ["Vendas", "Serviços", "Sinal de cliente", "Outros"];
const businessBillCategories = ["Estrutura", "Energia e internet", "Equipamentos", "Impostos", "Fornecedor", "Mão de obra", "Software", "Outros"];
const personalExpenseCategories = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Assinaturas", "Compras pessoais", "Outros"];
const personalIncomeCategories = ["Salário", "Freelance", "Rendimentos", "Reembolso", "Presente", "Outros"];
const personalBillCategories = ["Moradia", "Energia e internet", "Cartão de crédito", "Saúde", "Educação", "Assinaturas", "Compras pessoais", "Outros"];

function CategoryFields({ options, defaultCategory }: { options: string[]; defaultCategory?: string }) {
  const known = defaultCategory && options.includes(defaultCategory);
  return <><label className="full">Categoria<select name="category" defaultValue={known ? defaultCategory : options[0]}>{options.map((option) => <option key={option}>{option}</option>)}</select></label><label className="full">Categoria personalizada <span>(opcional)</span><input name="customCategory" defaultValue={defaultCategory && !known ? defaultCategory : ""} placeholder="Ex.: Software, frete ou manutenção" /></label></>;
}

function CreateModalV2({ kind, account, setKind, close, onSubmit }: { kind: CreateKind; account: AccountType; setKind: (kind: CreateKind) => void; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const titles: Record<CreateKind, string> = { pedido: "Novo pedido", cliente: "Novo cliente", entrada: "Nova entrada", despesa: "Nova despesa", transferencia: "Transferir para pessoal", conta: "Nova conta recorrente" };
  const financeKind = ["entrada", "despesa", "transferencia", "conta"].includes(kind);
  const expenseOptions = account === "personal" ? personalExpenseCategories : businessExpenseCategories;
  const incomeOptions = account === "personal" ? personalIncomeCategories : businessIncomeCategories;
  const recurringOptions = account === "personal" ? personalBillCategories : businessBillCategories;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal"><header><div><span className="eyebrow">CADASTRO RÁPIDO</span><h2>{titles[kind]}</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><div className="create-tabs"><button className={kind === "pedido" ? "active" : ""} onClick={() => setKind("pedido")}>Pedido</button><button className={kind === "cliente" ? "active" : ""} onClick={() => setKind("cliente")}>Cliente</button><button className={kind === "entrada" ? "active" : ""} onClick={() => setKind("entrada")}>Entrada</button><button className={kind === "despesa" ? "active" : ""} onClick={() => setKind("despesa")}>Despesa</button><button className={kind === "conta" ? "active" : ""} onClick={() => setKind("conta")}>Conta</button></div><form onSubmit={onSubmit}>{financeKind && <><input type="hidden" name="account" value={account} /><div className={`account-context ${account}`}><span>{account === "business" ? <BriefcaseBusiness size={15} /> : <UserRound size={15} />}</span><div><small>LANÇAMENTO EM</small><b>{account === "business" ? "Financeiro empresarial" : "Financeiro pessoal"}</b></div></div></>}{kind === "pedido" ? <><label className="full">Cliente<input name="customer" required autoFocus placeholder="Nome do cliente" /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" placeholder="55 71 99999-0000" /></label><label className="full">Produto<input name="product" required placeholder="Ex.: Camisetas personalizadas" /></label><div className="form-row"><label>Quantidade<input name="quantity" type="number" min="1" defaultValue="1" required /></label><label>Prazo<input name="dueDate" type="date" defaultValue={isoOffset(7)} required /></label></div><div className="form-row"><label>Valor total<input name="total" type="number" min="0" step="0.01" required /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" defaultValue="0" /></label></div><label className="full">Observação<textarea name="notes" rows={3} /></label></> : kind === "cliente" ? <><label className="full">Nome<input name="name" required autoFocus /></label><label className="full">WhatsApp<input name="phone" required inputMode="tel" /></label><label className="full">Empresa <span>(opcional)</span><input name="company" /></label></> : kind === "conta" ? <><label className="full">Nome da conta<input name="description" required autoFocus placeholder={account === "personal" ? "Ex.: Aluguel, cartão ou academia" : "Ex.: Aluguel, internet ou máquina"} /></label><div className="form-row"><label>Tipo<select name="billingType"><option value="fixed">Mensal fixa</option><option value="installment">Parcelada</option></select></label><label>Valor mensal/parcela<input name="amount" type="number" min="0.01" step="0.01" required /></label></div><div className="form-row"><label>Dia do vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue="10" required /></label><label>Total de parcelas<input name="totalInstallments" type="number" min="2" defaultValue="12" /></label></div><CategoryFields options={recurringOptions} defaultCategory={recurringOptions[0]} /><p className="form-help">A conta será incluída apenas no financeiro {account === "personal" ? "pessoal" : "empresarial"}.</p></> : <><label className="full">Descrição<input name="description" required autoFocus placeholder={kind === "despesa" ? account === "personal" ? "Ex.: Supermercado" : "Ex.: Compra de material" : kind === "transferencia" ? "Ex.: Pró-labore" : account === "personal" ? "Ex.: Salário recebido" : "Ex.: Pagamento de cliente"} /></label><div className="form-row"><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Data da movimentação<input name="transactionDate" type="date" defaultValue={localDateValue()} required /></label></div>{kind === "despesa" ? <CategoryFields options={expenseOptions} defaultCategory={expenseOptions[0]} /> : kind === "entrada" ? <CategoryFields options={incomeOptions} defaultCategory={incomeOptions[0]} /> : <CategoryFields options={["Pró-labore", "Transferência", "Outros"]} defaultCategory="Pró-labore" />}</>}<footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary"><Check size={17} /> Salvar</button></footer></form></aside></div>;
}

function OrderEditModal({ order, close, onSubmit }: { order: Order; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal edit-order-modal"><header><div><span className="eyebrow">CORRIGIR PEDIDO</span><h2>Editar pedido</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><form onSubmit={onSubmit}><label className="full">Cliente<input name="customer" required autoFocus defaultValue={order.customer} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" defaultValue={order.phone ?? ""} /></label><label className="full">Produto<input name="product" required defaultValue={order.product} /></label><div className="form-row"><label>Quantidade<input name="quantity" type="number" min="1" required defaultValue={order.quantity} /></label><label>Prazo<input name="dueDate" type="date" required defaultValue={order.dueDate} /></label></div><div className="form-row"><label>Valor total<input name="total" type="number" min="0" step="0.01" required defaultValue={order.total} /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" defaultValue={order.paid} /></label></div><label className="full">Status<select name="status" defaultValue={order.status}>{Object.keys(statusProgress).map((status) => <option key={status}>{status}</option>)}</select></label><label className="full">Observação<textarea name="notes" rows={3} defaultValue={order.notes ?? ""} /></label><p className="form-help">Ao corrigir o valor recebido, a entrada financeira vinculada também será ajustada.</p><footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary"><Check size={17} /> Salvar alterações</button></footer></form></aside></div>;
}

function FinancialEditModal({ bill, transaction, close, onSubmit }: { bill?: Bill; transaction?: Transaction; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const item = bill ?? transaction;
  if (!item) return null;
  const billOptions = bill?.account === "personal" ? personalBillCategories : businessBillCategories;
  const transactionOptions = transaction?.type === "income"
    ? transaction.account === "personal" ? personalIncomeCategories : businessIncomeCategories
    : transaction?.account === "personal" ? personalExpenseCategories : businessExpenseCategories;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal edit-financial-modal"><header><div><span className="eyebrow">EDIÇÃO FINANCEIRA</span><h2>{bill ? "Editar conta" : "Editar movimentação"}</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><form onSubmit={onSubmit}><label className="full">Descrição<input name="description" required autoFocus defaultValue={item.description} /></label><label className="full">Valor<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={item.amount} /></label>{bill ? <><div className="form-row"><label>Tipo<select name="billingType" defaultValue={bill.billingType}><option value="fixed">Mensal fixa</option><option value="installment">Parcelada</option></select></label><label>Vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue={bill.dueDay} required /></label></div><label className="full">Total de parcelas<input name="totalInstallments" type="number" min="2" defaultValue={bill.totalInstallments ?? 12} /></label><CategoryFields options={billOptions} defaultCategory={bill.category} /></> : transaction ? <><div className="form-row"><label>Tipo<select name="type" defaultValue={transaction.type}><option value="income">Entrada</option><option value="expense">Saída</option><option value="transfer">Transferência</option></select></label><label>Conta<select name="account" defaultValue={transaction.account}><option value="business">Empresa</option><option value="personal">Pessoal</option></select></label></div><label className="full">Data da movimentação<input name="transactionDate" type="date" defaultValue={localDateValue(transactionDate(transaction))} required /></label><CategoryFields options={transactionOptions} defaultCategory={transaction.category} /></> : null}<footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary"><Check size={17} /> Salvar alterações</button></footer></form></aside></div>;
}
