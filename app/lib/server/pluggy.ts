import { FieldValue } from "firebase-admin/firestore";
import { PluggyClient, type Account, type Item, type Transaction } from "pluggy-sdk";
import type { FirebaseIdentity } from "./firebase-admin";
import { getAdminFirestore } from "./firebase-admin";

const PLUGGY_PROVIDER = "pluggy";
const MAX_LOOKBACK_DAYS = 365;
const MAX_PUBLIC_TRANSACTIONS = 500;

export type PluggyWebhookPayload = {
  event?: string;
  eventId?: string;
  clientUserId?: string;
  itemId?: string;
  accountId?: string;
  transactionIds?: string[];
  error?: { code?: string; message?: string };
};

function requiredEnvironment(name: "PLUGGY_CLIENT_ID" | "PLUGGY_CLIENT_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("PLUGGY_NOT_CONFIGURED");
  return value;
}

export function isPluggyConfigured() {
  return Boolean(process.env.PLUGGY_CLIENT_ID?.trim() && process.env.PLUGGY_CLIENT_SECRET?.trim());
}

export function pluggyClient() {
  return new PluggyClient({
    clientId: requiredEnvironment("PLUGGY_CLIENT_ID"),
    clientSecret: requiredEnvironment("PLUGGY_CLIENT_SECRET"),
  });
}

// Payment initiation is intentionally gated. This creates the extension point
// without enabling money movement as part of the read-only banking rollout.
export function pluggyPaymentsClient() {
  if (process.env.PLUGGY_PAYMENTS_ENABLED !== "true") throw new Error("PLUGGY_PAYMENTS_DISABLED");
  return pluggyClient().payments;
}

