import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let environment: RulesTestEnvironment;

const validOrder = () => ({
  customer: "Cliente A",
  phone: "5571999999999",
  product: "Camisa polo",
  quantity: 10,
  total: 1000,
  paid: 250,
  dueDate: "2026-08-31",
  status: "Aprovado",
  notes: "Produção normal",
  createdAt: Timestamp.now(),
});

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "psyzon-go-rules-test",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => environment.clearFirestore());
after(async () => environment.cleanup());

test("orders accept unit pricing and reject invalid child counts", async () => {
 const db=environment.authenticatedContext("pricing-user").firestore();
 const reference=doc(db,"users/pricing-user/orders/a");
 await assertSucceeds(setDoc(reference,{...validOrder(),unitPrice:100,childQuantity:2,pricingMode:"quantity",shirtType:"polo"}));
 await assertFails(updateDoc(reference,{shirtType:"invalid"}));
 await assertFails(updateDoc(reference,{pricingMode:"invalid"}));
 await assertFails(updateDoc(reference,{unitPrice:-1}));
 await assertFails(updateDoc(reference,{childQuantity:11}));
 await assertFails(updateDoc(reference,{childQuantity:1.5}));
});

test("unauthenticated users cannot read or write", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users/user-a/orders/order-1")));
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-1"), validOrder()));
});

test("history records are owner-only and validate orders, bills, and material purchases", async () => {
  const owner = environment.authenticatedContext("user-a").firestore();
  const other = environment.authenticatedContext("user-b").firestore();
  const path = "users/user-a/historyEntries";
  const record = { kind: "orders", source: "manual", date: "2026-11-06", title: "Pedidos de novembro", quantity: 4, amount: 0, supplier: "", notes: "" };
  await assertSucceeds(setDoc(doc(owner, path, "orders"), record));
  await assertFails(setDoc(doc(owner, path, "fraction"), { ...record, quantity: 1.5 }));
  await assertFails(setDoc(doc(owner, path, "zero-bill"), { ...record, kind: "payable", quantity: 0 }));
  await assertFails(setDoc(doc(owner, path, "bad-date"), { ...record, date: "novembro" }));
  await assertFails(updateDoc(doc(owner, path, "orders"), { kind: "fabric", source: "material" }));
  await assertSucceeds(updateDoc(doc(owner, path, "orders"), { quantity: 5 }));
  await assertSucceeds(setDoc(doc(owner, path, "fabric"), { ...record, kind: "fabric", source: "material", title: "Malha PV", quantity: 2.5, amount: 112.34 }));
  assert.equal((await assertSucceeds(getDocs(collection(owner, path)))).size, 2);
  await assertFails(getDocs(collection(other, path)));
  await assertFails(setDoc(doc(other, path, "fabric"), record));
  await assertFails(deleteDoc(doc(other, path, "fabric")));
  await assertSucceeds(deleteDoc(doc(owner, path, "fabric")));
});

test("a task can be completed and reopened by its owner with valid timestamps", async () => {
  const owner = environment.authenticatedContext("user-a").firestore();
  const other = environment.authenticatedContext("user-b").firestore();
  const path = "users/user-a/tasks/first";
  const task = doc(owner, path);
  const value = { title: "Pedir estampas", completed: false, createdAt: serverTimestamp(), completedAt: null };
  await assertSucceeds(setDoc(task, value));
  await assertFails(updateDoc(task, { completed: true }));
  await assertSucceeds(updateDoc(task, { completed: true, completedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(task, { title: "Separar estampas" }));
  await assertFails(updateDoc(task, { title: "" }));
  await assertFails(updateDoc(task, { createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(task, { completed: false, completedAt: null }));
  await assertFails(getDoc(doc(other, path)));
  await assertFails(updateDoc(doc(other, path), { title: "Outro usuário" }));
  await assertSucceeds(deleteDoc(task));
});

test("a user can create, read, update and delete only their own valid order", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const reference = doc(db, "users/user-a/orders/order-1");
  await assertSucceeds(setDoc(reference, validOrder()));
  assert.equal((await assertSucceeds(getDoc(reference))).data()?.status, "Aprovado");
  await assertSucceeds(updateDoc(reference, { status: "Produção" }));
  await assertSucceeds(updateDoc(reference, { dtfStatus: "pending" }));
  await assertSucceeds(updateDoc(reference, { dtfStatus: "requested" }));
  await assertFails(updateDoc(reference, { dtfStatus: true }));
  await assertSucceeds(deleteDoc(reference));
});

test("user A cannot read, create, update or delete user B documents", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/user-b/orders/order-1"), validOrder());
  });
  const db = environment.authenticatedContext("user-a").firestore();
  const other = doc(db, "users/user-b/orders/order-1");
  await assertFails(getDoc(other));
  await assertFails(setDoc(doc(db, "users/user-b/orders/order-2"), validOrder()));
  await assertFails(updateDoc(other, { status: "Pronto" }));
  await assertFails(deleteDoc(other));
});

