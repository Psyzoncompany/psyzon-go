"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import type { BusinessNote } from "./NotesWorkspace";
import OrderPhotoField from "./OrderPhotoField";
import ValuesPrivacyDialog from "./ValuesPrivacyDialog";
import CustomersWorkspace from "./CustomersWorkspace";
import FinanceWorkspace, { type BillInput } from "./FinanceWorkspace";
import { billDueDate, billIsSettled, billSettlementAfterEdit, customerAdjustments, customerBalances, customerNameKey, customerReceipt, financialSummary, orderReceivables, roundMoney, type Bill, type Customer, type CustomerBalance } from "./finance-model";
import useViewHistory from "./useViewHistory";
import { Capacitor } from "@capacitor/core";
import { syncDailyReminders } from "./localNotifications";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  AlertTriangle,
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
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type CreateKind = "pedido" | "cliente";
type UISize = "compact" | "comfortable" | "large" | "extra-large";
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
  receivable?: number;
  dueDate: string;
  status: OrderStatus;
  notes?: string;
  photoData?: string;
  createdAt?: unknown;
};

type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account: "business" | "personal";
  category?: string;
  transactionDate?: string;
  source?: "bill" | "ai_adjustment" | "mercado_pago" | "pluggy" | "customer_receipt" | "order_payment";
  provider?: "mercado_pago" | "pluggy";
  providerTransactionId?: string;
  externalReference?: string;
  paymentMethod?: string;
  providerStatus?: string;
  feeAmount?: number;
  netAmount?: number | null;
  billId?: string;
  orderId?: string;
  customerId?: string;
  createdAt?: unknown;
};
type View = import("./useViewHistory").View;

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
let appCheckInitialized = false;
let authInstance: Auth | null = null;

function ensureAppCheck(app: FirebaseApp) {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (typeof window === "undefined" || !siteKey || appCheckInitialized) return;
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "appCheck/already-initialized") appCheckInitialized = true;
    else console.error("Firebase App Check initialization failed", { code: code || "UNKNOWN" });
  }
}

function clientAuth(app: FirebaseApp) {
  if (authInstance) return authInstance;

  try {
    authInstance = initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code !== "auth/already-initialized") throw error;
    authInstance = getAuth(app);
  }

  return authInstance;
}

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
  { id: "mais", label: "Mais", icon: MoreHorizontal },
];
const navGroups = [
  { label: "Operação", items: navItems.filter((item) => ["inicio", "producao", "notas", "clientes"].includes(item.id)) },
  { label: "Gestão", items: navItems.filter((item) => ["financeiro"].includes(item.id)) },
  { label: "Conta", items: navItems.filter((item) => item.id === "mais") },
];