function userCollection(uid: string, name: "pluggyItems" | "pluggyAccounts" | "pluggyTransactions" | "transactions" | "integrationSyncState") {
  return getAdminFirestore().collection("users").doc(uid).collection(name);
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function shortText(value: unknown, maximum: number, fallback = "") {
  return typeof value === "string" ? value.slice(0, maximum) : fallback;
}

function lookbackDate() {
  const configured = Number(process.env.PLUGGY_TRANSACTION_LOOKBACK_DAYS ?? MAX_LOOKBACK_DAYS);
  const days = Number.isInteger(configured) ? Math.min(MAX_LOOKBACK_DAYS, Math.max(30, configured)) : MAX_LOOKBACK_DAYS;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function itemNeedsReconnect(item: Item) {
  const execution = String(item.executionStatus ?? "");
  return item.status === "LOGIN_ERROR"
    || item.status === "WAITING_USER_INPUT"
    || item.status === "WAITING_USER_ACTION"
    || ["INVALID_CREDENTIALS", "INVALID_CREDENTIALS_MFA", "ACCOUNT_LOCKED", "ACCOUNT_CREDENTIALS_RESET", "ACCOUNT_NEEDS_ACTION", "USER_AUTHORIZATION_NOT_GRANTED", "USER_INPUT_TIMEOUT"].includes(execution);
}

function normalizeItem(item: Item, ownerUserId: string) {
  return {
    ownerUserId,
    itemId: item.id,
    clientUserId: item.clientUserId,
    connectorId: item.connector.id,
    connectorName: shortText(item.connector.name, 120, "Instituição financeira"),
    connectorImageUrl: shortText(item.connector.imageUrl, 500),
    connectorType: item.connector.type,
    connectorHealth: item.connector.health?.status ?? "ONLINE",
    supportsPaymentInitiation: item.connector.supportsPaymentInitiation === true,
    supportsScheduledPayments: item.connector.supportsScheduledPayments === true,
    supportsSmartTransfers: item.connector.supportsSmartTransfers === true,
    supportsAutomaticPix: item.connector.supportsAutomaticPix === true,
    status: item.status,
    executionStatus: item.executionStatus,
    needsReconnect: itemNeedsReconnect(item),
    errorCode: item.error?.code ?? null,
    errorMessage: shortText(item.error?.message, 240) || null,
    userActionInstructions: shortText(item.userAction?.instructions, 500) || null,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
    lastUpdatedAt: iso(item.lastUpdatedAt),
    nextAutoSyncAt: iso(item.nextAutoSyncAt),
    consentExpiresAt: iso(item.consentExpiresAt),
    cachedAt: Date.now(),
  };
}

function normalizeAccount(account: Account, ownerUserId: string) {
  return {
    ownerUserId,
    accountId: account.id,
    itemId: account.itemId,
    type: account.type,
    subtype: account.subtype,
    name: shortText(account.name, 160, "Conta bancária"),
    marketingName: shortText(account.marketingName, 160) || null,
    number: shortText(account.number, 80),
    balance: Number.isFinite(account.balance) ? account.balance : 0,
    currencyCode: account.currencyCode,
    availableBalance: account.bankData?.closingBalance ?? null,
    creditLimit: account.creditData?.creditLimit ?? null,
    availableCreditLimit: account.creditData?.availableCreditLimit ?? null,
    creditStatus: account.creditData?.status ?? null,
    cachedAt: Date.now(),
  };
}

export function classifyPluggyTransaction(transaction: Pick<Transaction, "type" | "description" | "operationType" | "paymentData">) {
  const method = `${transaction.paymentData?.paymentMethod ?? ""} ${transaction.paymentData?.referenceNumber ?? ""} ${transaction.paymentData?.reason ?? ""} ${transaction.operationType ?? ""} ${transaction.description ?? ""}`.toLocaleUpperCase("pt-BR");
  if (method.includes("PIX")) return "pix";
  if (/\b(TED|DOC|TRANSFER)/.test(method)) return "transfer";
  return transaction.type === "CREDIT" ? "income" : "expense";
}

function normalizeTransaction(transaction: Transaction, itemId: string, ownerUserId: string) {
  const kind = classifyPluggyTransaction(transaction);
  const counterpart = transaction.type === "CREDIT" ? transaction.paymentData?.payer : transaction.paymentData?.receiver;
  return {
    ownerUserId,
    transactionId: transaction.id,
    itemId,
    accountId: transaction.accountId,
    description: shortText(transaction.description, 240, "Movimentação bancária"),
    descriptionRaw: shortText(transaction.descriptionRaw, 500) || null,
    amount: Math.abs(Number.isFinite(transaction.amount) ? transaction.amount : 0),
    direction: transaction.type,
    kind,
    date: iso(transaction.date),
    currencyCode: transaction.currencyCode,
    category: shortText(transaction.category, 120) || null,
    status: transaction.status ?? "POSTED",
    paymentMethod: shortText(transaction.paymentData?.paymentMethod, 80) || (kind === "pix" ? "PIX" : null),
    referenceNumber: shortText(transaction.paymentData?.referenceNumber, 160) || null,
    receiverReferenceId: shortText(transaction.paymentData?.receiverReferenceId, 160) || null,
    counterpartName: shortText(counterpart?.name, 160) || null,
    providerId: shortText(transaction.providerId, 160) || null,
    createdAt: iso(transaction.createdAt),
    updatedAt: iso(transaction.updatedAt),
    cachedAt: Date.now(),
  };
}

async function verifyOwnedItem(uid: string, itemId: string) {
  const item = await pluggyClient().fetchItem(itemId);
  if (item.clientUserId !== uid) throw new Error("PLUGGY_ITEM_FORBIDDEN");
  return item;
}

async function rememberItemOwner(itemId: string, uid: string) {
  await getAdminFirestore().collection("pluggyItemOwners").doc(itemId).set({ ownerUserId: uid, updatedAt: Date.now() }, { merge: true });
}

async function writeRows(collection: FirebaseFirestore.CollectionReference, rows: Array<{ id: string; value: Record<string, unknown> }>) {
  if (!rows.length) return;
  const writer = getAdminFirestore().bulkWriter();
  rows.forEach(({ id, value }) => writer.set(collection.doc(id), value, { merge: true }));
  await writer.close();
}

async function deleteRows(references: FirebaseFirestore.DocumentReference[]) {
  if (!references.length) return;
  const writer = getAdminFirestore().bulkWriter();
  references.forEach((reference) => writer.delete(reference));
  await writer.close();
}

async function replaceAccountTransactions(uid: string, itemId: string, accountId: string, transactions: Transaction[]) {
  const collection = userCollection(uid, "pluggyTransactions");
  const received = new Set(transactions.map((transaction) => transaction.id));
  const cached = await collection.where("accountId", "==", accountId).get();
  await Promise.all([
    writeRows(collection, transactions.map((transaction) => ({ id: transaction.id, value: normalizeTransaction(transaction, itemId, uid) }))),
    deleteRows(cached.docs.filter((snapshot) => !received.has(snapshot.id)).map((snapshot) => snapshot.ref)),
  ]);
}

async function deleteCachedAccounts(uid: string, accountSnapshots: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const transactionReferences: FirebaseFirestore.DocumentReference[] = [];
  for (const account of accountSnapshots) {
    const transactions = await userCollection(uid, "pluggyTransactions").where("accountId", "==", account.id).get();
    transactionReferences.push(...transactions.docs.map((snapshot) => snapshot.ref));
  }
  await Promise.all([
    deleteRows(accountSnapshots.map((snapshot) => snapshot.ref)),
    deleteRows(transactionReferences),
  ]);
}

export async function syncPluggyItem(uid: string, itemId: string) {
  const client = pluggyClient();
  const item = await client.fetchItem(itemId);
  if (item.clientUserId !== uid) throw new Error("PLUGGY_ITEM_FORBIDDEN");

  await Promise.all([
    userCollection(uid, "pluggyItems").doc(item.id).set(normalizeItem(item, uid), { merge: true }),
    rememberItemOwner(item.id, uid),
  ]);

  const canReadProducts = item.status === "UPDATED" || ["SUCCESS", "PARTIAL_SUCCESS"].includes(String(item.executionStatus));
  if (!canReadProducts) {
    await setPluggySyncState(uid, itemNeedsReconnect(item) ? "reconnect_required" : "syncing", null, 0);
    return { item: normalizeItem(item, uid), accounts: 0, transactions: 0 };
  }

  const accounts = (await client.fetchAccounts(item.id)).results;
  const storedAccounts = await userCollection(uid, "pluggyAccounts").where("itemId", "==", item.id).get();
  const accountIds = new Set(accounts.map((account) => account.id));
  const removedAccounts = storedAccounts.docs.filter((snapshot) => !accountIds.has(snapshot.id));
  await Promise.all([
    writeRows(userCollection(uid, "pluggyAccounts"), accounts.map((account) => ({ id: account.id, value: normalizeAccount(account, uid) }))),
    deleteCachedAccounts(uid, removedAccounts),
  ]);

  let transactionCount = 0;
  for (const account of accounts) {
    const transactions = await client.fetchAllTransactions(account.id, { dateFrom: lookbackDate() });
    transactionCount += transactions.length;
    await replaceAccountTransactions(uid, item.id, account.id, transactions);
  }

  await setPluggySyncState(uid, "connected", null, transactionCount);
  return { item: normalizeItem(item, uid), accounts: accounts.length, transactions: transactionCount };
}

export async function syncAllPluggyItems(identity: FirebaseIdentity) {
  const snapshot = await userCollection(identity.uid, "pluggyItems").get();
  const results = [];
  const activeItems = snapshot.docs.filter((item) => item.data().status !== "DELETED");
  for (const item of activeItems) results.push(await syncPluggyItem(identity.uid, item.id));
  if (!activeItems.length) await setPluggySyncState(identity.uid, "disconnected", null, 0);
  return results;
}

async function setPluggySyncState(uid: string, status: string, lastError: string | null, recordsChecked: number) {
  await userCollection(uid, "integrationSyncState").doc(PLUGGY_PROVIDER).set({
    provider: PLUGGY_PROVIDER,
    status,
    lastError,
    recordsChecked,
    lastSyncedAt: status === "connected" ? Date.now() : null,
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function createPluggyConnectToken(identity: FirebaseIdentity, itemId?: string) {
  if (itemId) await verifyOwnedItem(identity.uid, itemId);
  const oauthRedirectUri = process.env.PLUGGY_OAUTH_REDIRECT_URI?.trim();
  return pluggyClient().createConnectToken(itemId, {
    clientUserId: identity.uid,
    avoidDuplicates: true,
    ...(oauthRedirectUri ? { oauthRedirectUri } : {}),
  });
}

export async function registerPluggyItem(identity: FirebaseIdentity, itemId: string) {
  await verifyOwnedItem(identity.uid, itemId);
  return syncPluggyItem(identity.uid, itemId);
}

function publicDocument(snapshot: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot): Record<string, unknown> & { id: string } {
  const publicData = { ...(snapshot.data() ?? {}) };
  ["ownerUserId", "clientUserId", "descriptionRaw", "providerId"].forEach((field) => delete publicData[field]);
  return { id: snapshot.id, ...publicData };
}

function systemDate(data: Record<string, unknown>) {
  if (typeof data.transactionDate === "string") return data.transactionDate;
  const createdAt = data.createdAt as { toDate?: () => Date } | undefined;
  return createdAt?.toDate?.().toISOString().slice(0, 10) ?? "";
}

function dayDistance(left: string, right: string) {
  const leftTime = new Date(`${left.slice(0, 10)}T12:00:00Z`).getTime();
  const rightTime = new Date(`${right.slice(0, 10)}T12:00:00Z`).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? Math.abs(leftTime - rightTime) / 86_400_000 : Number.POSITIVE_INFINITY;
}

export async function getPluggyDashboard(identity: FirebaseIdentity) {
  const [items, accounts, bankTransactions, systemTransactions, syncState] = await Promise.all([
    userCollection(identity.uid, "pluggyItems").get(),
    userCollection(identity.uid, "pluggyAccounts").get(),
    userCollection(identity.uid, "pluggyTransactions").limit(MAX_PUBLIC_TRANSACTIONS).get(),
    userCollection(identity.uid, "transactions").limit(500).get(),
    userCollection(identity.uid, "integrationSyncState").doc(PLUGGY_PROVIDER).get(),
  ]);
  const systems: Array<Record<string, unknown> & { id: string }> = systemTransactions.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  const usedSystemIds = new Set(bankTransactions.docs.map((snapshot) => snapshot.data().matchedSystemTransactionId).filter((value): value is string => typeof value === "string"));
  const transactions: Array<Record<string, unknown> & { id: string; suggestion: { id: string; description: string; transactionDate: string } | null }> = bankTransactions.docs.map((snapshot) => {
    const data = snapshot.data();
    let suggestion: { id: string; description: string; transactionDate: string } | null = null;
    if (!data.reconciliationStatus) {
      const expectedType = data.direction === "CREDIT" ? "income" : data.kind === "transfer" ? "transfer" : "expense";
      const candidates = systems.filter((system) =>
        !usedSystemIds.has(system.id)
        &&
        String(system.type) === expectedType
        && Math.round(Number(system.amount) * 100) === Math.round(Number(data.amount) * 100)
        && dayDistance(systemDate(system), String(data.date ?? "")) <= 3,
      );
      if (candidates.length === 1) suggestion = { id: candidates[0].id, description: shortText(candidates[0].description, 240), transactionDate: systemDate(candidates[0]) };
    }
    return { ...publicDocument(snapshot), suggestion } as Record<string, unknown> & { id: string; suggestion: { id: string; description: string; transactionDate: string } | null };
  }).sort((left, right) => String(right["date"] ?? "").localeCompare(String(left["date"] ?? "")));

  return {
    configured: isPluggyConfigured(),
    webhookConfigured: Boolean(process.env.PLUGGY_WEBHOOK_URL?.trim() && process.env.PLUGGY_WEBHOOK_SECRET?.trim()),
    paymentsPrepared: true,
    paymentsEnabled: process.env.PLUGGY_PAYMENTS_ENABLED === "true",
    sync: syncState.exists ? publicDocument(syncState) : { status: items.empty ? "disconnected" : "unknown", lastSyncedAt: null, lastError: null, recordsChecked: 0 },
    items: items.docs.map(publicDocument).sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))),
    accounts: accounts.docs.map(publicDocument),
    transactions,
    reconciliation: {
      pending: transactions.filter((transaction) => !transaction["reconciliationStatus"]).length,
      matched: transactions.filter((transaction) => ["matched", "imported"].includes(String(transaction["reconciliationStatus"]))).length,
    },
  };
}

export async function reconcilePluggyTransaction(identity: FirebaseIdentity, input: {
  action: "match" | "import" | "ignore" | "unlink";
  bankTransactionId: string;
  systemTransactionId?: string;
  account?: "business" | "personal";
  category?: string;
}) {
  const bankReference = userCollection(identity.uid, "pluggyTransactions").doc(input.bankTransactionId);
  const bankSnapshot = await bankReference.get();
  if (!bankSnapshot.exists) throw new Error("PLUGGY_TRANSACTION_NOT_FOUND");
  const bank = bankSnapshot.data()!;

  if (input.action === "unlink") {
    await bankReference.update({ reconciliationStatus: FieldValue.delete(), matchedSystemTransactionId: FieldValue.delete(), reconciledAt: FieldValue.delete() });
    return { status: "pending" };
  }
  if (input.action === "ignore") {
    await bankReference.update({ reconciliationStatus: "ignored", matchedSystemTransactionId: FieldValue.delete(), reconciledAt: Date.now() });
    return { status: "ignored" };
  }
  if (input.action === "match") {
    if (!input.systemTransactionId) throw new Error("PLUGGY_SYSTEM_TRANSACTION_REQUIRED");
    const systemReference = userCollection(identity.uid, "transactions").doc(input.systemTransactionId);
    if (!(await systemReference.get()).exists) throw new Error("PLUGGY_SYSTEM_TRANSACTION_NOT_FOUND");
    const existingMatch = await userCollection(identity.uid, "pluggyTransactions").where("matchedSystemTransactionId", "==", input.systemTransactionId).limit(1).get();
    if (existingMatch.docs.some((snapshot) => snapshot.id !== input.bankTransactionId)) throw new Error("PLUGGY_SYSTEM_TRANSACTION_ALREADY_MATCHED");
    await bankReference.update({ reconciliationStatus: "matched", matchedSystemTransactionId: input.systemTransactionId, reconciledAt: Date.now() });
    return { status: "matched", systemTransactionId: input.systemTransactionId };
  }

  const account = input.account === "personal" ? "personal" : "business";
  if (bank.status === "PENDING") throw new Error("PLUGGY_TRANSACTION_PENDING");
  if (!(Number(bank.amount) > 0) || !/^\d{4}-\d{2}-\d{2}/.test(String(bank.date ?? ""))) throw new Error("PLUGGY_TRANSACTION_INVALID");
  const systemReference = userCollection(identity.uid, "transactions").doc(`pluggy_${input.bankTransactionId}`);
  const existing = await systemReference.get();
  const type = bank.direction === "CREDIT" ? "income" : bank.kind === "transfer" ? "transfer" : "expense";
  if (!existing.exists) {
    await systemReference.set({
      description: shortText(bank.description, 240, "Movimentação bancária"),
      amount: Math.abs(Number(bank.amount)),
      type,
      account,
      category: shortText(input.category, 100) || (bank.kind === "pix" ? "Pix" : bank.category ?? "Outros"),
      transactionDate: String(bank.date ?? "").slice(0, 10),
      source: "pluggy",
      provider: "pluggy",
      providerTransactionId: input.bankTransactionId,
      paymentMethod: bank.paymentMethod ?? null,
      providerStatus: bank.status ?? "POSTED",
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await bankReference.update({ reconciliationStatus: "imported", matchedSystemTransactionId: systemReference.id, reconciledAt: Date.now() });
  return { status: "imported", systemTransactionId: systemReference.id, alreadyImported: existing.exists };
}

export async function ensurePluggyWebhook() {
  const url = process.env.PLUGGY_WEBHOOK_URL?.trim();
  const secret = process.env.PLUGGY_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return { configured: false };
  if (!/^https:\/\//i.test(url)) throw new Error("PLUGGY_WEBHOOK_URL_INVALID");
  const client = pluggyClient();
  const webhooks = (await client.fetchWebhooks()).results;
  const existing = webhooks.find((webhook) => webhook.url === url && webhook.event === "all");
  const headers = { Authorization: `Bearer ${secret}` };
  if (existing) {
    await client.updateWebhook(existing.id, { enabled: true, headers });
    return { configured: true, id: existing.id };
  }
  const created = await client.createWebhook("all", url, headers);
  return { configured: true, id: created.id };
}

let webhookSetupPromise: ReturnType<typeof ensurePluggyWebhook> | null = null;

export function ensurePluggyWebhookOnce() {
  if (!webhookSetupPromise) {
    webhookSetupPromise = ensurePluggyWebhook().catch((error) => {
      webhookSetupPromise = null;
      throw error;
    });
  }
  return webhookSetupPromise;
}

async function webhookOwner(payload: PluggyWebhookPayload) {
  if (payload.clientUserId) return payload.clientUserId;
  if (!payload.itemId) return "";
  const mapping = await getAdminFirestore().collection("pluggyItemOwners").doc(payload.itemId).get();
  return String(mapping.data()?.ownerUserId ?? "");
}

export async function processPluggyWebhook(payload: PluggyWebhookPayload) {
  const eventId = shortText(payload.eventId, 160);
  const event = shortText(payload.event, 100);
  if (!eventId || !event) throw new Error("PLUGGY_WEBHOOK_INVALID");
  const eventReference = getAdminFirestore().collection("pluggyWebhookEvents").doc(eventId);
  const accepted = await getAdminFirestore().runTransaction(async (transaction) => {
    if ((await transaction.get(eventReference)).exists) return false;
    transaction.create(eventReference, { provider: PLUGGY_PROVIDER, event, itemId: payload.itemId ?? null, status: "processing", receivedAt: Date.now() });
    return true;
  });
  if (!accepted) return;

  try {
    const uid = await webhookOwner(payload);
    if (!uid) throw new Error("PLUGGY_WEBHOOK_OWNER_NOT_FOUND");
    if (event === "item/deleted" && payload.itemId) {
      const accounts = await userCollection(uid, "pluggyAccounts").where("itemId", "==", payload.itemId).get();
      await deleteCachedAccounts(uid, accounts.docs);
      await userCollection(uid, "pluggyItems").doc(payload.itemId).set({ status: "DELETED", needsReconnect: true, updatedAt: new Date().toISOString(), cachedAt: Date.now() }, { merge: true });
      await setPluggySyncState(uid, "disconnected", null, 0);
    } else if (payload.itemId) {
      await syncPluggyItem(uid, payload.itemId);
    }
    await eventReference.update({ status: "processed", ownerUserId: uid, processedAt: Date.now() });
  } catch (error) {
    const code = error instanceof Error ? shortText(error.message, 160, "UNKNOWN") : "UNKNOWN";
    await eventReference.update({ status: "error", errorCode: code, processedAt: Date.now() });
    const uid = await webhookOwner(payload).catch(() => "");
    if (uid) await setPluggySyncState(uid, "error", code, 0);
    throw error;
  }
}
