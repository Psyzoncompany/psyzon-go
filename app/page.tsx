"use client";
import { CountUp, ProgressBar } from "./MotionValue";

import Image from "next/image";
import dynamic from "next/dynamic";
import type { BusinessNote } from "./NotesWorkspace";
import OrderPhotoField from "./OrderPhotoField";
import OrderPricingFields from "./OrderPricingFields";
import { validateShirtPrice, shirtTotal, suggestedShirtPrice, poloExtra } from "./order-pricing";
import ValuesPrivacyDialog from "./ValuesPrivacyDialog";
import CustomersWorkspace from "./CustomersWorkspace";
import FinanceWorkspace, { type BillInput } from "./FinanceWorkspace";
import ProductionBoard from "./ProductionBoard";
import { forecastMaterial } from "./material-forecast";
import { urgentOrder } from "./order-model";
import { orderAlerts, type OrderAlert } from "./order-alerts";
import { indexOrderPayments, nextOrderAction } from "./order-follow-up";
import SewingWorkspace, { type SewingChange } from "./SewingWorkspace";
import { readSewing, sewingBills, sewingNoteId, sewingOrderBalances, sewingPerson } from "./sewing-model";
import { notePhotoOrderId, synchronizedOrderPhotos } from "./order-photo-sync";
import { synchronizedOrderQuantities } from "./order-quantity-sync";
import { indexDtfCustomerLinks } from "./dtf-links";
import ProductionChecklistWindow from "./ProductionChecklistWindow";
import { changeDtfPrints, dtfForCustomer, readDtfPrints, type DtfInput, type DtfOrder, type DtfPrintChange, type DtfStage } from "./dtf-model";
import { dtfAlertDays, dueLabel, dueTone, normalizeOrderStatus, orderDtfStatus, orderStatuses, type Order, type OrderDtfStatus, type OrderStatus } from "./order-model";
import { billDueDate, billIsSettled, billPaymentId, billReversal, billSettlementAfterEdit, currentBillExpense, customerAdjustments, customerBalances, customerNameKey, customerReceipt, customerRefund, financialSummary, nextMonthPayables, orderReceivables, roundMoney, type Bill, type Customer, type CustomerBalance } from "./finance-model";
import { makeId, millis, newDraft, readDocument, serializeDraft } from "./notes-model";
import { fabricHistoryEntry, historyDate, historyRows, legacyFabricPurchases, materialHistoryId, pendingFabric, validateHistoryInput, type HistoryEntry, type HistoryInput } from "./history-model";
import { updatePurchasedMaterials } from "./notes/materials-model";
import { indexOrderTasks, type Task } from "./notes/task-model";
import FloatingTasks from "./notes/FloatingTasks";
import { changeRestockNote, newRestockNote, restockPrefix, restockTasks, restockBills, restockAlerts, type RestockInput, type RestockChange } from "./notes/restock-model";
import useViewHistory from "./useViewHistory";
import MobileNavigation from "./MobileNavigation";
import NotesNavigation, { noteViews } from "./NotesNavigation";
import AppearanceSettings from "./AppearanceSettings";
import useInterfaceAppearance from "./useInterfaceAppearance";
import useInterfaceMotion from "./useInterfaceMotion";
import { TypedHeading, SiteTypewriter } from "./Typewriter";
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
  History,
  Home,
  LogOut,
  Moon,

  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  PictureInPicture2,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings,



  Sparkles,
  Spool,
  Sun,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type CreateKind = "pedido" | "cliente" | "orcamento";
type UISize = "compact" | "comfortable" | "large" | "extra-large";
type DocumentPictureInPictureController = {
  window: Window | null;
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
};
type Transaction = {
  id: string;
  description: string;
  amount: number;
  type: "income" | "expense" | "transfer";
  account: "business" | "personal";
  category?: string;
  transactionDate?: string;
  source?: "bill" | "ai_adjustment" | "mercado_pago" | "pluggy" | "customer_receipt" | "customer_refund" | "order_payment";
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
  orderId?: string;
};

const PSYZONAI = dynamic(() => import("./PSYZONAIWorkspace"), { ssr: false });
const NotesWorkspace = dynamic(() => import("./NotesWorkspace"), { ssr: false });
const DtfWorkspace = dynamic(() => import("./DtfWorkspace"), { ssr: false });
const HistoryWorkspace = dynamic(() => import("./HistoryWorkspace"), { ssr: false });
const RestockWorkspace = dynamic(() => import("./notes/RestockWorkspace"), { ssr: false });
const TasksWorkspace = dynamic(() => import("./notes/TasksWorkspace"), { ssr: false });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const FIRESTORE_COLLECTIONS = ["orders", "customers", "transactions", "bills", "notes"] as const;
type UserCollection = (typeof FIRESTORE_COLLECTIONS)[number] | "dtfOrders" | "historyEntries" | "tasks";
const isFirebaseConfigured = [firebaseConfig.apiKey, firebaseConfig.authDomain, firebaseConfig.projectId, firebaseConfig.appId].every(Boolean);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
let appCheckInitialized = false;
let authInstance: Auth | null = null;

const financialVisibilityKey = (uid: string) => `psy-financial-visibility:${uid}`;

function financialValuesHidden(uid?: string) {
  if (!uid) return true;
  try { return localStorage.getItem(financialVisibilityKey(uid)) !== "visible"; }
  catch { return true; }
}

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

function userCollection(uid: string, name: UserCollection) {
  return collection(getFirestore(getApps()[0]), "users", uid, name);
}

function userDocument(uid: string, name: UserCollection, id: string) {
  return doc(getFirestore(getApps()[0]), "users", uid, name, id);
}

function isoOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const statusProgress: Record<OrderStatus, number> = {
  Orçamento: 8,
  "Aguardando material": 35,
  Produção: 65,
  Pronto: 100,
  Entregue: 100,
};

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "producao", label: "Produção", icon: Boxes },
  { id: "dtf", label: "DTF", icon: Printer },
  { id: "notas", label: "Bloco de notas", icon: NotebookPen },
  { id: "clientes", label: "Clientes", icon: UsersRound },
  { id: "financeiro", label: "Financeiro", icon: WalletCards },
  { id: "historico", label: "Histórico", icon: History },
  { id: "mais", label: "Configuração", icon: Settings },
];
const navGroups = [
  { label: "Operação", items: navItems.filter((item) => ["inicio", "producao", "dtf", "notas", "clientes"].includes(item.id)) },
  { label: "Gestão", items: navItems.filter((item) => ["financeiro", "historico"].includes(item.id)) },
  { label: "Conta", items: navItems.filter((item) => item.id === "mais") },
];