test("DTF orders support linked and avulso work, exact cent rounding and owner-only access", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const ref = doc(db, "users/user-a/dtfOrders/linked");
  const input = { title: "Estampas", customerId: "ana", customerName: "Ana", phone: "", lengthCm: 125, widthCm: 58, priceCents: 102, paidCents: 128, dueDate: "", stage: "Aguardando arte", artworkUrl: "https://example.com/art", notes: "", photoData: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref, input));
  await assertSucceeds(setDoc(doc(db, "users/user-a/dtfOrders/avulso"), { ...input, customerId: "", customerName: "", priceCents: 0, paidCents: 0 }));
  await assertSucceeds(setDoc(doc(db, "users/user-a/dtfOrders/rapido"), { ...input, title: "", customerId: "", customerName: "", lengthCm: 0, widthCm: 0, priceCents: 0, paidCents: 0, quantity: 0, artworkUrl: "", referencePhotos: "" }));
  await assertSucceeds(getDocs(collection(db, "users/user-a/dtfOrders")));
  await assertSucceeds(updateDoc(ref, { stage: "Em impressão", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { printsData: "[]", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { separated: true, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { separated: false, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { separated: "true", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { quantity: 3, referencePhotos: '["data:image/jpeg;base64,AAAA"]', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { quantity: 1.5, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { printsData: [], updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { paidCents: 129, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { stage: "Aprovado", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { artworkUrl: "javascript:alert(1)", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { photoData: "https://example.com/photo.svg", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  const other = environment.authenticatedContext("user-b").firestore();
  await assertFails(getDoc(doc(other, ref.path)));
  await assertFails(setDoc(doc(other, "users/user-a/dtfOrders/other"), input));
  await assertFails(deleteDoc(doc(other, ref.path)));
  await assertSucceeds(deleteDoc(ref));
});

test("users cannot list the root users collection or query all users through collectionGroup", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(getDocs(collectionGroup(db, "orders")));
});

test("unknown fields are rejected", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-1"), { ...validOrder(), admin: true }));
});

test("owners can adjust and remove customer cards without changing historical orders", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const reference = doc(db, "users/user-a/customers/ana");
  await assertSucceeds(setDoc(reference, { name: "ANA", phone: "", totalAdjustment: -100, pendingAdjustment: 200, archived: false }));
  await assertSucceeds(updateDoc(reference, { archived: true }));
  await assertFails(updateDoc(reference, { pendingAdjustment: "200" }));
  await assertFails(updateDoc(reference, { totalAdjustment: -100000001 }));
  await assertFails(updateDoc(reference, { archived: "yes" }));
  await assertFails(updateDoc(doc(environment.authenticatedContext("user-b").firestore(), "users/user-a/customers/ana"), { archived: false }));
});

test("customer receipts can update orders while privacy credentials remain server-only", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDoc(doc(db, "privateSettings/valuesPrivacy")));
  await assertFails(setDoc(doc(db, "privateSettings/valuesPrivacy"), { salt: "test", hash: "test" }));
  const order = doc(db, "users/user-a/orders/one");
  await assertSucceeds(setDoc(order, validOrder()));
  await assertSucceeds(updateDoc(order, { paid: 1000 }));
  await assertSucceeds(setDoc(doc(db, "users/user-a/transactions/receipt"), {
    description: "Recebimento", amount: 750, type: "income", account: "business",
    source: "customer_receipt", customerId: "cliente-a", orderId: "one",
  }));
});

test("one-time payable and receivable bills require valid due dates and settle correctly", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const reference = doc(db, "users/user-a/bills/supply");
  const bill = { description: "Material", amount: 100, account: "business", billingType: "once", direction: "payable", dueDate: "2026-11-20", dueDay: 20, category: "Material", createdAt: Timestamp.now() };
  await assertSucceeds(setDoc(reference, bill));
  await assertSucceeds(updateDoc(reference, { settled: true, lastPaidMonth: "2026-11" }));
  await assertSucceeds(setDoc(doc(db, "users/user-a/bills/receivable"), { ...bill, direction: "receivable" }));
  await assertFails(setDoc(doc(db, "users/user-a/bills/invalid"), { ...bill, direction: "other" }));
  const { dueDate: _dueDate, ...withoutDate } = bill;
  await assertFails(setDoc(doc(db, "users/user-a/bills/missing-date"), withoutDate));
});

test("order photos and production checklists are restricted to the owner and expected formats", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const photo = "data:image/jpeg;base64,/9j/AAAA";
  await assertSucceeds(setDoc(doc(db, "users/user-a/orders/photo"), { ...validOrder(), photoData: photo }));
  await assertFails(updateDoc(doc(db, "users/user-a/orders/photo"), { photoData: "https://example.com/image.svg" }));
  const note = { title: "Produção", content: "", category: "Produção", pinned: false, materials: [], updatedAt: Timestamp.now(), checklist: { client: "JERFESSON", deadline: "", notes: "", warnings: [], rows: [{ id: "1", model: "Masculina", size: "P", name: "Enzo", done: false }] } };
  await assertSucceeds(setDoc(doc(db, "users/user-a/notes/checklist"), note));
  await assertSucceeds(updateDoc(doc(db, "users/user-a/notes/checklist"), { productionPhotoData: photo }));
  await assertFails(updateDoc(doc(db, "users/user-a/notes/checklist"), { productionPhotoData: "https://example.com/photo.svg" }));
  await assertSucceeds(updateDoc(doc(db, "users/user-a/notes/checklist"), { productionPhotoData: "" }));
  await assertFails(updateDoc(doc(db, "users/user-a/notes/checklist"), { checklist: { ...note.checklist, rows: Array(501).fill({}) } }));
  await assertFails(getDoc(doc(environment.authenticatedContext("user-b").firestore(), "users/user-a/orders/photo")));
});

test("owners can mark materials bought without replacing the note", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const note = doc(db, "users/user-a/notes/purchase");
  await assertSucceeds(setDoc(note, { title: "Compra", content: "Texto preservado", category: "Compras", pinned: false, materials: [{ id: "material-1" }], updatedAt: Timestamp.now() }));
  await assertSucceeds(updateDoc(note, { purchasedMaterialIds: ["material-1"] }));
  const data = (await assertSucceeds(getDoc(note))).data();
  assert.equal(data?.content, "Texto preservado");
  assert.deepEqual(data?.materials, [{ id: "material-1" }]);
  await assertSucceeds(updateDoc(note, { purchasedMaterialIds: [] }));
  await assertFails(updateDoc(note, { purchasedMaterialIds: "material-1" }));
  await assertFails(updateDoc(doc(environment.authenticatedContext("user-b").firestore(), note.path), { purchasedMaterialIds: [] }));
});

test("invalid financial values and quantities are rejected", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-1"), { ...validOrder(), total: -1 }));
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-2"), { ...validOrder(), quantity: 0 }));
  await assertFails(setDoc(doc(db, "users/user-a/transactions/transaction-1"), {
    description: "Inválida", amount: -10, type: "expense", account: "business", createdAt: Timestamp.now(),
  }));
});

test("oversized strings and invalid statuses are rejected", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-1"), { ...validOrder(), customer: "x".repeat(121) }));
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-2"), { ...validOrder(), status: "Administrador" }));
});

test("valid statuses, bills, transactions and notes continue to work", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertSucceeds(setDoc(doc(db, "users/user-a/orders/order-1"), { ...validOrder(), status: "Entregue" }));
  await assertSucceeds(setDoc(doc(db, "users/user-a/bills/bill-1"), {
    description: "Internet", amount: 120, account: "business", billingType: "fixed", dueDay: 10,
    category: "Serviços", paidInstallments: 0, createdAt: Timestamp.now(),
  }));
  await assertSucceeds(setDoc(doc(db, "users/user-a/transactions/transaction-1"), {
    description: "Venda", amount: 500, type: "income", account: "business", category: "Vendas",
    transactionDate: "2026-08-15", createdAt: Timestamp.now(),
  }));
  await assertSucceeds(setDoc(doc(db, "users/user-a/notes/note-1"), {
    title: "Materiais", content: "Separar tecido", category: "Produção", pinned: false, materials: [],
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  }));
});

test("immutable creation and integration fields cannot be changed", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const reference = doc(db, "users/user-a/transactions/mp-1");
  await assertSucceeds(setDoc(reference, {
    description: "Pix", amount: 50, type: "income", account: "business", category: "Vendas",
    transactionDate: "2026-08-15", source: "mercado_pago", provider: "mercado_pago",
    providerTransactionId: "123", providerStatus: "approved", externalReference: null,
    feeAmount: 0, netAmount: 50, createdAt: Timestamp.now(),
  }));
  await assertFails(updateDoc(reference, { providerTransactionId: "999" }));
  await assertFails(updateDoc(reference, { createdAt: Timestamp.now() }));
});

test("Pluggy imports are valid but bank caches remain server-only", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const imported = doc(db, "users/user-a/transactions/pluggy-1");
  await assertSucceeds(setDoc(imported, {
    description: "Pix recebido", amount: 150, type: "income", account: "business", category: "Pix",
    transactionDate: "2026-08-20", source: "pluggy", provider: "pluggy",
    providerTransactionId: "7dd60cf1-446f-45a0-b94f-42d9df92d411", providerStatus: "POSTED",
    paymentMethod: "PIX", createdAt: Timestamp.now(),
  }));
  await assertFails(setDoc(doc(db, "users/user-a/transactions/pluggy-invalid"), {
    description: "Origem adulterada", amount: 150, type: "income", account: "business",
    source: "pluggy", provider: "mercado_pago", providerTransactionId: "transaction-1",
    providerStatus: "POSTED", createdAt: Timestamp.now(),
  }));

  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/user-a/pluggyAccounts/account-1"), { balance: 500 });
  });
  await assertFails(getDoc(doc(db, "users/user-a/pluggyAccounts/account-1")));
});
