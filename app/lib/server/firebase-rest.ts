import { getAdminFirestore, verifyFirebaseIdToken, type FirebaseIdentity } from "./firebase-admin";

export type { FirebaseIdentity } from "./firebase-admin";

export type BusinessCollection = "orders" | "customers" | "transactions" | "bills" | "notes";
export type UserCollection = BusinessCollection | "aiSettings" | "aiConversations" | "aiMessages" | "aiConfirmations" | "aiAuditLogs" | "aiUsage" | "aiRateLimits" | "mercadoPagoPayments" | "mercadoPagoReconciliation" | "integrationSyncState" | "pluggyItems" | "pluggyAccounts" | "pluggyTransactions";

export async function authenticateFirebaseRequest(request: Request): Promise<FirebaseIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  if (!match || match[1].length > 8_192) throw new Response("Sessão ausente ou inválida.", { status: 401 });
  try {
    return await verifyFirebaseIdToken(match[1]);
  } catch (error) {
    if (error instanceof Error && error.name === "FirebaseAdminConfigurationError") {
      throw new Response("Firebase Admin não configurado.", { status: 500 });
    }
    throw new Response("Sessão expirada ou inválida.", { status: 401 });
  }
}

function collectionReference(uid: string, collection: UserCollection) {
  return getAdminFirestore().collection("users").doc(uid).collection(collection);
}

function decodeDocument(snapshot: FirebaseFirestore.DocumentSnapshot) {
  return {
    ...(snapshot.data() ?? {}),
    id: snapshot.id,
    _createTime: snapshot.createTime?.toDate().toISOString(),
    _updateTime: snapshot.updateTime?.toDate().toISOString(),
  } as Record<string, unknown> & { id: string };
}

export async function listUserCollection(identity: FirebaseIdentity, collection: UserCollection, pageSize = 300) {
  const snapshot = await collectionReference(identity.uid, collection).limit(Math.min(500, Math.max(1, pageSize))).get();
  return snapshot.docs.map(decodeDocument);
}

export async function getUserDocument(identity: FirebaseIdentity, collection: UserCollection, id: string) {
  const snapshot = await collectionReference(identity.uid, collection).doc(id).get();
  return snapshot.exists ? decodeDocument(snapshot) : null;
}

export async function patchUserDocument(identity: FirebaseIdentity, collection: UserCollection, id: string, values: Record<string, unknown>) {
  const reference = collectionReference(identity.uid, collection).doc(id);
  await reference.update(values);
  return decodeDocument(await reference.get());
}

export async function setUserDocument(identity: FirebaseIdentity, collection: UserCollection, id: string, values: Record<string, unknown>) {
  const reference = collectionReference(identity.uid, collection).doc(id);
  await reference.set(values);
  return decodeDocument(await reference.get());
}

export async function createUserDocument(identity: FirebaseIdentity, collection: UserCollection, values: Record<string, unknown>) {
  const reference = await collectionReference(identity.uid, collection).add(values);
  return decodeDocument(await reference.get());
}

export async function deleteUserDocument(identity: FirebaseIdentity, collection: UserCollection, id: string) {
  await collectionReference(identity.uid, collection).doc(id).delete();
  return { deleted: true, id };
}