export default function HomePage() {
  const [view, setView, noteId, dtfCustomerId] = useViewHistory();
  useEffect(() => { const timer = window.setInterval(() => setCalendarDate(localDateValue()), 30000); return () => window.clearInterval(timer); }, []);
  const [storedOrders, setOrders] = useState<Order[]>([]);
  const [dtfOrders, setDtfOrders] = useState<DtfOrder[]>([]);
  const [dtfConnection, setDtfConnection] = useState<"connecting" | "live" | "error">("connecting");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyConnection, setHistoryConnection] = useState<"connecting" | "live" | "error">("connecting");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskConnection, setTaskConnection] = useState<"connecting" | "live" | "error">("connecting");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [notes, setNotes] = useState<BusinessNote[]>([]);
  const orders = useMemo(() => synchronizedOrderQuantities(storedOrders,notes,customers),[storedOrders,notes,customers]);
  const [firebaseState, setFirebaseState] = useState<"connecting" | "live" | "error" | "unconfigured">("connecting");
  const [uid, setUid] = useState("");
  const interfaceAppearance = useInterfaceAppearance(uid);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const [authError, setAuthError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [dark, setDark] = useState(false);
  const [privateValues, setPrivateValues] = useState(true);
  const [privacyTarget, setPrivacyTarget] = useState<boolean | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => localDateValue());
  const [uiSize, setUiSize] = useState<UISize>("comfortable");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [productionList, setProductionList] = useState<{ order: Order; noteId: string } | null>(null);
  useEffect(() => { setProductionList(null); }, [uid, view]);
  const [search, setSearch] = useState("");
  const getAiToken = useCallback(async () => {
    if (!user) throw new Error("Entre para acessar a Psyzon AI.");
    return user.getIdToken();
  }, [user]);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const aiPanelRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = aiPanelRef.current;
    if (aiPanelOpen && dialog && !dialog.open) dialog.showModal();
    if (!aiPanelOpen && dialog?.open) dialog.close();
  }, [aiPanelOpen]);
  const [modal, setModal] = useState<CreateKind | null>(null);
  const [toast, setToast] = useState("");
  const [floatingHost, setFloatingHost] = useState<Window | null>(null);
  const [standardSidebarCollapsed, setStandardSidebarCollapsed] = useState(false);
  const [studioSidebarCollapsed, setStudioSidebarCollapsed] = useState(true);
  const studio = interfaceAppearance.appearance.theme === "studio-glass";
  const sidebarCollapsed = studio ? studioSidebarCollapsed : standardSidebarCollapsed;
  const setSidebarCollapsed = studio ? setStudioSidebarCollapsed : setStandardSidebarCollapsed;
  const searchRef = useRef<HTMLInputElement>(null);
  const floatingWindowRef = useRef<Window | null>(null);
  const floatingOpeningRef = useRef(false);
  const dailyRemindersSignature = useRef("");
  const contentRef = useInterfaceMotion(view, authReady && !!user && dataReady && interfaceAppearance.ready, interfaceAppearance.appearance.motion);

  useEffect(() => () => {
    floatingWindowRef.current?.close();
    floatingWindowRef.current = null;
  }, [uid]);



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
      setPrivateValues(financialValuesHidden(nextUser?.uid));
      setPrivacyTarget(null);
      setUser(nextUser);
      setUid(nextUser?.uid ?? "");
      setAuthReady(true);
      setAuthError("");
      setDataReady(false);
      setDtfOrders([]);
      setDtfConnection("connecting");
      setHistoryEntries([]);
      setHistoryConnection("connecting");
      setTasks([]);
      setTaskConnection("connecting");

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
          setOrders(toList<Order>(snapshot)
            .map(order => ({ ...order, status: normalizeOrderStatus(order.status) }))
            .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
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
        onSnapshot(collection(db, "users", nextUser.uid, "dtfOrders"), (snapshot) => {
          setDtfOrders(toList<DtfOrder>(snapshot));
          setDtfConnection("live");
        }, (error) => {
          console.error("DTF synchronization failed", error);
          setDtfConnection("error");
        }),
        onSnapshot(collection(db, "users", nextUser.uid, "historyEntries"), (snapshot) => {
          setHistoryEntries(toList<HistoryEntry>(snapshot));
          setHistoryConnection("live");
        }, (error) => {
          console.error("History synchronization failed", error);
          setHistoryConnection("error");
        }),
        onSnapshot(collection(db, "users", nextUser.uid, "tasks"), (snapshot) => {
          setTasks(toList<Task>(snapshot));
          setTaskConnection("live");
        }, (error) => {
          console.error("Task synchronization failed", error);
          setTaskConnection("error");
        }),
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
    if (floatingOpeningRef.current) return;
    const controller = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureController }).documentPictureInPicture;
    if (!controller) return showToast("Modo flutuante disponível no Edge ou Chrome atualizado");
    if (floatingWindowRef.current && !floatingWindowRef.current.closed) {
      floatingWindowRef.current.close();
      floatingWindowRef.current = null;
      setFloatingHost(null);
      return;
    }

    floatingOpeningRef.current = true;
    try {
      const floatingWindow = await controller.requestWindow({ width: 340, height: 430 });
      floatingWindowRef.current = floatingWindow;
      floatingWindow.document.title = "PSYZON GO · Afazeres";
      floatingWindow.addEventListener("pagehide", () => {
        if (floatingWindowRef.current !== floatingWindow) return;
        floatingWindowRef.current = null;
        setFloatingHost(null);
      });
      setFloatingHost(floatingWindow);
      showToast("Afazeres flutuantes ativados");
    } catch {
      showToast("Não foi possível abrir o modo flutuante");
    } finally {
      floatingOpeningRef.current = false;
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

  const closePrivacy = () => setPrivacyTarget(null);
  const requestPrivacy = (hide: boolean) => setPrivacyTarget(hide);
  const confirmPrivacy = () => {
    if (privacyTarget === null || !uid || clientAuth(getApps()[0]).currentUser?.uid !== uid) return;
    try { localStorage.setItem(financialVisibilityKey(uid), privacyTarget ? "hidden" : "visible"); }
    catch { /* Keep the manual choice for this tab when storage is unavailable. */ }
    setPrivateValues(privacyTarget);
    closePrivacy();
  };

  const signOutGoogle = async () => {
    closePrivacy();
    if (!isFirebaseConfigured) return;
    await signOut(clientAuth(getApps()[0]));
    setView("inicio");
  };

  const resetAllData = async () => {
    if (!uid) return;
    if (dtfConnection !== "live") return showToast("Aguarde a sincronização dos pedidos DTF para resetar os dados.");
    if (historyConnection !== "live") return showToast("Aguarde a sincronização do histórico para resetar os dados.");
    if (taskConnection !== "live") return showToast("Aguarde a sincronização dos afazeres para resetar os dados.");
    if (!window.confirm("Apagar definitivamente todos os pedidos, incluindo DTF, clientes, contas, movimentações, anotações, afazeres e histórico desta conta?")) return;
    setResetting(true);
    try {
      const records = [
        ...orders.map((item) => ["orders", item.id] as const),
        ...dtfOrders.map((item) => ["dtfOrders", item.id] as const),
        ...customers.map((item) => ["customers", item.id] as const),
        ...transactions.map((item) => ["transactions", item.id] as const),
        ...bills.map((item) => ["bills", item.id] as const),
        ...notes.map((item) => ["notes", item.id] as const),
        ...historyEntries.map((item) => ["historyEntries", item.id] as const),
        ...tasks.map((item) => ["tasks", item.id] as const),
      ];
      for (let start = 0; start < records.length; start += 450) {
        const batch = writeBatch(getFirestore(getApps()[0]));
        records.slice(start, start + 450).forEach(([name, id]) => batch.delete(userDocument(uid, name, id)));
        await batch.commit();
      }
      setOrders([]);
      setDtfOrders([]);
      setCustomers([]);
      setTransactions([]);
      setBills([]);
      setNotes([]);
      setHistoryEntries([]);
      setTasks([]);
      showToast("Todos os dados foram removidos");
    } catch (error) {
      console.error("Reset failed", error);
      showToast("Não foi possível resetar os dados");
    } finally {
      setResetting(false);
    }
  };

  const saveSewing = async (change: SewingChange) => {
    if (firebaseState !== "live") throw new Error("Aguarde a sincronização.");
    await runTransaction(getFirestore(getApps()[0]), async (transaction) => {
      const ref = userDocument(uid, "notes", sewingNoteId);
      const snapshot = await transaction.get(ref);
      const ledger = readSewing(
        snapshot.exists()
          ? [{ id: sewingNoteId, content: String(snapshot.data().content) }]
          : [],
      );
      let operation = change;
      if (change.type === "pay-order") {
        if (ledger.entries.some((entry) => entry.id === change.id)) return;
        // Read the source documents in the same transaction as the settlement.
        const [orderSnapshots, noteSnapshots] = await Promise.all([
          Promise.all(
            storedOrders.map((order) =>
              transaction.get(userDocument(uid, "orders", order.id)),
            ),
          ),
          Promise.all(
            notes
              .filter((note) => note.id !== sewingNoteId)
              .map((note) =>
                transaction.get(userDocument(uid, "notes", note.id)),
              ),
          ),
        ]);
        const latestOrders = orderSnapshots
          .filter((snapshot) => snapshot.exists())
          .map(
            (snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as Order,
          );
        const latestNotes = noteSnapshots
          .filter((snapshot) => snapshot.exists())
          .map(
            (snapshot) =>
              ({ ...snapshot.data(), id: snapshot.id }) as BusinessNote,
          );
        const effective = synchronizedOrderQuantities(
          latestOrders,
          latestNotes,
          customers,
        );
        const person = sewingPerson(ledger, change.orderId);
        const row = sewingOrderBalances(effective, ledger, person).find(
          (row) => row.order.id === change.orderId,
        );
        if (!row || row.remaining <= 0 || row.remaining !== change.expected)
          throw new Error(
            "O saldo deste pedido mudou. Confira o valor atualizado antes de pagar.",
          );
        operation = {
          type: "entry",
          entry: {
            id: change.id,
            kind: "payment",
            person,
            quantity: 0,
            amount: row.remaining,
            date: change.date,
            orderId: change.orderId,
            name: "Costura · " + row.order.customer.slice(0, 140),
          },
        };
      }
      if (
        operation.type === "person-rename" ||
        operation.type === "person-remove"
      ) {
        const { from, name } = operation;
        if (
          !ledger.people.includes(from) ||
          !name ||
          name.length > 80 ||
          name === from
        )
          throw new Error("Informe uma costureira válida.");
        if (operation.type === "person-rename" && ledger.people.includes(name))
          throw new Error("Já existe uma costureira com este nome.");
        if (operation.type === "person-remove" && !ledger.people.includes(name))
          throw new Error("Escolha a costureira que receberá os pedidos.");
        ledger.people =
          operation.type === "person-rename"
            ? ledger.people.map((person) => (person === from ? name : person))
            : ledger.people.filter((person) => person !== from);
        if ((ledger.defaultPerson || "Zefa") === from)
          ledger.defaultPerson = name;
        for (const [id, person] of Object.entries(ledger.assignments))
          if (person === from) ledger.assignments[id] = name;
        for (const entry of ledger.entries)
          if (entry.person === from) {
            entry.person = name;
            if (entry.kind === "payment")
              transaction.update(
                userDocument(uid, "transactions", "sewing-payment-" + entry.id),
                { description: "Costura · " + name },
              );
          }
      } else if (operation.type === "person") {
        if (
          !operation.name ||
          operation.name.length > 80 ||
          ledger.people.includes(operation.name)
        )
          throw new Error("Informe um nome novo válido.");
        ledger.people.push(operation.name);
      } else if (operation.type === "hide-order") {
        const { orderId } = operation;
        if (ledger.hiddenOrderIds?.includes(orderId)) return;
        if (!ledger.excludedOrderIds?.includes(orderId) || ledger.entries.some(entry => entry.orderId === orderId && entry.kind === "payment"))
          throw new Error("Só é possível remover da lista pedidos sem cobrança e sem pagamento vinculado.");
        ledger.hiddenOrderIds = [...(ledger.hiddenOrderIds ?? []), orderId];
      } else if (operation.type === "exclude-order") {
        const { orderId, excluded } = operation;
        if (ledger.hiddenOrderIds?.includes(orderId)) throw new Error("Este pedido foi removido da lista de costura.");
        const order = await transaction.get(userDocument(uid, "orders", orderId));
        if (!order.exists()) throw new Error("Pedido indisponível.");
        if (excluded && ledger.entries.some(entry => entry.orderId === orderId && entry.kind === "payment"))
          throw new Error("Desfaça o pagamento vinculado antes de excluir a cobrança.");
        const ids = new Set(ledger.excludedOrderIds);
        if (excluded) ids.add(orderId);
        else ids.delete(orderId);
        ledger.excludedOrderIds = [...ids];
      } else if (operation.type === "assign") {
        if (ledger.hiddenOrderIds?.includes(operation.orderId)) throw new Error("Este pedido foi removido da lista de costura.");
        if (
          !ledger.people.includes(operation.person) ||
          ![4, 7].includes(operation.rate)
        )
          throw new Error("Costureira ou tarifa inválida.");
        ledger.assignments[operation.orderId] = operation.person;
        ledger.rates[operation.orderId] = operation.rate;
      } else if (operation.type === "entry") {
        const entry = operation.entry;
        if (
          !ledger.people.includes(entry.person) ||
          !Number.isFinite(entry.amount) ||
          entry.amount <= 0 ||
          entry.amount > 100000000 ||
          (entry.name !== undefined && entry.name.length > 160) ||
          !["print", "payment"].includes(entry.kind) ||
          !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(entry.date)
        )
          throw new Error("Lançamento inválido.");
        if (
          entry.kind === "print" &&
          (!Number.isInteger(entry.quantity) ||
            entry.quantity < 1 ||
            ![entry.quantity * 2, entry.quantity * 4].includes(entry.amount))
        )
          throw new Error("Quantidade inválida.");
        if (ledger.entries.some((item) => item.id === entry.id)) return;
        ledger.entries.push(entry);
        if (entry.kind === "payment")
          transaction.set(
            userDocument(uid, "transactions", "sewing-payment-" + entry.id),
            {
              description: "Costura · " + entry.person,
              amount: entry.amount,
              type: "expense",
              account: "business",
              category: "Costura",
              transactionDate: entry.date,
              createdAt: serverTimestamp(),
            },
          );
      } else if (operation.type === "rename") {
        const entry = ledger.entries.find((entry) => entry.id === operation.id);
        if (
          !entry ||
          entry.kind !== "print" ||
          !operation.name.trim() ||
          operation.name.length > 160
        )
          throw new Error("Informe um nome válido para a estampagem.");
        entry.name = operation.name.trim();
      } else if (operation.type === "remove") {
        const entry = ledger.entries.find((item) => item.id === operation.id);
        if (entry?.kind === "payment")
          transaction.delete(
            userDocument(uid, "transactions", "sewing-payment-" + entry.id),
          );
        ledger.entries = ledger.entries.filter(
          (item) => item.id !== operation.id,
        );
      }
      transaction.set(ref, {
        title: "Costureiras",
        content: JSON.stringify(ledger),
        category: "Geral",
        pinned: false,
        materials: [],
        updatedAt: serverTimestamp(),
      });
    });
  };

  const balances = useMemo(() => customerBalances(customers, orders), [customers, orders]);
  const dtfLinks = useMemo(() => dtfOrders.map(order => [order, ...readDtfPrints(order.printsData)]), [dtfOrders]);
  const stockItems = useMemo(() => restockTasks(notes), [notes]);
  const stockPayables = useMemo(() => restockBills(stockItems), [stockItems]);
  const sewingLedger = useMemo(() => readSewing(notes), [notes]);
  const alerts = useMemo(() => (["producao", "inicio"].includes(view)) ? orderAlerts(orders, notes, customers, dtfOrders, sewingLedger, money.format) : new Map(), [view, orders, notes, customers, dtfOrders, sewingLedger]);
  const orderPayments = useMemo(() => indexOrderPayments(transactions), [transactions]);
  const orderTasks = useMemo(() => indexOrderTasks(orders, customers, tasks), [orders, customers, tasks]);
  const sewingPayables = sewingBills(orders, sewingLedger);
  const sewingTotal = sewingPayables.reduce((sum,bill)=>sum+bill.amount,0);
  const allPayables = [...bills, ...stockPayables, ...sewingPayables];
  const visibleCustomers = balances.filter((customer) => !customer.archived);
  const { pending, toPay: payable, debtors } = financialSummary(balances, allPayables, calendarDate.slice(0, 7));
  const nextPayables = view === "inicio" ? nextMonthPayables(allPayables, calendarDate.slice(0, 7)) : undefined;
  const orderBalances = orderReceivables(balances, orders);
  const productionOrders = orders.map(order => ({ ...order, receivable: orderBalances.get(order.id) ?? 0 }));
  const activeOrders = productionOrders.filter(order => order.status !== "Entregue");
  const confirmedOrders = activeOrders.filter(order => order.status !== "Orçamento");
  const overdue = confirmedOrders.filter((order) => dueTone(order.dueDate, order.status) === "danger");
  const urgent = confirmedOrders.filter((order) => ["danger", "warning"].includes(dueTone(order.dueDate, order.status)));

  const notifications = useMemo<AppNotification[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const month = localDateValue(today).slice(0, 7);
    const items: AppNotification[] = [];

    confirmedOrders.forEach((order) => {
      const dtfDays = dtfAlertDays(order, calendarDate);
      if (dtfDays !== undefined) items.push({ id: `dtf-${order.id}`, orderId: order.id, title: `Pedir DTF · ${order.customer}`, detail: `${order.product} · ${dueLabel(order.dueDate, order.status, today)}`, tone: dtfDays <= 0 ? "danger" : "warning", view: "producao" });
      const due = new Date(`${order.dueDate}T00:00:00`);
      const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
      if (days < 0) items.push({ id: `order-${order.id}`, title: `Pedido de ${order.customer} atrasado`, detail: `${order.customer} · ${Math.abs(days)} dia(s) de atraso`, tone: "danger", view: "producao" });
      else if (days <= 2) items.push({ id: `order-${order.id}`, title: days === 0 ? `Pedido de ${order.customer} vence hoje` : `Pedido de ${order.customer} próximo do prazo`, detail: `${order.customer} · ${order.product}`, tone: "warning", view: "producao" });
    });

    bills.forEach((bill) => {
      if (billIsSettled(bill, month)) return;
      const dueDate = billDueDate(bill, month);
      const days = Math.ceil((new Date(dueDate + "T00:00:00").getTime() - today.getTime()) / 86400000);
      const action = bill.direction === "receivable" ? "a receber" : "a pagar";
      if (days <= 3) items.push({ id: "bill-" + bill.id, title: bill.description + " · " + action, detail: money.format(bill.amount) + " · " + (days < 0 ? Math.abs(days) + " dia(s) em atraso" : days === 0 ? "vence hoje" : "vence em breve"), tone: days < 0 ? "danger" : "warning", view: "financeiro" });
    });

    items.push(...restockAlerts(stockItems, calendarDate));
    return items.sort((a, b) => (a.tone === "danger" ? -1 : 1) - (b.tone === "danger" ? -1 : 1));
  }, [confirmedOrders, bills, calendarDate, stockItems]);
  const dtfAlertCount = notifications.filter(item => item.orderId).length;

  const openNotification = (item: AppNotification) => {
    setView(item.view);
    setNotificationsOpen(false);
    if (item.orderId) setEditingOrder(orders.find(order => order.id === item.orderId) ?? null);
  };

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
    return orders.filter((order) => [order.customer, order.product, order.id, order.phone, String(order.total)].some((field) => field?.toLocaleLowerCase("pt-BR").includes(value))).slice(0, 5);
  }, [orders, search]);

  const displayMoney = (value: number) => money.format(value);
  const displayTotal = (value: number) => privateValues ? "R$ ••••••" : displayMoney(value);

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = modal;
    if (!kind) return;

    try {
      if (kind === "pedido" || kind === "orcamento") {
        const nextOrder: Omit<Order, "id"> = {
          customer: String(form.get("customer")).trim(),
          phone: String(form.get("phone") || ""),
          product: String(form.get("product")),
          quantity: Number(form.get("quantity")),
          unitPrice:
            form.get("pricingMode") === "quantity"
              ? suggestedShirtPrice(Number(form.get("quantity")))
              : Number(form.get("unitPrice")),
          pricingMode:
            form.get("pricingMode") === "quantity" ? "quantity" : "manual",
          childQuantity: Number(form.get("childQuantity")),
          childUnitPrice: String(form.get("childUnitPrice") ?? "") === "" ? null : Number(form.get("childUnitPrice")),
          shirtType: form.get("shirtType") === "polo" ? "polo" : "standard",
          total: Number(form.get("total")),
          paid: Number(form.get("paid")),
          dueDate: String(form.get("dueDate")),
          status: kind === "orcamento" ? "Orçamento" : "Aguardando material",
          dtfStatus: String(form.get("dtfStatus")) as OrderDtfStatus,
          notes: String(form.get("notes") || ""),
          photoData: String(form.get("photoData") || ""),
          createdAt: serverTimestamp(),
        };
        if (firebaseState !== "live")
          throw new Error("Firestore ainda não está conectado");
        const db = getFirestore(getApps()[0]);
        validateShirtPrice(
          nextOrder.unitPrice! + poloExtra(nextOrder.shirtType),
          nextOrder.quantity,
          nextOrder.childQuantity!,
          nextOrder.childUnitPrice,
        );
        nextOrder.total = shirtTotal(
          nextOrder.unitPrice! + poloExtra(nextOrder.shirtType),
          nextOrder.quantity,
          nextOrder.childQuantity!,
          nextOrder.childUnitPrice,
        );
        if (
          !Number.isFinite(nextOrder.paid) ||
          nextOrder.paid < 0 ||
          nextOrder.paid > nextOrder.total
        )
          throw new Error("O recebido excede o total do pedido.");
        const orderReference = doc(userCollection(uid, "orders"));
        const orderKey = orderReference.id;
        const customerKey =
          nextOrder.customer
            .toLocaleLowerCase("pt-BR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || orderKey;
        const batch = writeBatch(db);
        batch.set(orderReference, nextOrder);
        const existingCustomer = customers.find(
          (customer) =>
            customerNameKey(customer.name) ===
            customerNameKey(nextOrder.customer),
        );
        batch.set(
          userDocument(uid, "customers", existingCustomer?.id ?? customerKey),
          {
            name: nextOrder.customer.trim(),
            phone: nextOrder.phone ?? "",
            archived: false,
            ...(existingCustomer?.archived
              ? customerAdjustments(
                  0,
                  0,
                  orders.filter(
                    (order) =>
                      customerNameKey(order.customer) ===
                      customerNameKey(nextOrder.customer),
                  ),
                )
              : {}),
          },
          { merge: true },
        );
        if (nextOrder.paid > 0) {
          batch.set(doc(userCollection(uid, "transactions")), {
            description: `Entrada · ${nextOrder.customer}`,
            amount: nextOrder.paid,
            type: "income",
            account: "business",
            category: "Vendas",
            orderId: orderKey,
            transactionDate: localDateValue(),
            createdAt: serverTimestamp(),
          });
        }
        await batch.commit();
        showToast(kind === "orcamento" ? "Orçamento criado" : "Pedido criado e financeiro atualizado");
      } else if (kind === "cliente") {
        const name = String(form.get("name")).trim();
        const existing = customers.find(
          (customer) =>
            customerNameKey(customer.name) === customerNameKey(name),
        );
        const customer = {
          name,
          phone: String(form.get("phone") || ""),
          company: String(form.get("company") || ""),
          archived: false,
        };
        if (firebaseState !== "live")
          throw new Error("Firestore ainda não está conectado");
        if (existing)
          await setDoc(
            userDocument(uid, "customers", existing.id),
            {
              ...customer,
              ...(existing.archived
                ? customerAdjustments(
                    0,
                    0,
                    orders.filter(
                      (order) =>
                        customerNameKey(order.customer) ===
                        customerNameKey(name),
                    ),
                  )
                : {}),
            },
            { merge: true },
          );
        else await addDoc(userCollection(uid, "customers"), customer);
        showToast("Cliente adicionado");
      }
      setModal(null);
    } catch (error) {
      console.error(error);
      showToast(
        error instanceof Error && !error.name.startsWith("Firebase")
          ? error.message
          : "Não foi possível concluir agora",
      );
    }
  };

  const updateStatus = async (order: Order, status: OrderStatus) => {
    if (firebaseState !== "live") throw new Error("Aguarde a conexão para atualizar a etapa.");
    try {
      await updateDoc(userDocument(uid, "orders", order.id), { status });
      showToast(status === "Entregue" ? "Pedido movido para Entregues" : "Etapa do pedido atualizada");
    } catch {
      throw new Error("Não foi possível salvar a etapa. Tente novamente.");
    }
  };

  const deleteOrder = async (order: Order) => {
    if (firebaseState !== "live") throw new Error("Aguarde a conexão para excluir o pedido.");
    const confirmed = window.confirm(`Excluir o pedido “${order.product}” de ${order.customer}? O pedido sai da Produção e dos totais. Os recebimentos registrados e as anotações ficam no histórico.`);
    if (!confirmed) return;
    try {
      await deleteDoc(userDocument(uid, "orders", order.id));
      showToast("Pedido excluído");
    } catch {
      throw new Error("Não foi possível excluir o pedido. Tente novamente.");
    }
  };

  const saveDtf = async (input: DtfInput, previous?: DtfOrder) => {
    if (!uid || dtfConnection !== "live") throw new Error("Aguarde a sincronização dos pedidos DTF.");
    const original = previous && { ...previous, quantity: previous.quantity ?? 0, referencePhotos: previous.referencePhotos ?? "" };
    const changes = original ? Object.fromEntries(Object.entries(input).filter(([field, value]) => original[field as keyof DtfInput] !== value)) : input;
    const data = { ...changes, updatedAt: serverTimestamp() };
    try {
      const batch = writeBatch(getFirestore(getApps()[0]));
      if (previous) batch.update(userDocument(uid, "dtfOrders", previous.id), data);
      else batch.set(doc(userCollection(uid, "dtfOrders")), { ...data, createdAt: serverTimestamp() });
      const linked = indexDtfCustomerLinks(visibleCustomers, orders, notes).get(input.customerId);
      if (linked?.orderId && (previous ? input.photoData !== previous.photoData : !!input.photoData)) batch.update(userDocument(uid, "orders", linked.orderId), { photoData: input.photoData });
      await batch.commit();
      showToast(previous ? "Pedido DTF atualizado" : "Pedido DTF cadastrado");
    } catch { throw new Error("Não foi possível salvar o pedido DTF. Confira a conexão e tente novamente."); }
  };

  const moveDtf = async (id: string, stage: DtfStage) => {
    if (!uid || dtfConnection !== "live") throw new Error("Aguarde a sincronização dos pedidos DTF.");
    try { await updateDoc(userDocument(uid, "dtfOrders", id), { stage, updatedAt: serverTimestamp() }); }
    catch { throw new Error("Não foi possível alterar a etapa do pedido DTF."); }
    showToast(`Pedido DTF · ${stage}`);
  };

  const deleteDtf = async (id: string) => {
    if (!uid || dtfConnection !== "live") throw new Error("Aguarde a sincronização dos pedidos DTF.");
    try { await deleteDoc(userDocument(uid, "dtfOrders", id)); }
    catch { throw new Error("Não foi possível excluir o pedido DTF."); }
    showToast("Pedido DTF excluído");
  };

  const separateDtf = async (id: string, separated: boolean) => {
    if (!uid || dtfConnection !== "live") throw new Error("Aguarde a sincronização dos pedidos DTF.");
    try { await updateDoc(userDocument(uid, "dtfOrders", id), { separated, updatedAt: serverTimestamp() }); }
    catch { throw new Error("Não foi possível salvar a separação do pedido DTF."); }
  };

  const updateDtfPrints = async (id: string, change: DtfPrintChange) => {
    if (!uid || dtfConnection !== "live") throw new Error("Aguarde a sincronização dos pedidos DTF.");
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const reference = userDocument(uid, "dtfOrders", id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Este metro DTF já foi removido.");
      transaction.update(reference, { printsData: changeDtfPrints(snapshot.data().printsData, change), updatedAt: serverTimestamp() });
    });
  };

  const updateRestock = async (id: string, change: RestockChange) => {
    if (!uid || firebaseState !== "live") throw new Error("Aguarde a sincronização do estoque.");
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const reference = userDocument(uid, "notes", id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Este item já foi removido.");
      const value = changeRestockNote({ ...snapshot.data(), id } as BusinessNote, change);
      transaction.update(reference, { ...value, updatedAt: serverTimestamp() });
    });
  };

  const saveRestock = async (input: RestockInput, id?: string) => {
    if (!uid || firebaseState !== "live") throw new Error("Aguarde a sincronização do estoque.");
    if (id) await updateRestock(id, { type: "edit", ...input });
    else await setDoc(userDocument(uid, "notes", restockPrefix + makeId()), { ...newRestockNote(input), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  };

  const saveTask = async (title: string, id?: string, customerId = "") => {
    if (!uid || taskConnection !== "live") throw new Error("Aguarde a sincronização dos afazeres.");
    const clean = title.trim();
    if (!clean || clean.length > 200) throw new Error("Escreva uma tarefa de até 200 caracteres.");
    if (customerId && !customers.some(customer => customer.id === customerId && !customer.archived) && !tasks.some(task => task.id === id && task.customerId === customerId)) throw new Error("Cliente indisponível.");
    if (id) await updateDoc(userDocument(uid, "tasks", id), { title: clean, customerId: customerId || deleteField() });
    else await addDoc(userCollection(uid, "tasks"), { title: clean, ...(customerId ? { customerId } : {}), completed: false, createdAt: serverTimestamp(), completedAt: null });
  };

  const toggleTask = async (id: string, completed: boolean) => {
    if (!uid || taskConnection !== "live") throw new Error("Aguarde a sincronização dos afazeres.");
    await updateDoc(userDocument(uid, "tasks", id), { completed, completedAt: completed ? serverTimestamp() : null });
  };

  const deleteTask = async (id: string) => {
    if (!uid || taskConnection !== "live") throw new Error("Aguarde a sincronização dos afazeres.");
    await deleteDoc(userDocument(uid, "tasks", id));
  };

  const saveHistory = async (input: HistoryInput, id?: string) => {
    if (!uid || historyConnection !== "live") throw new Error("Aguarde a sincronização do histórico.");
    validateHistoryInput(input);
    if (id && !historyEntries.some(entry => entry.id === id && entry.source === "manual")) throw new Error("Este registro já foi removido.");
    try {
      if (id) await updateDoc(userDocument(uid, "historyEntries", id), input);
      else await addDoc(userCollection(uid, "historyEntries"), { ...input, source: "manual" });
    } catch {
      throw new Error("Não foi possível salvar o registro. Confira a conexão e tente novamente.");
    }
    showToast(id ? "Registro atualizado" : "Registro adicionado ao histórico");
  };

  const deleteHistory = async (id: string) => {
    if (!uid || historyConnection !== "live") throw new Error("Aguarde a sincronização do histórico.");
    if (!historyEntries.some(entry => entry.id === id && entry.source === "manual")) return;
    try { await deleteDoc(userDocument(uid, "historyEntries", id)); }
    catch { throw new Error("Não foi possível excluir o registro."); }
    showToast("Registro excluído");
  };

  const updateMaterialPurchase = async (id: string, materialIds: string[], mode: "complete" | "reopen" | "date", date = historyDate(Date.now())) => {
    if (!uid) throw new Error("Entre na sua conta para registrar a compra.");
    const noteRef = userDocument(uid, "notes", id);
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const snapshot = await transaction.get(noteRef);
      if (!snapshot.exists()) throw new Error("Esta anotação foi removida.");
      const note = snapshot.data() as BusinessNote;
      const sourceOrder = orders.find(order => order.id === notePhotoOrderId(readDocument(note.content), orders, customers));
      const materials = (note.materials ?? []).map(material => mode === "complete" && materialIds.includes(material.id) && !note.purchasedMaterialIds?.includes(material.id) ? forecastMaterial(material, sourceOrder?.quantity) : material);
      const previous = new Set(note.purchasedMaterialIds);
      const selected = new Set(materialIds);
      const targets = materials.filter(material => selected.has(material.id) && previous.has(material.id) === (mode !== "complete"));
      const refs = targets.map(material => userDocument(uid, "historyEntries", materialHistoryId(id, material.id)));
      const existing = mode === "date" ? await Promise.all(refs.map(ref => transaction.get(ref))) : [];

      for (const [index, material] of targets.entries()) {
        const ref = refs[index];
        if (mode === "reopen") transaction.delete(ref);
        else if (!existing[index]?.exists()) {
          const entry = fabricHistoryEntry(note, material, date);
          if (entry) transaction.set(ref, entry);
        }
      }
      if (mode !== "date") transaction.update(noteRef, { ...(mode === "complete" ? { materials } : {}), purchasedMaterialIds: updatePurchasedMaterials(materials, note.purchasedMaterialIds, materialIds, mode === "complete") });
    });
  };

  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingOrder || firebaseState !== "live")
      return showToast("Firestore ainda não está conectado");
    const form = new FormData(event.currentTarget);
    const updatedOrder = {
      shirtType:
        form.get("shirtType") === "polo"
          ? ("polo" as const)
          : ("standard" as const),
      customer: String(form.get("customer")).trim(),
      phone: String(form.get("phone") || ""),
      product: String(form.get("product")),
      quantity: Number(form.get("quantity")),
      ...(String(form.get("unitPrice") || "").trim() !== ""
        ? {
            unitPrice:
              form.get("pricingMode") === "quantity"
                ? suggestedShirtPrice(Number(form.get("quantity")))
                : Number(form.get("unitPrice")),
            childQuantity: Number(form.get("childQuantity")),
          childUnitPrice: String(form.get("childUnitPrice") ?? "") === "" ? null : Number(form.get("childUnitPrice")),
            pricingMode:
              form.get("pricingMode") === "quantity"
                ? ("quantity" as const)
                : ("manual" as const),
          }
        : {}),
      total: Number(form.get("total")),
      paid: Number(form.get("paid")),
      dueDate: String(form.get("dueDate")),
      status: String(form.get("status")) as OrderStatus,
      dtfStatus: String(form.get("dtfStatus")) as OrderDtfStatus,
      notes: String(form.get("notes") || ""),
      photoData: String(form.get("photoData") || ""),
    };
    if (updatedOrder.unitPrice !== undefined) {
      validateShirtPrice(
        updatedOrder.unitPrice + poloExtra(updatedOrder.shirtType),
        updatedOrder.quantity,
        updatedOrder.childQuantity || 0,
        updatedOrder.childUnitPrice,
      );
      updatedOrder.total = shirtTotal(
        updatedOrder.unitPrice + poloExtra(updatedOrder.shirtType),
        updatedOrder.quantity,
        updatedOrder.childQuantity || 0,
        updatedOrder.childUnitPrice,
      );
    }
    const partialPayment = Number(form.get("partialPayment") || 0);
    const previousPaid = updatedOrder.paid;
    updatedOrder.paid = roundMoney(previousPaid + partialPayment);
    if (!Number.isFinite(partialPayment) || !Number.isFinite(previousPaid) || previousPaid < 0 || partialPayment < 0 || (partialPayment > 0 && (updatedOrder.status === "Orçamento" || editingOrder.status === "Orçamento" || updatedOrder.paid > updatedOrder.total))) throw new Error("Confira o valor do pagamento e o saldo do pedido.");
    if (updatedOrder.paid < 0 || (updatedOrder.paid > updatedOrder.total && updatedOrder.paid > editingOrder.paid))
      throw new Error("O recebido excede o total do pedido.");
    const db = getFirestore(getApps()[0]);
    const customerKey =
      updatedOrder.customer
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || editingOrder.id;
    await runTransaction(db, async (transaction) => {
      const orderRef = userDocument(uid, "orders", editingOrder.id);
      const current = await transaction.get(orderRef);
      if (!current.exists()) throw new Error("Este pedido foi excluído.");
      const latestNotes = await Promise.all(
        notes
          .filter((note) => note.id !== sewingNoteId)
          .map((note) => transaction.get(userDocument(uid, "notes", note.id))),
      );
      const sourceNotes = latestNotes
        .filter((note) => note.exists())
        .map((note) => ({ ...note.data(), id: note.id }) as BusinessNote);
      const latestRaw = { ...current.data(), id: current.id } as Order;
      const effective = synchronizedOrderQuantities(
        storedOrders.map((order) =>
          order.id === latestRaw.id ? latestRaw : order,
        ),
        sourceNotes,
        customers,
      ).find((order) => order.id === latestRaw.id)!;
      if (
        current.data().paid !== editingOrder.paid ||
        (effective.childUnitPrice ?? null) !== (editingOrder.childUnitPrice ?? null) ||
        (partialPayment > 0 && effective.status === "Orçamento") ||
        effective.total !== editingOrder.total ||
        effective.quantity !== editingOrder.quantity
      ) {
        throw new Error(
          "O valor do pedido mudou. Feche a edição, confira os valores e tente novamente.",
        );
      }
      const linkedPayments = transactions.filter(
        (item) => item.orderId === editingOrder.id,
      );
      transaction.update(orderRef, {
        ...updatedOrder,
        quantity:
          effective.checklistQuantity !== undefined
            ? current.data().quantity
            : updatedOrder.quantity,
        ...(effective.checklistQuantity !== undefined &&
        updatedOrder.unitPrice !== undefined
          ? { childQuantity: current.data().childQuantity || 0 }
          : {}),
        photoData:
          updatedOrder.photoData === editingOrder.photoData
            ? (current.data().photoData ?? updatedOrder.photoData)
            : updatedOrder.photoData,
      });
      const existingCustomer = customers.find(
        (customer) =>
          customerNameKey(customer.name) ===
          customerNameKey(updatedOrder.customer),
      );
      transaction.set(
        userDocument(uid, "customers", existingCustomer?.id ?? customerKey),
        { name: updatedOrder.customer, phone: updatedOrder.phone },
        { merge: true },
      );
      if (previousPaid !== editingOrder.paid) {
        const manual = linkedPayments.filter(
          (item) => !item.source || item.source === "order_payment",
        );
        const recorded = roundMoney(
          linkedPayments
            .filter(
              (item) =>
                item.type === "income" &&
                item.source &&
                item.source !== "order_payment",
            )
            .reduce((sum, item) => sum + item.amount, 0) - linkedPayments.filter(item => item.source === "customer_refund").reduce((sum,item)=>sum+item.amount,0),
        );
        const amount = roundMoney(previousPaid - recorded);
        if (amount < 0)
          throw new Error(
            "O valor é menor que os recebimentos já registrados para este pedido.",
          );
        const payment = {
          description: `Entrada · ${updatedOrder.customer}`,
          amount,
          type: "income",
          account: "business",
          category: "Vendas",
          orderId: editingOrder.id,
        };
        if (amount > 0) {
          if (manual[0])
            transaction.update(
              userDocument(uid, "transactions", manual[0].id),
              payment,
            );
          else
            transaction.set(doc(userCollection(uid, "transactions")), {
              ...payment,
              source: "order_payment",
              transactionDate: localDateValue(),
              createdAt: serverTimestamp(),
            });
        }
        manual
          .slice(amount > 0 ? 1 : 0)
          .forEach((item) =>
            transaction.delete(userDocument(uid, "transactions", item.id)),
          );
      }
      if (partialPayment > 0) transaction.set(doc(userCollection(uid, "transactions")), {
        description: "Pagamento parcial · " + updatedOrder.customer,
        amount: roundMoney(partialPayment), type: "income", account: "business", category: "Vendas",
        orderId: editingOrder.id, source: "customer_receipt", transactionDate: localDateValue(), createdAt: serverTimestamp(),
      });
    });
    setEditingOrder(null);
    showToast("Pedido e financeiro atualizados");
  };

  const saveCustomerValues = async (
    customer: CustomerBalance,
    total: number,
    pending: number,
  ) => {
    if (firebaseState !== "live")
      throw new Error("Firestore ainda não está conectado");
    const key = customerNameKey(customer.name);
    const related = orders.filter(
      (order) => customerNameKey(order.customer) === key,
    );
    await runTransaction(getFirestore(getApps()[0]), async (transaction) => {
      const reference = userDocument(uid, "customers", customer.id);
      const snapshot = await transaction.get(reference);
      const orderSnapshots = await Promise.all(
        related.map((order) =>
          transaction.get(userDocument(uid, "orders", order.id)),
        ),
      );
      const sourceOrders = orderSnapshots
        .filter((item) => item.exists())
        .map((item) => ({ ...item.data(), id: item.id }) as Order);
      const noteSnapshots = await Promise.all(
        notes
          .filter((note) => note.id !== sewingNoteId)
          .map((note) => transaction.get(userDocument(uid, "notes", note.id))),
      );
      const liveNotes = noteSnapshots
        .filter((note) => note.exists())
        .map((note) => ({ ...note.data(), id: note.id }) as BusinessNote);
      const currentOrders = synchronizedOrderQuantities(
        [
          ...storedOrders.filter(
            (order) => !related.some((item) => item.id === order.id),
          ),
          ...sourceOrders,
        ],
        liveNotes,
        customers,
      ).filter((order) => customerNameKey(order.customer) === key);
      const current = snapshot.exists()
        ? ({ ...snapshot.data(), id: snapshot.id } as Customer)
        : customer;
      const [balance] = customerBalances([current], currentOrders);
      if (
        current.archived ||
        balance.total !== customer.total ||
        balance.pending !== customer.pending
      ) {
        throw new Error(
          "Os valores do cliente mudaram. Abra a edição novamente para conferir o saldo atualizado.",
        );
      }
      transaction.set(
        reference,
        {
          name: current.name,
          phone: current.phone,
          ...customerAdjustments(total, pending, currentOrders),
        },
        { merge: true },
      );
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

  const receiveCustomer = async (customer: CustomerBalance, refund = false) => {
    const amount = refund ? customer.credit ?? 0 : customer.pending;
    if (amount <= 0 || !window.confirm(refund ? "Registrar devolução de " + displayMoney(amount) + " para " + customer.name + "?" : "Confirmar o recebimento de " + displayMoney(amount) + " de " + customer.name + "?")) return;
    if (firebaseState !== "live")
      throw new Error("Firestore ainda não está conectado");
    const related = orders.filter(
      (order) =>
        customerNameKey(order.customer) === customerNameKey(customer.name),
    );
    if (related.length > 180)
      throw new Error("Receba os pedidos em lotes menores.");
    await runTransaction(getFirestore(getApps()[0]), async (transaction) => {
      const customerRef = userDocument(uid, "customers", customer.id);
      const customerSnapshot = await transaction.get(customerRef);
      const orderSnapshots = await Promise.all(
        related.map((order) =>
          transaction.get(userDocument(uid, "orders", order.id)),
        ),
      );
      const sourceOrders = orderSnapshots
        .filter((snapshot) => snapshot.exists())
        .map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as Order);
      const noteSnapshots = await Promise.all(
        notes
          .filter((note) => note.id !== sewingNoteId)
          .map((note) => transaction.get(userDocument(uid, "notes", note.id))),
      );
      const liveNotes = noteSnapshots
        .filter((note) => note.exists())
        .map((note) => ({ ...note.data(), id: note.id }) as BusinessNote);
      const currentOrders = synchronizedOrderQuantities(
        [
          ...storedOrders.filter(
            (order) => !related.some((item) => item.id === order.id),
          ),
          ...sourceOrders,
        ],
        liveNotes,
        customers,
      ).filter(
        (order) =>
          customerNameKey(order.customer) === customerNameKey(customer.name),
      );
      const current = customerSnapshot.exists()
        ? ({ ...customerSnapshot.data(), id: customerSnapshot.id } as Customer)
        : customer;
      if (refund) {
        const credit = customerBalances([current], currentOrders)[0]?.credit ?? 0;
        if (current.archived || credit !== amount) throw new Error("O crédito mudou. Confira o saldo atualizado.");
        for (const update of customerRefund(credit, currentOrders)) {
          transaction.update(userDocument(uid,"orders",update.id), {paid:update.paid});
          transaction.set(doc(userCollection(uid,"transactions")), {
            description:"Devolução · "+current.name, amount:update.amount, type:"expense", account:"business",
            category:"Devoluções", source:"customer_refund", orderId:update.id, customerId:current.id, transactionDate:localDateValue(), createdAt:serverTimestamp(),
          });
        }
        return;
      }
      const receipt = customerReceipt(current, currentOrders);
      if (roundMoney(receipt.amount) !== roundMoney(customer.pending))
        throw new Error(
          "O saldo mudou. Confira o valor atualizado e tente novamente.",
        );
      for (const payment of receipt.payments) {
        transaction.update(userDocument(uid, "orders", payment.orderId), {
          paid: payment.paid,
          total: currentOrders.find((order) => order.id === payment.orderId)!
            .total,
        });
        transaction.set(doc(userCollection(uid, "transactions")), {
          description: "Recebimento · " + current.name,
          amount: payment.amount,
          type: "income",
          account: "business",
          category: "Vendas",
          source: "customer_receipt",
          customerId: current.id,
          orderId: payment.orderId,
          transactionDate: localDateValue(),
          createdAt: serverTimestamp(),
        });
      }
      if (receipt.unallocated > 0)
        transaction.set(doc(userCollection(uid, "transactions")), {
          description: "Recebimento · " + current.name,
          amount: receipt.unallocated,
          type: "income",
          account: "business",
          category: "Vendas",
          source: "customer_receipt",
          customerId: current.id,
          transactionDate: localDateValue(),
          createdAt: serverTimestamp(),
        });
      transaction.set(
        customerRef,
        { name: current.name, phone: current.phone, ...receipt.adjustments },
        { merge: true },
      );
    });
    showToast(refund ? "Devolução registrada" : "Recebimento e pedidos atualizados");
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

  const openProductionList = async (order: Order) => {
    if (firebaseState !== "live") return showToast("Aguarde a conexão para abrir a lista.");
    const linked = notes.filter(note => { const document = readDocument(note.content); return document.orderId === order.id && document.status !== "trash"; })
      .sort((a, b) => Number(!!readDocument(b.content).productionChecklist) - Number(!!readDocument(a.content).productionChecklist) || millis(b.updatedAt) - millis(a.updatedAt))[0];
    if (linked) { setProductionList({ order, noteId: linked.id }); return; }
    try {
      const noteId = `production-${order.id}`;
      await runTransaction(getFirestore(getApps()[0]), async transaction => {
        const reference = userDocument(uid, "notes", noteId);
        const existing = await transaction.get(reference);
        if (existing.exists()) {
          if (readDocument(existing.data().content).status === "trash") throw new Error("A lista deste pedido está na lixeira. Restaure-a em Anotações.");
          return;
        }
        const draft = newDraft(`${order.customer} · ${order.product}`.slice(0, 200));
        draft.category = "Produção";
        draft.document.orderId = order.id;
        draft.document.customerId = visibleCustomers.find(customer => customerNameKey(customer.name) === customerNameKey(order.customer))?.id ?? "";
        draft.document.blocks = readDocument(order.notes ?? "").blocks;
        transaction.set(reference, { ...serializeDraft(draft), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      });
      setProductionList({ order, noteId });
    } catch (cause) { showToast(cause instanceof Error && !cause.name.startsWith("Firebase") ? cause.message : "Não foi possível abrir a lista. Tente novamente."); }
  };

  const payBill = async (bill: Bill) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    if (billIsSettled(bill)) return false;
    const receiving = bill.direction === "receivable";
    if (!window.confirm("Confirmar " + (receiving ? "recebimento" : "pagamento") + " de " + displayMoney(bill.amount) + " · " + bill.description + "?")) return false;
    const paymentDate = localDateValue();
    const month = paymentDate.slice(0, 7);
    await runTransaction(getFirestore(getApps()[0]), async (transaction) => {
      const reference = userDocument(uid, "bills", bill.id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Esta conta foi excluída. Atualize a página.");
      const current = { ...snapshot.data(), id: snapshot.id } as Bill;
      if (billIsSettled(current, month)) throw new Error("Esta conta já foi concluída.");
      if (current.amount !== bill.amount || current.direction !== bill.direction || current.billingType !== bill.billingType) {
        throw new Error("A conta mudou. Confira os dados atualizados antes de confirmar.");
      }
      transaction.set(userDocument(uid, "transactions", billPaymentId(bill.id, current.billingType === "once" ? "once" : month)), { description: current.description, amount: current.amount, type: current.direction === "receivable" ? "income" : "expense", account: current.account, category: current.category, source: "bill", billId: current.id, transactionDate: paymentDate, createdAt: serverTimestamp() });
      transaction.update(reference, { lastPaidMonth: month, ...(current.billingType === "once" ? { settled: true } : {}), ...(current.billingType === "installment" ? { paidInstallments: (current.paidInstallments ?? 0) + 1 } : {}) });
    });
    showToast(receiving ? "Recebimento registrado" : "Pagamento registrado");
    return true;
  };

  const undoBillPayment = async (bill: Bill) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    const expected = currentBillExpense(bill, transactions);
    if (!window.confirm(`Desfazer o pagamento de “${bill.description}” e voltar a conta para A pagar?`)) return;
    await runTransaction(getFirestore(getApps()[0]), async transaction => {
      const reference = userDocument(uid, "bills", bill.id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error("Esta conta foi excluída.");
      const current = { ...snapshot.data(), id: snapshot.id } as Bill;
      if (current.direction === "receivable" || !billIsSettled(current) || current.lastPaidMonth !== bill.lastPaidMonth || current.billingType !== bill.billingType || current.paidInstallments !== bill.paidInstallments) {
        throw new Error("A conta mudou. Confira os dados atualizados antes de desfazer.");
      }
      const periods = current.lastPaidMonth ? [current.lastPaidMonth, "once"] : ["once"];
      const payments = await Promise.all(periods.map(period => transaction.get(userDocument(uid, "transactions", billPaymentId(bill.id, period)))));
      const recorded = currentBillExpense(current, payments.flatMap(payment => payment.exists() ? [{ ...payment.data(), id: payment.id } as Transaction] : []));
      if (recorded?.id !== expected?.id || millis(recorded?.createdAt) !== millis(expected?.createdAt)) {
        throw new Error("O pagamento mudou. Confira os dados atualizados antes de desfazer.");
      }
      if (recorded) transaction.delete(userDocument(uid, "transactions", recorded.id));
      const reversal = billReversal(current, transactions);
      transaction.update(reference, { ...reversal, lastPaidMonth: reversal.lastPaidMonth ?? deleteField() });
    });
    showToast("Pagamento desfeito. Conta voltou para A pagar.");
  };

  const deleteBill = async (bill: Bill, confirmed = false) => {
    if (firebaseState !== "live") throw new Error("Firestore ainda não está conectado");
    if (!confirmed && !window.confirm("Excluir a conta “" + bill.description + "”? O histórico de pagamentos será mantido.")) return;
    await deleteDoc(userDocument(uid, "bills", bill.id));
    showToast("Conta removida");
  };

  if (!authReady) return <StartupLoading />;
  if (!isFirebaseConfigured) return <ConnectionErrorScreen message="Confira as variáveis NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID e NEXT_PUBLIC_FIREBASE_APP_ID." />;
  if (!user) return <AuthScreenV2 error={authError} onSignIn={signInGoogle} />;
  const accountFirstName = user.displayName?.trim().split(/\s+/)[0];
  if (!dataReady || !interfaceAppearance.ready) return <StartupLoading firstName={accountFirstName} />;

  const userName = user.displayName || "Usuário PSYZON";
  const firstName = accountFirstName || "";
  const initials = userName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const floatingActive = floatingHost !== null;
  const photoOrders = synchronizedOrderPhotos(orders, notes, dtfOrders, visibleCustomers);
  const photoProductionOrders = productionOrders.map(order => photoOrders.find(item => item.id === order.id) ?? order);

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-view={view} data-layout="premium">
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <button className="brand" onClick={() => setView("inicio")} aria-label="Ir para o início">
            <Image className="brand-mark" src="/icon-192-v3.png" alt="" width={34} height={34} priority />
            <span><b>PSYZON</b><small>GO</small></span>
          </button>
          <button className="sidebar-collapse-button" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? "Abrir menu lateral" : "Fechar menu lateral"} aria-expanded={!sidebarCollapsed}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
        </div>
        <nav>
          {navGroups.map((group) => <div className="nav-group" key={group.label}><small>{group.label}</small>{group.items.map((item) => <NavButton key={item.id} item={item} active={view === item.id || (["materiais", "afazeres", "reposicao", "costureiras"].includes(view) && item.id === "notas")} onClick={() => setView(item.id)} />)}</div>)}
        </nav>
        <div className={`sync-status ${firebaseState}`}><span /><b>{firebaseState === "live" ? "Firebase em tempo real" : firebaseState === "connecting" ? "Conectando…" : "Erro de sincronização"}</b></div>
        <button className="profile" onClick={() => setView("mais")}><span>{initials}</span><span><b>{userName}</b><small>{user.email}</small></span><ChevronRight size={15} /></button>
      </aside>

      <main className="main">
        <header className={`topbar ${noteViews.includes(view) ? "notes-topbar" : ""}`}>
          <button className="mobile-logo" onClick={() => setView("inicio")} aria-label="Ir para o início"><Image className="brand-mark" src="/icon-192-v3.png" alt="" width={29} height={29} priority /><b>PSYZON</b></button>
          {noteViews.includes(view) ? <NotesNavigation view={view} navigate={setView} /> : <div className="search-wrap">
            <Search size={18} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar em tudo…" aria-label="Buscar cliente, pedido ou produto" />
            <kbd>/</kbd>
            {!!searchResults.length && <div className="search-results">{searchResults.map((order) => <button key={order.id} onClick={() => { setView("producao"); setSearch(""); }}><span><b>{order.customer}</b><small>{order.product}</small></span><strong>{displayMoney(orderBalances.get(order.id) ?? 0)}<small>pendente</small></strong></button>)}</div>}
          </div>}
          <div className="top-actions">
            <button className={`floating-mode-action ${floatingActive ? "active" : ""}`} onClick={toggleFloatingMode} aria-label={floatingActive ? "Desativar modo flutuante" : "Ativar modo flutuante"} aria-pressed={floatingActive}><PictureInPicture2 size={18} /><span>{floatingActive ? "Flutuante ativo" : "Modo flutuante"}</span></button>
            <button className="values-privacy-action" onClick={() => requestPrivacy(!privateValues)} aria-haspopup="dialog" aria-label={privateValues ? "Mostrar totais a pagar e a receber" : "Ocultar totais a pagar e a receber"} title={privateValues ? "Mostrar totais a pagar e a receber" : "Ocultar totais a pagar e a receber"}>{privateValues ? <EyeOff size={19} /> : <Eye size={19} />}</button>
            <button className="desktop-action" onClick={() => setDark((value) => !value)} aria-label="Alternar tema">{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
            <button className="notification" onClick={() => setNotificationsOpen((value) => !value)} aria-label={`${notifications.length} notificações`} aria-expanded={notificationsOpen}><Bell size={19} />{!!notifications.length && <span>{notifications.length > 9 ? "9+" : notifications.length}</span>}</button>
            {notificationsOpen && <div className="notification-panel"><header><div><b>Notificações</b><small>{notifications.length ? `${notifications.length} item(ns) precisam de atenção` : "Tudo em dia por aqui"}</small></div><button onClick={() => setNotificationsOpen(false)} aria-label="Fechar notificações"><X size={16} /></button></header><div>{notifications.length ? notifications.map((item) => <button className="notification-item" key={item.id} onClick={() => openNotification(item)}><span className={item.tone}>{item.tone === "danger" ? <AlertTriangle size={15} /> : <Bell size={15} />}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={15} /></button>) : <div className="notification-empty"><Check size={20} /><b>Nenhuma pendência próxima</b><small>Pedidos e contas aparecerão aqui.</small></div>}</div></div>}
          </div>
        </header>

        <section ref={contentRef} className={`content ${view === "notas" ? "notes-content" : ""}`}>
          {nextPayables && <Dashboard alerts={alerts} orderTasks={orderTasks} today={calendarDate} sewingTotal={sewingTotal} userName={firstName} orders={activeOrders} deliveredReceivables={productionOrders.filter(order => order.status === "Entregue" && order.receivable > 0)} pending={pending} payable={payable} nextPayables={nextPayables} debtorsCount={debtors.length} overdue={overdue} urgent={urgent} dtfAlertCount={dtfAlertCount} openDtfAlerts={() => { window.scrollTo({ top: 0, behavior: "instant" }); setNotificationsOpen(true); }} displayMoney={displayMoney} displayTotal={displayTotal} setModal={setModal} setView={setView} />}
          {view === "producao" && <ProductionBoard orderPayments={orderPayments} today={calendarDate} alerts={alerts} openAlert={alert => setView(alert.view, alert.id)} orderTasks={orderTasks} taskConnection={taskConnection} toggleTask={toggleTask} openTasks={() => setView("afazeres")} openChecklist={order => void openProductionList(order)} orders={photoProductionOrders} displayMoney={displayMoney} updateStatus={updateStatus} onCreate={() => setModal("pedido")} editOrder={setEditingOrder} deleteOrder={deleteOrder} />}
          {view === "dtf" && <DtfWorkspace key={JSON.stringify([uid, dtfCustomerId])} orders={dtfOrders} customers={visibleCustomers} productionOrders={photoOrders} notes={notes} customerId={dtfCustomerId} connection={dtfConnection} today={calendarDate} displayMoney={displayMoney} displayTotal={displayTotal} clearCustomer={() => setView("dtf")} onSave={saveDtf} onMove={moveDtf} onSeparate={separateDtf} onDelete={deleteDtf} onPrintChange={updateDtfPrints} openNote={id => setView("notas", id)} />}
          {(view === "notas" || view === "materiais") && <NotesWorkspace key={JSON.stringify([uid, noteId])} uid={uid} initialNoteId={noteId} notes={notes.filter(note => note.id !== sewingNoteId && !note.id.startsWith(restockPrefix))} orders={photoOrders} customers={visibleCustomers} materialsOpen={view === "materiais"} openMaterials={() => setView("materiais")} openTasks={() => setView("afazeres")} openNote={id => setView("notas", id)} onCompleteMaterials={(id, ids, completed) => updateMaterialPurchase(id, ids, completed ? "complete" : "reopen")} />}
          {view === "afazeres" && <TasksWorkspace key={uid} customers={customers} tasks={tasks} connection={taskConnection} today={historyDate(Date.now())} back={() => setView("notas")} onSave={saveTask} onToggle={toggleTask} onDelete={deleteTask} />}
          {view === "reposicao" && <RestockWorkspace key={uid} items={stockItems} connection={firebaseState === "live" ? "live" : firebaseState === "error" ? "error" : "connecting"} today={calendarDate} displayMoney={displayMoney} openFinance={() => setView("financeiro")} onSave={saveRestock} onToggle={(id, completed) => updateRestock(id, { type: "toggle", completed })} onDelete={id => updateRestock(id, { type: "remove" })} />}
          {view === "clientes" && <CustomersWorkspace customers={visibleCustomers} displayMoney={displayMoney} onCreate={() => setModal("cliente")} onSave={saveCustomerValues} onDelete={deleteCustomer} dtfCount={customer => dtfLinks.filter(items => items.some(item => dtfForCustomer(item, customer))).length} openDtf={id => setView("dtf", id)} />}
          {view === "costureiras" && <SewingWorkspace orders={orders} ledger={sewingLedger} save={saveSewing} money={displayMoney} />}

          {view === "ai" && <PSYZONAI getIdToken={getAiToken} onNavigate={target => setView(target === "pessoal" ? "financeiro" : target)} />}
          {view === "financeiro" && <FinanceWorkspace today={calendarDate} restock={[...stockPayables,...sewingPayables]} openRestock={bill => setView(bill?.category === "Costura" ? "costureiras" : "reposicao")} bills={bills} transactions={transactions} customers={balances} currentMonth={calendarDate.slice(0, 7)} displayMoney={displayMoney} displayTotal={displayTotal} onSaveBill={saveBill} onSettleBill={payBill} onUndoPayment={undoBillPayment} onDeleteBill={deleteBill} onReceive={receiveCustomer} onRefund={customer => receiveCustomer(customer,true)} />}
          {view === "historico" && <HistoryWorkspace
            key={uid} today={historyDate(Date.now())} connection={historyConnection}
            rows={historyRows(orders, bills, transactions, historyEntries, calendarDate.slice(0, 7))}
            pendingKg={pendingFabric(notes)} undatedOrders={orders.filter(order => !historyDate(order.createdAt)).length}
            legacy={historyConnection === "live" ? legacyFabricPurchases(notes, historyEntries) : []}
            displayMoney={displayMoney} displayTotal={displayTotal} onSave={saveHistory} onDelete={deleteHistory}
            onDatePurchase={(id, ids, date) => updateMaterialPurchase(id, ids, "date", date)}
            openFinance={() => setView("financeiro")} openMaterials={() => setView("materiais")}
          />}


          {view === "mais" && <MoreView interfaceAppearance={interfaceAppearance} firebaseState={firebaseState} dark={dark} setDark={setDark} privateValues={privateValues} requestPrivacy={requestPrivacy} uiSize={uiSize} setUiSize={setUiSize} notificationsEnabled={notificationsEnabled} setNotificationsEnabled={changeNotifications} user={user} onSignOut={signOutGoogle} onReset={resetAllData} resetting={resetting} />}
        </section>
      </main>

      {view !== "ai" && <button type="button" className="ai-floating-button psyzon-ai-launch" aria-label="Abrir Psyzon AI" aria-haspopup="dialog" onClick={() => setAiPanelOpen(true)}><span><Sparkles size={20} /></span><span><b>Psyzon AI</b></span></button>}
      <dialog ref={aiPanelRef} className="ai-floating-panel psyzon-ai-dock" aria-label="Psyzon AI" onClose={() => setAiPanelOpen(false)} onClick={event => { if (event.target === event.currentTarget) setAiPanelOpen(false); }}>
        {aiPanelOpen && <PSYZONAI getIdToken={getAiToken} mode="panel" onClose={() => setAiPanelOpen(false)} onOpenFull={() => { setAiPanelOpen(false); setView("ai"); }} onNavigate={target => { setAiPanelOpen(false); setView(target === "pessoal" ? "financeiro" : target); }} />}
      </dialog>


      <MobileNavigation view={view} navigate={setView} /><SiteTypewriter page={view} />
      {productionList && <ProductionChecklistWindow customer={productionList.order.customer} close={() => setProductionList(null)}>
        {notes.some(note => note.id === productionList.noteId) ? <NotesWorkspace key={`${uid}-${productionList.noteId}`} productionOnly uid={uid} initialNoteId={productionList.noteId} notes={notes.filter(note => note.id === productionList.noteId)} orders={photoOrders} customers={visibleCustomers} materialsOpen={false} openMaterials={() => {}} openTasks={() => {}} openNote={() => {}} onCompleteMaterials={(id, ids, completed) => updateMaterialPurchase(id, ids, completed ? "complete" : "reopen")} /> : <p role="status">Carregando lista vinculada…</p>}
      </ProductionChecklistWindow>}
      {floatingHost && <FloatingTasks key={uid} host={floatingHost} customers={customers} tasks={tasks} connection={taskConnection} dark={dark} onToggle={toggleTask} openTasks={() => { setView("afazeres"); window.focus(); }} />}

      {modal && <CreateModalV2 kind={modal} setKind={setModal} close={() => setModal(null)} onSubmit={submitCreate} />}
      {editingOrder && <OrderEditModal order={editingOrder} close={() => setEditingOrder(null)} onSubmit={(event) => { void saveOrder(event).catch((error: unknown) => showToast(error instanceof Error && !error.name.startsWith("Firebase") ? error.message : "Não foi possível salvar o pedido. Confira os dados e tente novamente.")); }} />}



      {privacyTarget !== null && <ValuesPrivacyDialog hide={privacyTarget} getToken={() => user.getIdToken()} close={closePrivacy} confirm={confirmPrivacy} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
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
  return <button className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={onClick} title={item.label} aria-label={item.label}><Icon size={20} /><span>{item.label}</span></button>;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function StartupLoading({ firstName }: { firstName?: string }) {
  return <main className="loading-state" role="status" aria-label="Carregando Psyzon GO">
    <div className="loading-brand">
      <Image src="/icon-192-v3.png" alt="Psyzon GO" width={72} height={72} priority />
      <h1>{firstName ? `Boas-vindas, ${firstName}!` : "Boas-vindas ao Psyzon GO"}</h1>
      <div className="loading-track" aria-hidden="true"><span /></div>
    </div>
  </main>;
}

function Dashboard({ alerts, orderTasks, today, sewingTotal, userName, orders, deliveredReceivables, pending, payable, nextPayables, debtorsCount, overdue, urgent, dtfAlertCount, openDtfAlerts, displayMoney, displayTotal, setModal, setView }: any) {
  const byDeadline = (a: Order, b: Order) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  const priorityOrders = [
    ...orders.filter((order: Order) => order.status !== "Orçamento").sort(byDeadline),
    ...[...deliveredReceivables].sort(byDeadline),
  ].slice(0, 3);
  const date = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
  return <>
    <div className="page-heading">
      <div><span className="eyebrow">VISÃO DE HOJE</span><div className="greeting-row"><TypedHeading>{userName ? `Bom dia, ${userName}.` : "Bom dia."}</TypedHeading><button className="notes-entry-button" onClick={() => setView("notas")}><NotebookPen size={16} /> Bloco de notas</button></div><p>{date.charAt(0).toUpperCase() + date.slice(1)} · Tudo sob controle.</p></div>
      <button className="primary" onClick={() => setModal("pedido")}><Plus size={18} /> Novo pedido <kbd>N</kbd></button>
    </div>
    {dtfAlertCount > 0 && <button type="button" className="dashboard-dtf-alert" onClick={openDtfAlerts}><AlertTriangle size={18} /><span><b>DTF a pedir</b><small>{dtfAlertCount} {dtfAlertCount === 1 ? "pedido próximo do prazo ou atrasado" : "pedidos próximos do prazo ou atrasados"}</small></span><ChevronRight size={17} /></button>}
    <div className="metric-grid sewing-metrics">
      <Metric icon={WalletCards} label="A pagar" value={<CountUp value={payable} format={displayTotal} />} detail={<span>Contas pendentes</span>} onClick={() => setView("financeiro")} />
      <Metric icon={CircleDollarSign} label="A receber" value={<CountUp value={pending} format={displayTotal} />} detail={<span className="metric-detail-stack"><span>{debtorsCount} clientes pendentes</span><span className="next-payables"><span>A pagar em {nextPayables.label}</span><b><CountUp value={nextPayables.total} format={displayTotal} /></b></span></span>} onClick={() => setView("financeiro")} />
      <Metric icon={Boxes} label="Produção" value={<><CountUp value={orders.length} /> pedidos</>} detail={<><span>{urgent.length} entregas próximas</span>{overdue.length > 0 && <b className="negative">{overdue.length} atrasado</b>}</>} onClick={() => setView("producao")} />
      <Metric icon={Spool} label="Costureiras · A pagar" value={<CountUp value={sewingTotal} format={displayTotal} />} detail={<span>Saldo e descontos</span>} onClick={() => setView("costureiras")} />
    </div>

    <div className="dashboard-grid">
      <div className="main-column">
        {overdue.length > 0 && <section className="attention-card"><div className="section-title"><div><span className="alert-dot" /><h2>Precisa da sua atenção</h2></div><span>{overdue.length + debtorsCount} pendências</span></div>{overdue.slice(0, 1).map((order: Order) => <button key={order.id} onClick={() => setView("producao")}><span className="attention-icon"><Clock3 size={18} /></span><span><b>Pedido de {order.customer} está atrasado</b><small>{order.customer} · {order.product}</small></span><strong>{dueLabel(order.dueDate, order.status)}</strong><ChevronRight size={17} /></button>)}</section>}
        <section className="panel">
          <div className="section-title"><div><h2>Hoje</h2><span className="count">{priorityOrders.length}</span></div><button onClick={() => setView("producao")}>Ver produção <ChevronRight size={16} /></button></div>
          <div className="today-list">{priorityOrders.map((order: Order) => {
            const items = (alerts as Map<string, OrderAlert[]>).get(order.id) ?? [];
            const action = nextOrderAction(order, items, (orderTasks as ReadonlyMap<string, Task[]>).get(order.id) ?? []);
            const urgent = urgentOrder(order,today);
            return <div className="today-row" data-urgent={urgent} key={order.id}>
              <div><b>{order.customer}</b><small>{order.product} · {order.quantity} un.</small>
                {action && <div className="today-alerts"><button type="button" title={"detail" in action ? action.detail : undefined} onClick={() => setView(action.view, "id" in action ? action.id : undefined)}>{action.title}{"pending" in action && " · " + displayTotal(action.pending)} <ChevronRight size={13} aria-hidden="true" /></button></div>}
              </div>
              <span className={`due ${urgent ? "danger" : dueTone(order.dueDate,order.status)}`}>{dueLabel(order.dueDate,order.status)}</span>
            </div>;
          })}{!priorityOrders.length && <p className="finance-empty">Nenhuma próxima ação.</p>}</div>
        </section>
        <section className="panel"><div className="section-title"><div><h2>Próximas entregas</h2></div><button onClick={() => setView("producao")}>Ver todas <ChevronRight size={16} /></button></div><div className="delivery-list">{[...orders].sort((a: Order,b: Order)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999")).slice(0, 4).map((order: Order) => <div className="delivery-row" data-urgent={urgentOrder(order,today)} key={order.id}><div className="avatar">{order.customer.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="delivery-customer"><b>{order.customer}</b><small>{order.quantity} {order.product.toLowerCase()}</small></div><div className="delivery-date"><small>PRAZO</small><b>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${order.dueDate}T00:00:00`))}</b></div><div className="progress-cell"><ProgressBar value={statusProgress[order.status]} label={`Produção de ${order.customer}`} /><small>{order.status} · <CountUp value={statusProgress[order.status]} />%</small></div><div className="pending-cell"><small>PENDENTE</small><b>{displayMoney(order.receivable ?? Math.max(0, order.total - order.paid))}</b></div><ChevronRight size={17} /></div>)}</div></section>
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

function MoreView({ interfaceAppearance, firebaseState, dark, setDark, privateValues, requestPrivacy, uiSize, setUiSize, notificationsEnabled, setNotificationsEnabled, user, onSignOut, onReset, resetting }: any) {
  const sizes: { value: UISize; label: string; hint: string }[] = [
    { value: "compact", label: "Pequena", hint: "90%" },
    { value: "comfortable", label: "Normal", hint: "100%" },
    { value: "large", label: "Grande", hint: "114%" },
    { value: "extra-large", label: "Muito grande", hint: "128%" },
  ];
  return <><div className="page-heading compact"><div><span className="eyebrow">PREFERÊNCIAS</span><h1>Configurações</h1></div></div><AppearanceSettings {...interfaceAppearance} /><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Settings size={20} /></div><div><h3>Aparência e privacidade</h3></div><label><span><b>Tema escuro</b><small>Mais confortável à noite</small></span><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} /></label><label><span><b>Ocultar totais financeiros</b><small>Somente A pagar e A receber</small></span><input type="checkbox" checked={privateValues} onChange={(event) => requestPrivacy(event.target.checked)} /></label><div className="interface-size"><span><b>Tamanho das letras</b><small>Escolha um tamanho confortável para ler sem forçar a vista</small></span><div>{sizes.map((size) => <button key={size.value} type="button" aria-pressed={uiSize === size.value} className={uiSize === size.value ? "active" : ""} onClick={() => setUiSize(size.value)}><b>{size.label}</b><small>{size.hint}</small></button>)}</div></div></section><section className="panel settings-card"><div className="settings-icon"><Bell size={20} /></div><div><h3>Alertas importantes</h3></div><label><span><b>Notificações do sistema</b><small>No app mobile, todos os dias às 08:00, 14:00 e 19:00</small></span><input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} /></label><div className="settings-note"><AlertTriangle size={16} /><span>No Android, os lembretes são agendados no dispositivo e funcionam mesmo com o app fechado.</span></div></section><section className="panel settings-card settings-data"><div className="settings-icon"><BriefcaseBusiness size={20} /></div><div><h3>Dados e sincronização</h3></div><div className={`connection-box ${firebaseState}`}><span /><div><b>{firebaseState === "live" ? "Firestore conectado" : firebaseState === "error" ? "Falha na sincronização" : "Conectando ao Firestore"}</b><small>{firebaseState === "live" ? "Alterações sincronizadas em tempo real" : "Verificando a conexão com os dados"}</small></div></div><div className="account-row"><span><b>{user.displayName || "Conta Google"}</b><small>{user.email}</small></span><button className="secondary" onClick={onSignOut}><LogOut size={16} /> Sair</button></div><div className="danger-zone"><div><b>Resetar todos os dados</b><small>Apaga pedidos, clientes, contas e movimentações desta conta.</small></div><button className="danger-button" onClick={onReset} disabled={resetting}><RotateCcw size={16} /> {resetting ? "Apagando…" : "Resetar tudo"}</button></div></section></div></>;
}

function OrderDtfField({ value = "none" }: { value?: OrderDtfStatus }) {
  return <label className="full">DTF<select name="dtfStatus" aria-label="DTF" defaultValue={value}>{Object.entries(orderDtfStatus).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>;
}

function CreateModalV2({ kind, setKind, close, onSubmit }: { kind: CreateKind; setKind: (kind: CreateKind) => void; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><header><h2 id="create-title">{kind === "orcamento" ? "Novo orçamento" : kind === "pedido" ? "Novo pedido" : "Novo cliente"}</h2><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><div className="create-tabs"><button className={kind === "pedido" ? "active" : ""} onClick={() => setKind("pedido")}>Pedido</button><button className={kind === "orcamento" ? "active" : ""} onClick={() => setKind("orcamento")}>Orçamento</button><button className={kind === "cliente" ? "active" : ""} onClick={() => setKind("cliente")}>Cliente</button></div><form key={kind} onSubmit={onSubmit}>{kind !== "cliente" ? <><label className="full">Cliente<input name="customer" required autoFocus maxLength={120} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" maxLength={40} /></label><label className="full">Produto<input name="product" required maxLength={160} /></label><OrderPricingFields /><div className="form-row"><label>Prazo<input name="dueDate" type="date" defaultValue={isoOffset(7)} required /></label>{kind !== "orcamento" && <label>Valor recebido<input name="paid" type="number" min="0" step="0.01" defaultValue="0" /></label>}</div><OrderDtfField /><OrderPhotoField onBusyChange={setPhotoBusy} /><label className="full">Observação<textarea name="notes" rows={3} /></label></> : <><label className="full">Nome<input name="name" required autoFocus maxLength={120} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" maxLength={40} /></label><label className="full">Empresa (opcional)<input name="company" maxLength={160} /></label></>}<footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={photoBusy}><Check size={17} /> Salvar</button></footer></form></aside></div>;
}

function OrderEditModal({ order, close, onSubmit }: { order: Order; close: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><aside className="modal edit-order-modal"><header><div><span className="eyebrow">CORRIGIR PEDIDO</span><h2>Editar pedido</h2></div><button onClick={close} aria-label="Fechar"><X size={20} /></button></header><form onSubmit={onSubmit}><label className="full">Cliente<input name="customer" required autoFocus defaultValue={order.customer} /></label><label className="full">WhatsApp<input name="phone" inputMode="tel" defaultValue={order.phone ?? ""} /></label><label className="full">Produto<input name="product" required defaultValue={order.product} /></label><OrderPricingFields order={order} /><div className="form-row"><label>Prazo<input name="dueDate" type="date" required defaultValue={order.dueDate} /></label><label>Valor recebido<input name="paid" type="number" min="0" step="0.01" defaultValue={order.paid} /></label></div>{order.status !== "Orçamento" && <div className="full">{addingPayment ? <label>Novo pagamento<input name="partialPayment" type="number" min="0.01" step="0.01" required autoFocus /></label> : <button type="button" className="secondary" onClick={() => setAddingPayment(true)}><Plus size={16} /> Adicionar pagamento</button>}</div>}<label className="full">Status<select name="status" defaultValue={order.status}>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><OrderDtfField value={order.dtfStatus} /><OrderPhotoField initialValue={order.photoData} onBusyChange={setPhotoBusy} /><label className="full">Observação<textarea name="notes" rows={3} defaultValue={order.notes ?? ""} /></label><footer><button type="button" className="secondary" onClick={close}>Cancelar</button><button type="submit" className="primary" disabled={photoBusy}><Check size={17} /> Salvar alterações</button></footer></form></aside></div>;
}
