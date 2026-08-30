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

test("unauthenticated users cannot read or write", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users/user-a/orders/order-1")));
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-1"), validOrder()));
});

test("a user can create, read, update and delete only their own valid order", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  const reference = doc(db, "users/user-a/orders/order-1");
  await assertSucceeds(setDoc(reference, validOrder()));
  assert.equal((await assertSucceeds(getDoc(reference))).data()?.status, "Aprovado");
  await assertSucceeds(updateDoc(reference, { status: "Produção" }));
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

test("users cannot list the root users collection or query all users through collectionGroup", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDocs(collection(db, "users")));
  await assertFails(getDocs(collectionGroup(db, "orders")));
});

test("unknown fields are rejected", async () => {
  const db = environment.authenticatedContext("user-a").firestore();
  await assertFails(setDoc(doc(db, "users/user-a/orders/order-1"), { ...validOrder(), admin: true }));
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