const mobileNavItems = navItems;

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
  const [view, setView] = useViewHistory();
  useEffect(() => { const timer = window.setInterval(() => setCalendarDate(localDateValue()), 30000); return () => window.clearInterval(timer); }, []);
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
  const [privateValues, setPrivateValues] = useState(true);
  const [privacyTarget, setPrivacyTarget] = useState<boolean | null>(null);
  const revealAction = useRef<(() => void) | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => localDateValue());
  const [uiSize, setUiSize] = useState<UISize>("comfortable");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<CreateKind | null>(null);
  const [toast, setToast] = useState("");
  const [board, setBoard] = useState(false);
  const [floatingModeOpen, setFloatingModeOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const floatingWindowRef = useRef<Window | null>(null);
  const dailyRemindersSignature = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroComplete(true), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const storedTheme = localStorage.getItem("psy-theme");
    setDark(storedTheme === "dark");
    const storedSize = localStorage.getItem("psy-ui-size") as UISize | null;
    if (["compact", "comfortable", "large", "extra-large"].includes(storedSize ?? "")) setUiSize(storedSize!);
    setNotificationsEnabled(localStorage.getItem("psy-notifications") !== "off");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);

    if (!isFirebaseConfigured) {
      setFirebaseState("unconfigured");
      setAuthReady(true);
      setDataReady(true);
      return;
    }

    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    ensureAppCheck(app);
    const auth = clientAuth(app);
    const db = getFirestore(app);
    const toList = <T extends { id: string }>(snapshot: { docs: Array<{ id: string; data: () => unknown }> }) =>
      snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<T, "id">) } as T));
    let unsubscribers: Array<() => void> = [];
    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      unsubscribers = [];
      setPrivateValues(true);
      setPrivacyTarget(null);
      revealAction.current = null;
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
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) {
        if (event.key === "Escape") {
          setModal(null);
        }
        return;
      }
      if (event.key === "n") setModal("pedido");
      if (event.key === "c") setView("clientes");
      if (event.key === "f") setView("financeiro");
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setModal(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const toggleFloatingMode = async () => {
    const controller = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureController }).documentPictureInPicture;
    if (!controller) return showToast("Modo flutuante disponível no Edge ou Chrome atualizado");
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

  const signInGoogle = async () => {
    if (!isFirebaseConfigured) return;
    setAuthError("");
    try {
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      ensureAppCheck(app);
      const auth = clientAuth(app);
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

  const closePrivacy = () => { setPrivacyTarget(null); revealAction.current = null; };
  const requestPrivacy = (hide: boolean) => { revealAction.current = null; setPrivacyTarget(hide); };
  const requireVisible = (action: () => void) => {
    if (!privateValues) { action(); return; }
    revealAction.current = action;
    setPrivacyTarget(false);
  };

  const signOutGoogle = async () => {
    setPrivateValues(true);
    closePrivacy();
    if (!isFirebaseConfigured) return;
    await signOut(clientAuth(getApps()[0]));
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

  const balances = useMemo(() => customerBalances(customers, orders), [customers, orders]);
  const visibleCustomers = balances.filter((customer) => !customer.archived);
  const { pending, toPay: payable, debtors } = financialSummary(balances, bills, calendarDate.slice(0, 7));
  const orderBalances = orderReceivables(balances, orders);
  const activeOrders = orders.filter((order) => order.status !== "Entregue").map(order => ({ ...order, receivable: orderBalances.get(order.id) ?? 0 }));
  const overdue = activeOrders.filter((order) => dueTone(order.dueDate, order.status) === "danger");
  const urgent = activeOrders.filter((order) => ["danger", "warning"].includes(dueTone(order.dueDate, order.status)));

  const notifications = useMemo<AppNotification[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = localDateValue(today).slice(0, 7);
    const items: AppNotification[] = [];

    activeOrders.forEach((order) => {
      const due = new Date(`${order.dueDate}T00:00:00`);
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (days < 0) items.push({ id: `order-${order.id}`, title: `Pedido #${order.id} atrasado`, detail: `${order.customer} · ${Math.abs(days)} dia(s) de atraso`, tone: "danger", view: "producao" });
      else if (days <= 2) items.push({ id: `order-${order.id}`, title: days === 0 ? `Pedido #${order.id} vence hoje` : `Pedido #${order.id} próximo do prazo`, detail: `${order.customer} · ${order.product}`, tone: "warning", view: "producao" });
    });

    bills.forEach((bill) => {
      if (billIsSettled(bill, month)) return;
      const dueDate = billDueDate(bill, month);
      const days = Math.ceil((new Date(dueDate + "T00:00:00").getTime() - today.getTime()) / 86400000);
      const action = bill.direction === "receivable" ? "a receber" : "a pagar";
      if (days <= 3) items.push({ id: "bill-" + bill.id, title: bill.description + " · " + action, detail: (privateValues ? "Valor protegido" : money.format(bill.amount)) + " · " + (days < 0 ? Math.abs(days) + " dia(s) em atraso" : days === 0 ? "vence hoje" : "vence em breve"), tone: days < 0 ? "danger" : "warning", view: "financeiro" });
    });

    return items.sort((a, b) => (a.tone === "danger" ? -1 : 1) - (b.tone === "danger" ? -1 : 1));
  }, [activeOrders, bills, privateValues, calendarDate]);

  useEffect(() => {
    if (!notificationsEnabled || !dataReady || !notifications.length || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (Capacitor.isNativePlatform()) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("psy-last-system-notification") === todayKey) return;
    new Notification("PSYZON GO", { body: `${notifications.length} item(ns) precisam da sua atenção.`, icon: "/icon-192-v3.png" });
    localStorage.setItem("psy-last-system-notification", todayKey);
  }, [dataReady, notifications, notificationsEnabled]);

  useEffect(() => {
    if (!dataReady || !notificationsEnabled || !Capacitor.isNativePlatform()) return;
    const signature = JSON.stringify(notifications.map(({ title, detail, tone, view }) => ({ title, detail, tone, view })));
    if (dailyRemindersSignature.current === signature) return;
    dailyRemindersSignature.current = signature;
    syncDailyReminders(true, true, notifications).then((status) => {
      if (status !== "denied" && status !== "unsupported") return;
      setNotificationsEnabled(false);
      localStorage.setItem("psy-notifications", "off");
      showToast(status === "unsupported" ? "Atualize o aplicativo para ativar os lembretes" : "Permissão de notificações não concedida");
    }).catch((error) => {
      dailyRemindersSignature.current = "";
      console.error("Não foi possível agendar os lembretes", error);
    });
  }, [dataReady, notifications, notificationsEnabled]);

  const changeNotifications = async (enabled: boolean) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await syncDailyReminders(enabled, enabled, notifications);
        const accepted = status !== "denied" && status !== "unsupported";
        setNotificationsEnabled(enabled && accepted);
        localStorage.setItem("psy-notifications", enabled && accepted ? "on" : "off");
        showToast(enabled && accepted ? "Lembretes ativados para 08:00, 14:00 e 19:00" : status === "unsupported" ? "Atualize o aplicativo para ativar os lembretes" : enabled ? "Permissão de notificações não concedida" : "Lembretes desativados");
      } catch (error) {
        console.error("Não foi possível alterar os lembretes", error);
        showToast("Não foi possível configurar as notificações");
      }
      return;
    }

    if (!enabled) {
      setNotificationsEnabled(false);
      localStorage.setItem("psy-notifications", "off");
      return;
    }

    try {
      if (typeof Notification === "undefined") throw new Error("Notifications API unavailable");
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      const accepted = permission === "granted";
      setNotificationsEnabled(accepted);
      localStorage.setItem("psy-notifications", accepted ? "on" : "off");
      showToast(accepted ? "Notificações ativadas" : "Notificações indisponíveis neste navegador");
    } catch (error) {
      console.error("Não foi possível solicitar notificações do navegador", error);
      setNotificationsEnabled(false);
      localStorage.setItem("psy-notifications", "off");
      showToast("Notificações indisponíveis neste navegador");
    }
  };

  const searchResults = useMemo(() => {
    const value = search.trim().toLocaleLowerCase("pt-BR");
    if (!value) return [];
    return orders.filter((order) => [order.customer, order.product, order.id, order.phone, (!privateValues ? String(order.total) : undefined)].some((field) => field?.toLocaleLowerCase("pt-BR").includes(value))).slice(0, 5);
  }, [orders, search, privateValues]);

  const displayMoney = (value: number) => (privateValues ? "R$ ••••••" : money.format(value));

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = modal;
    if (!kind) return;

    try {
      if (kind === "pedido") {
        const nextOrder: Omit<Order, "id"> = {
          customer: String(form.get("customer")).trim(),
          phone: String(form.get("phone") || ""),
          product: String(form.get("product")),
          quantity: Number(form.get("quantity")),
          total: Number(form.get("total")),
          paid: Number(form.get("paid")),
          dueDate: String(form.get("dueDate")),
          status: "Aprovado",
          notes: String(form.get("notes") || ""),
          photoData: String(form.get("photoData") || ""),
          createdAt: serverTimestamp(),
        };
        if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
        const db = getFirestore(getApps()[0]);
        const orderReference = doc(userCollection(uid, "orders"));
        const orderKey = orderReference.id;
        const customerKey = nextOrder.customer.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || orderKey;
        const batch = writeBatch(db);
        batch.set(orderReference, nextOrder);
        const existingCustomer = customers.find((customer) => customerNameKey(customer.name) === customerNameKey(nextOrder.customer));
        batch.set(userDocument(uid, "customers", existingCustomer?.id ?? customerKey), { name: nextOrder.customer.trim(), phone: nextOrder.phone ?? "", archived: false, ...(existingCustomer?.archived ? customerAdjustments(0, 0, orders.filter(order => customerNameKey(order.customer) === customerNameKey(nextOrder.customer))) : {}) }, { merge: true });
        if (nextOrder.paid > 0) {
          batch.set(doc(userCollection(uid, "transactions")), { description: `Entrada · ${nextOrder.customer} · #${orderKey.slice(0, 5).toUpperCase()}`, amount: nextOrder.paid, type: "income", account: "business", category: "Vendas", orderId: orderKey, transactionDate: localDateValue(), createdAt: serverTimestamp() });
        }
        await batch.commit();
        showToast("Pedido criado e financeiro atualizado");
      } else if (kind === "cliente") {
        const name = String(form.get("name")).trim();
        const existing = customers.find((customer) => customerNameKey(customer.name) === customerNameKey(name));
        const customer = { name, phone: String(form.get("phone") || ""), company: String(form.get("company") || ""), archived: false };
        if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
        if (existing) await setDoc(userDocument(uid, "customers", existing.id), { ...customer, ...(existing.archived ? customerAdjustments(0, 0, orders.filter(order => customerNameKey(order.customer) === customerNameKey(name))) : {}) }, { merge: true });
        else await addDoc(userCollection(uid, "customers"), customer);
        showToast("Cliente adicionado");
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
      customer: String(form.get("customer")).trim(),
      phone: String(form.get("phone") || ""),
      product: String(form.get("product")),
      quantity: Number(form.get("quantity")),
      total: Number(form.get("total")),
      paid: Number(form.get("paid")),
      dueDate: String(form.get("dueDate")),
      status: String(form.get("status")) as OrderStatus,
      notes: String(form.get("notes") || ""),
      photoData: String(form.get("photoData") || ""),
    };
    const db = getFirestore(getApps()[0]);
    const customerKey = updatedOrder.customer.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || editingOrder.id;
    await runTransaction(db, async transaction => {
      const orderRef = userDocument(uid, "orders", editingOrder.id);
      const current = await transaction.get(orderRef);
      if (!current.exists()) throw new Error("Este pedido foi excluído.");
      if (current.data().paid !== editingOrder.paid || current.data().total !== editingOrder.total) {
        throw new Error("O valor do pedido mudou. Feche a edição, confira os valores e tente novamente.");
      }
      const linkedPayments = transactions.filter(item => item.orderId === editingOrder.id);
      transaction.update(orderRef, updatedOrder);
      const existingCustomer = customers.find((customer) => customerNameKey(customer.name) === customerNameKey(updatedOrder.customer));
      transaction.set(userDocument(uid, "customers", existingCustomer?.id ?? customerKey), { name: updatedOrder.customer, phone: updatedOrder.phone }, { merge: true });
      if (updatedOrder.paid !== editingOrder.paid) {
        const manual = linkedPayments.filter(item => !item.source || item.source === "order_payment");
        const recorded = roundMoney(linkedPayments.filter(item => item.type === "income" && item.source && item.source !== "order_payment").reduce((sum, item) => sum + item.amount, 0));
        const amount = roundMoney(updatedOrder.paid - recorded);
        if (amount < 0) throw new Error("O valor é menor que os recebimentos já registrados para este pedido.");
        const payment = { description: `Entrada · ${updatedOrder.customer} · #${editingOrder.id.slice(0, 5).toUpperCase()}`, amount, type: "income", account: "business", category: "Vendas", orderId: editingOrder.id };
        if (amount > 0) {
          if (manual[0]) transaction.update(userDocument(uid, "transactions", manual[0].id), payment);
          else transaction.set(doc(userCollection(uid, "transactions")), { ...payment, source: "order_payment", transactionDate: localDateValue(), createdAt: serverTimestamp() });
        }
        manual.slice(amount > 0 ? 1 : 0).forEach(item => transaction.delete(userDocument(uid, "transactions", item.id)));
      }
    });
    setEditingOrder(null);
    showToast("Pedido e financeiro atualizados");
  };

  const saveCustomerValues = async (customer: CustomerBalance, total: number, pending: number) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    const key = customerNameKey(customer.name);
    const related = orders.filter(order => customerNameKey(order.customer) === key);
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const reference = userDocument(uid, "customers", customer.id);
      const snapshot = await transaction.get(reference);
      const orderSnapshots = await Promise.all(related.map(order => transaction.get(userDocument(uid, "orders", order.id))));
      const currentOrders = orderSnapshots.filter(item => item.exists()).map(item => item.data() as Order).filter(order => customerNameKey(order.customer) === key);
      const current = snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Customer : customer;
      const [balance] = customerBalances([current], currentOrders);
      if (current.archived || balance.total !== customer.total || balance.pending !== customer.pending) {
        throw new Error("Os valores do cliente mudaram. Abra a edição novamente para conferir o saldo atualizado.");
      }
      transaction.set(reference, { name: current.name, phone: current.phone, ...customerAdjustments(total, pending, currentOrders) }, { merge: true });
    });
    showToast("Valores do cliente atualizados");
  };

  const deleteCustomer = async (customer: CustomerBalance) => {
    if (!window.confirm("Excluir o cliente “" + customer.name + "”? Os pedidos ficam no histórico e este cliente deixará de compor o total a receber.")) return;
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    // A tombstone prevents historical orders from recreating a deleted customer.
    const batch = writeBatch(getFirestore(getApps()[0]));
    const matches = customers.filter((item) => customerNameKey(item.name) === customerNameKey(customer.name));
    if (!matches.length) matches.push(customer);
    matches.forEach((item) => batch.set(userDocument(uid, "customers", item.id), { name: item.name, phone: item.phone, archived: true }, { merge: true }));
    await batch.commit();
    showToast("Cliente excluído");
  };

  const receiveCustomer = async (customer: CustomerBalance) => {
    if (!window.confirm("Confirmar o recebimento de " + displayMoney(customer.pending) + " de " + customer.name + "?")) return;
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    const related = orders.filter(order => customerNameKey(order.customer) === customerNameKey(customer.name));
    if (related.length > 180) throw new Error("Receba os pedidos em lotes menores.");
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const customerRef = userDocument(uid, "customers", customer.id);
      const customerSnapshot = await transaction.get(customerRef);
      const orderSnapshots = await Promise.all(related.map(order => transaction.get(userDocument(uid, "orders", order.id))));
      const currentOrders = orderSnapshots.filter(snapshot => snapshot.exists()).map(snapshot => ({ ...snapshot.data(), id: snapshot.id } as Order)).filter(order => customerNameKey(order.customer) === customerNameKey(customer.name));
      const current = customerSnapshot.exists() ? { ...customerSnapshot.data(), id: customerSnapshot.id } as Customer : customer;
      const receipt = customerReceipt(current, currentOrders);
      if (roundMoney(receipt.amount) !== roundMoney(customer.pending)) throw new Error("O saldo mudou. Confira o valor atualizado e tente novamente.");
      for (const payment of receipt.payments) {
        transaction.update(userDocument(uid, "orders", payment.orderId), { paid: payment.paid });
        transaction.set(doc(userCollection(uid, "transactions")), { description: "Recebimento · " + current.name, amount: payment.amount, type: "income", account: "business", category: "Vendas", source: "customer_receipt", customerId: current.id, orderId: payment.orderId, transactionDate: localDateValue(), createdAt: serverTimestamp() });
      }
      if (receipt.unallocated > 0) transaction.set(doc(userCollection(uid, "transactions")), { description: "Recebimento · " + current.name, amount: receipt.unallocated, type: "income", account: "business", category: "Vendas", source: "customer_receipt", customerId: current.id, transactionDate: localDateValue(), createdAt: serverTimestamp() });
      transaction.set(customerRef, { name: current.name, phone: current.phone, ...receipt.adjustments }, { merge: true });
    });
    showToast("Recebimento e pedidos atualizados");
  };

  const saveBill = async (bill: Bill | null, input: BillInput) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    if (!input.description || !input.category || !Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Preencha a descrição e um valor válido.");
    if (bill) {
      await runTransaction(getFirestore(getApps()[0]), async transaction => {
        const reference = userDocument(uid, "bills", bill.id);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) throw new Error("Esta conta foi excluída.");
        const current = { ...snapshot.data(), id: snapshot.id } as Bill;
        const settlement = billSettlementAfterEdit(current, input.billingType);
        transaction.update(reference, { ...input, dueDate: input.dueDate ?? deleteField(), totalInstallments: input.totalInstallments ?? deleteField(), ...settlement });
      });
    } else {
      await addDoc(userCollection(uid, "bills"), { ...input, paidInstallments: 0, createdAt: serverTimestamp() });
    }
    showToast(bill ? "Conta atualizada" : "Conta cadastrada");
  };

  const payBill = async (bill: Bill) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    if (billIsSettled(bill)) return;
    const receiving = bill.direction === "receivable";
    if (!window.confirm("Confirmar " + (receiving ? "recebimento" : "pagamento") + " de " + displayMoney(bill.amount) + " · " + bill.description + "?")) return;
    const month = localDateValue().slice(0, 7);
    await runTransaction(getFirestore(getApps()[0]), async (transaction) => {
      const reference = userDocument(uid, "bills", bill.id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Esta conta foi excluída. Atualize a página.");
      const current = { ...snapshot.data(), id: snapshot.id } as Bill;
      if (billIsSettled(current, month)) throw new Error("Esta conta já foi concluída.");
      if (current.amount !== bill.amount || current.direction !== bill.direction || current.billingType !== bill.billingType) {
        throw new Error("A conta mudou. Confira os dados atualizados antes de confirmar.");
      }
      transaction.set(userDocument(uid, "transactions", `bill-${bill.id}-${current.billingType === "once" ? "once" : month}`), { description: current.description, amount: current.amount, type: current.direction === "receivable" ? "income" : "expense", account: current.account, category: current.category, source: "bill", billId: current.id, transactionDate: localDateValue(), createdAt: serverTimestamp() });
      transaction.update(reference, { lastPaidMonth: month, ...(current.billingType === "once" ? { settled: true } : {}), ...(current.billingType === "installment" ? { paidInstallments: (current.paidInstallments ?? 0) + 1 } : {}) });
    });
    showToast(receiving ? "Recebimento registrado" : "Pagamento registrado");
  };

  const deleteBill = async (bill: Bill) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    if (!window.confirm("Excluir a conta “" + bill.description + "”? O histórico de pagamentos será mantido.")) return;
    await deleteDoc(userDocument(uid, "bills", bill.id));
    showToast("Conta removida");
  };

  if (!introComplete || !authReady) return <SplashScreen />;
  if (!isFirebaseConfigured) return <ConnectionErrorScreen message="Confira as variáveis NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID e NEXT_PUBLIC_FIREBASE_APP_ID." />;
  if (!user) return <AuthScreenV2 error={authError} onSignIn={signInGoogle} />;
  if (!dataReady) return <SplashScreen />;

  const userName = user.displayName || "Usuário PSYZON";
  const firstName = userName.trim().split(/\s+/)[0] || "Rodrigo";
  const initials = userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const floatingActive = floatingModeOpen;

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
            {!!searchResults.length && <div className="search-results">{searchResults.map((order) => <button key={order.id} onClick={() => { setView("producao"); setSearch(""); }}><span><b>{order.customer}</b><small>Pedido #{order.id} · {order.product}</small></span><strong>{displayMoney(orderBalances.get(order.id) ?? 0)}<small>pendente</small></strong></button>)}</div>}
          </div>
          <div className="top-actions">
            <button className={`floating-mode-action ${floatingActive ? "active" : ""}`} onClick={toggleFloatingMode} aria-label={floatingActive ? "Desativar modo flutuante" : "Ativar modo flutuante"} aria-pressed={floatingActive}><PictureInPicture2 size={18} /><span>{floatingActive ? "Flutuante ativo" : "Modo flutuante"}</span></button>
            <button className="values-privacy-action" onClick={() => requestPrivacy(!privateValues)} aria-label={privateValues ? "Mostrar valores" : "Ocultar valores"} title={privateValues ? "Mostrar valores" : "Ocultar valores"}>{privateValues ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            <button className="desktop-action" onClick={() => setDark((value) => !value)} aria-label="Alternar tema">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
            <button className="notification" onClick={() => setNotificationsOpen((value) => !value)} aria-label={`${notifications.length} notificações`} aria-expanded={notificationsOpen}><Bell size={19} />{!!notifications.length && <span>{notifications.length > 9 ? "9+" : notifications.length}</span>}</button>
            {notificationsOpen && <div className="notification-panel"><header><div><b>Notificações</b><small>{notifications.length ? `${notifications.length} item(ns) precisam de atenção` : "Tudo em dia por aqui"}</small></div><button onClick={() => setNotificationsOpen(false)} aria-label="Fechar notificações"><X size={16} /></button></header><div>{notifications.length ? notifications.map((item) => <button className="notification-item" key={item.id} onClick={() => { setView(item.view); setNotificationsOpen(false); }}><span className={item.tone}>{item.tone === "danger" ? <AlertTriangle size={15} /> : <Bell size={15} />}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={15} /></button>) : <div className="notification-empty"><Check size={20} /><b>Nenhuma pendência próxima</b><small>Pedidos e contas aparecerão aqui.</small></div>}</div></div>}
          </div>
        </header>

        <section className={`content ${view === "notas" ? "notes-content" : ""}`}>
          {view === "inicio" && <Dashboard userName={firstName} orders={activeOrders} pending={pending} payable={payable} debtorsCount={debtors.length} overdue={overdue} urgent={urgent} displayMoney={displayMoney} setModal={setModal} setView={setView} updateStatus={updateStatus} />}
          {view === "producao" && <Production orders={activeOrders} board={board} setBoard={setBoard} displayMoney={displayMoney} updateStatus={updateStatus} editOrder={(order: Order) => requireVisible(() => setEditingOrder(order))} />}
          {view === "notas" && <NotesWorkspace key={uid} uid={uid} notes={notes} orders={orders} customers={visibleCustomers} privateValues={privateValues} requireVisible={requireVisible} />}
          {view === "clientes" && <CustomersWorkspace customers={visibleCustomers} displayMoney={displayMoney} requireVisible={requireVisible} onCreate={() => setModal("cliente")} onSave={saveCustomerValues} onDelete={deleteCustomer} />}
          {view === "financeiro" && <FinanceWorkspace bills={bills} transactions={transactions} customers={balances} currentMonth={calendarDate.slice(0, 7)} requireVisible={requireVisible} displayMoney={displayMoney} onSaveBill={saveBill} onSettleBill={payBill} onDeleteBill={deleteBill} onReceive={receiveCustomer} />}


          {view === "mais" && <MoreView firebaseState={firebaseState} dark={dark} setDark={setDark} privateValues={privateValues} requestPrivacy={requestPrivacy} uiSize={uiSize} setUiSize={setUiSize} notificationsEnabled={notificationsEnabled} setNotificationsEnabled={changeNotifications} user={user} onSignOut={signOutGoogle} onReset={resetAllData} resetting={resetting} />}
        </section>
      </main>

      {view !== "notas" && <button className="floating-new" onClick={() => setModal("pedido")}><Plus size={21} /> <span>Novo</span></button>}


      <nav className="mobile-nav">
        {mobileNavItems.map((item) => <NavButton key={item.id} item={item} active={view === item.id} onClick={() => setView(item.id)} />)}
      </nav>

      {modal && <CreateModalV2 kind={modal} setKind={setModal} close={() => setModal(null)} onSubmit={submitCreate} />}
      {editingOrder && <OrderEditModal order={editingOrder} close={() => setEditingOrder(null)} onSubmit={(event) => { void saveOrder(event).catch((error: unknown) => showToast(error instanceof Error && !error.name.startsWith("Firebase") ? error.message : "Não foi possível salvar o pedido. Confira os dados e tente novamente.")); }} />}



      {privacyTarget !== null && <ValuesPrivacyDialog hide={privacyTarget} getToken={() => user.getIdToken()} close={closePrivacy} confirm={() => { const action = revealAction.current; setPrivateValues(privacyTarget); closePrivacy(); action?.(); }} />}
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

function whatsappUrl(phone: string | undefined, message?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) return null;
  const url = new URL(`https://wa.me/${digits}`);
  if (message) url.searchParams.set("text", message);
  return url.href;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Dashboard({ userName, orders, pending, payable, debtorsCount, overdue, urgent, displayMoney, setModal, setView, updateStatus }: any) {
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">VISÃO DE HOJE</span><div className="greeting-row"><h1>Bom dia, {userName}.</h1><button className="notes-entry-button" onClick={() => setView("notas")}><NotebookPen size={16} /> Bloco de notas</button></div><p>{date.charAt(0).toUpperCase() + date.slice(1)} · Tudo sob controle.</p></div>
      <button className="primary" onClick={() => setModal("pedido")}><Plus size={18} /> Novo pedido <kbd>N</kbd></button>
    </div>
    <div className="metric-grid">
      <Metric icon={WalletCards} label="A pagar" value={displayMoney(payable)} detail={<span>Contas pendentes</span>} onClick={() => setView("financeiro")} />
      <Metric icon={CircleDollarSign} label="A receber" value={displayMoney(pending)} detail={<><span>{debtorsCount} clientes pendentes</span><ChevronRight size={16} /></>} onClick={() => setView("financeiro")} />
      <Metric icon={Boxes} label="Produção" value={`${orders.length} pedidos`} detail={<><span>{urgent.length} entregas próximas</span>{overdue.length > 0 && <b className="negative">{overdue.length} atrasado</b>}</>} onClick={() => setView("producao")} />

    </div>

    <div className="dashboard-grid">
      <div className="main-column">
        {overdue.length > 0 && <section className="attention-card"><div className="section-title"><div><span className="alert-dot" /><h2>Precisa da sua atenção</h2></div><span>{overdue.length + debtorsCount} pendências</span></div>{overdue.slice(0, 1).map((order: Order) => <button key={order.id} onClick={() => setView("producao")}><span className="attention-icon"><Clock3 size={18} /></span><span><b>Pedido #{order.id} está atrasado</b><small>{order.customer} · {order.product}</small></span><strong>{dueLabel(order.dueDate, order.status)}</strong><ChevronRight size={17} /></button>)}</section>}
        <section className="panel"><div className="section-title"><div><h2>Hoje</h2><span className="count">{Math.min(3, orders.length)}</span></div><button onClick={() => setView("producao")}>Ver produção <ChevronRight size={16} /></button></div><div className="today-list">{orders.slice(0, 3).map((order: Order, index: number) => <div className="today-row" key={order.id}><button className="check-button" onClick={() => updateStatus(order, order.status === "Finalização" ? "Pronto" : "Finalização")} aria-label="Concluir etapa"><span /></button><div><span className="task-type">PEDIDO #{order.id}</span><b>{index === 0 ? "Finalizar e embalar" : index === 1 ? "Conferir impressão" : "Separar materiais"}</b><small>{order.customer} · {order.quantity} un.</small></div><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><button className="row-menu"><MoreHorizontal size={18} /></button></div>)}</div></section>
        <section className="panel"><div className="section-title"><div><h2>Próximas entregas</h2></div><button onClick={() => setView("producao")}>Ver todas <ChevronRight size={16} /></button></div><div className="delivery-list">{orders.slice(0, 4).map((order: Order) => <div className="delivery-row" key={order.id}><div className="avatar">{order.customer.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="delivery-customer"><b>{order.customer}</b><small>{order.quantity} {order.product.toLowerCase()}</small></div><div className="delivery-date"><small>PRAZO</small><b>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${order.dueDate}T00:00:00`))}</b></div><div className="progress-cell"><div><span style={{ width: `${statusProgress[order.status]}%` }} /></div><small>{order.status} · {statusProgress[order.status]}%</small></div><div className="pending-cell"><small>PENDENTE</small><b>{displayMoney(order.receivable ?? Math.max(0, order.total - order.paid))}</b></div><ChevronRight size={17} /></div>)}</div></section>
      </div>
      <aside className="side-column">
        <section className="panel quick-panel"><div className="section-title"><h2>Ações rápidas</h2></div><button onClick={() => setModal("pedido")}><Boxes size={18} /><span><b>Novo pedido</b><small>Produção e prazo</small></span><Plus size={17} /></button><button onClick={() => setModal("cliente")}><UsersRound size={18} /><span><b>Novo cliente</b><small>Cadastro essencial</small></span><Plus size={17} /></button><button onClick={() => setView("financeiro")}><WalletCards size={18} /><span><b>Contas a pagar e receber</b><small>Despesas mensais</small></span><ChevronRight size={17} /></button></section>

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
  return <><div className="page-heading compact"><div><span className="eyebrow">OPERAÇÃO</span><h1>Produção</h1><p>{orders.length} pedidos ativos · prazos em primeiro lugar</p></div><div className="view-toggle"><button className={!board ? "active" : ""} onClick={() => setBoard(false)}><List size={17} /> Lista</button><button className={board ? "active" : ""} onClick={() => setBoard(true)}><LayoutGrid size={17} /> Kanban</button></div></div><div className="filter-row"><button className="active">Todos <span>{orders.length}</span></button><button>Hoje</button><button>Esta semana</button><button>Atrasados</button><button>Prontos</button></div>{board ? <div className="kanban">{statuses.map((status) => <div className="kanban-column" key={status}><div className="kanban-title"><span className={`status-dot s-${statusProgress[status]}`} />{status}<b>{orders.filter((o: Order) => o.status === status).length}</b></div>{orders.filter((o: Order) => o.status === status).map((order: Order) => <OrderCard key={order.id} order={order} displayMoney={displayMoney} updateStatus={updateStatus} editOrder={editOrder} />)}</div>)}</div> : <section className="panel order-table"><div className="table-head"><span>Pedido / cliente</span><span>Produto</span><span>Prazo</span><span>Status</span><span>Valor</span><span>Ações</span></div>{orders.map((order: Order) => <div className="table-row" key={order.id}><span className="order-customer-cell">{order.photoData && <img className="order-photo-thumb" src={order.photoData} alt={`Foto do pedido de ${order.customer}`} />}<b>#{order.id} · {order.customer}</b><small>{order.quantity} unidades</small></span><span>{order.product}</span><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><span><select value={order.status} onChange={(event) => updateStatus(order, event.target.value as OrderStatus)}>{Object.keys(statusProgress).map((status) => <option key={status}>{status}</option>)}</select></span><span><b>{displayMoney(order.total)}</b><small>{displayMoney(order.receivable ?? Math.max(0, order.total - order.paid))} pendente</small></span><button className="order-edit" onClick={() => editOrder(order)} aria-label={`Editar pedido de ${order.customer}`} title="Editar pedido"><Pencil size={15} /></button></div>)}</section>}</>;
}

function OrderCard({ order, displayMoney, updateStatus, editOrder }: { order: Order; displayMoney: (value: number) => string; updateStatus: (order: Order, status: OrderStatus) => void; editOrder: (order: Order) => void }) {
  const contactUrl = whatsappUrl(order.phone, `Olá, ${order.customer}. Seu pedido da PSYZON ficou pronto e já está disponível para retirada/entrega.`);
  return <article className="order-card"><div><span>#{order.id}</span><button onClick={() => editOrder(order)} aria-label={`Editar pedido de ${order.customer}`} title="Editar pedido"><Pencil size={15} /></button></div>{order.photoData && <img className="order-card-photo" src={order.photoData} alt={`Foto do pedido de ${order.customer}`} />}<h3>{order.customer}</h3><p>{order.quantity} × {order.product}</p><span className={`due ${dueTone(order.dueDate, order.status)}`}>{dueLabel(order.dueDate, order.status)}</span><div className="progress-line"><span style={{ width: `${statusProgress[order.status]}%` }} /></div><footer><span><small>Pendente</small><b>{displayMoney(order.receivable ?? Math.max(0, order.total - order.paid))}</b></span>{order.status === "Pronto" && contactUrl ? <a href={contactUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Avisar</a> : <button onClick={() => updateStatus(order, order.status === "Produção" ? "Finalização" : "Produção")}>Avançar <ChevronRight size={15} /></button>}</footer></article>;
}

function MoreView({ firebaseState, dark, setDark, privateValues, requestPrivacy, uiSize, setUiSize, notificationsEnabled, setNotificationsEnabled, user, onSignOut, onReset, resetting }: any) {
  const sizes: { value: UISize; label: string; hint: string }[] = [
    { value: "compact", label: "Pequena", hint: "90%" },
    { value: "comfortable", label: "Normal", hint: "100%" },
    { value: "large", label: "Grande", hint: "114%" },
    { value: "extra-large", label: "Muito grande", hint: "128%" },
  ];
  return <><div className="page-heading compact"><div><span className="eyebrow">PREFERÊNCIAS</span><h1>Configurações</h1><p>Conta, alertas, aparência e dados do PSYZON GO.</p></div></div><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Settings size={20} /></div><div><h3>Aparência e privacidade</h3><p>Ajuste a interface sem complicar sua rotina.</p></div><label><span><b>Tema escuro</b><small>Mais confortável à noite</small></span><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} /></label><label><span><b>Ocultar valores</b><small>Privacidade perto de clientes</small></span><input type="checkbox" checked={privateValues} onChange={(event) => requestPrivacy(event.target.checked)} /></label><div className="interface-size"><span><b>Tamanho das letras</b><small>Escolha um tamanho confortável para ler sem forçar a vista</small></span><div>{sizes.map((size) => <button key={size.value} type="button" aria-pressed={uiSize === size.value} className={uiSize === size.value ? "active" : ""} onClick={() => setUiSize(size.value)}><b>{size.label}</b><small>{size.hint}</small></button>)}</div></div></section><section className="panel settings-card"><div className="settings-icon"><Bell size={20} /></div><div><h3>Alertas importantes</h3><p>Pedidos próximos do prazo e contas a vencer.</p></div><label><span><b>Notificações do sistema</b><small>No app mobile, todos os dias às 08:00, 14:00 e 19:00</small></span><input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} /></label><div className="settings-note"><AlertTriangle size={16} /><span>No Android, os lembretes são agendados no dispositivo e funcionam mesmo com o app fechado.</span></div></section><section className="panel settings-card settings-data"><div className="settings-icon"><BriefcaseBusiness size={20} /></div><div><h3>Dados e sincronização</h3><p>Seus registros protegidos e centralizados no Cloud Firestore.</p></div><div className={`connection-box ${firebaseState}`}><span /><div><b>{firebaseState === "live" ? "Firestore conectado" : firebaseState === "error" ? "Falha na sincronização" : "Conectando ao Firestore"}</b><small>{firebaseState === "live" ? "Alterações sincronizadas em tempo real" : "Verificando a conexão com os dados"}</small></div></div><div className="account-row"><span><b>{user.displayName || "Conta Google"}</b><small>{user.email}</small></span><button className="secondary" onClick={onSignOut}><LogOut size={16} /> Sair</button></div><div className="danger-zone"><div><b>Resetar todos os dados</b><small>Apaga pedidos, clientes, contas e movimentações desta conta.</small></div><button className="danger-button" onClick={onReset} disabled={resetting}><RotateCcw size={16} /> {resetting ? "Apagando…" : "Resetar tudo"}</button></div></section></div></>;
}

function CreateModalV2({ kind, setKind, close, onSubmit }: { kind: CreateKind; setKind: (kind: CreateKind) => void; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><header><h2 id="create-title">{kind === "pedido" ? "Novo pedido" : "Novo cliente"}</h2><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><div className="create-tabs"><button className={kind === "pedido" ? "active" : ""} onClick={() => setKind("pedido")}>Pedido</button><button className={kind === "cliente" ? "active" : ""} onClick={() => setKind("cliente")}>Cliente</button></div><form key={kind} onSubmit={onSubmit}>{kind === "pedido" ? <><label className="full">Cliente<input name="customer" required autoFocus maxLength={120} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" maxLength={40} /></label><label className="full">Produto<input name="product" required maxLength={160} /></label><div className="form-row"><label>Quantidade<input name="quantity" type="number" min="1" defaultValue="1" required /></label><label>Prazo<input name="dueDate" type="date" defaultValue={isoOffset(7)} required /></label></div><div className="form-row"><label>Valor total<input name="total" type="number" min="0" step="0.01" required /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" defaultValue="0" /></label></div><OrderPhotoField onBusyChange={setPhotoBusy} /><label className="full">Observação<textarea name="notes" rows={3} /></label></> : <><label className="full">Nome<input name="name" required autoFocus maxLength={120} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" maxLength={40} /></label><label className="full">Empresa (opcional)<input name="company" maxLength={160} /></label></>}<footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={photoBusy}><Check size={17} /> Salvar</button></footer></form></aside></div>;
}

function OrderEditModal({ order, close, onSubmit }: { order: Order; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal edit-order-modal"><header><div><span className="eyebrow">CORRIGIR PEDIDO</span><h2>Editar pedido</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><form onSubmit={onSubmit}><label className="full">Cliente<input name="customer" required autoFocus defaultValue={order.customer} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" defaultValue={order.phone ?? ""} /></label><label className="full">Produto<input name="product" required defaultValue={order.product} /></label><div className="form-row"><label>Quantidade<input name="quantity" type="number" min="1" required defaultValue={order.quantity} /></label><label>Prazo<input name="dueDate" type="date" required defaultValue={order.dueDate} /></label></div><div className="form-row"><label>Valor total<input name="total" type="number" min="0" step="0.01" required defaultValue={order.total} /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" defaultValue={order.paid} /></label></div><label className="full">Status<select name="status" defaultValue={order.status}>{Object.keys(statusProgress).map((status) => <option key={status}>{status}</option>)}</select></label><OrderPhotoField initialValue={order.photoData} onBusyChange={setPhotoBusy} /><label className="full">Observação<textarea name="notes" rows={3} defaultValue={order.notes ?? ""} /></label><p className="form-help">Ao corrigir o valor recebido, a entrada financeira vinculada também será ajustada.</p><footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={photoBusy}><Check size={17} /> Salvar alterações</button></footer></form></aside></div>;
}
