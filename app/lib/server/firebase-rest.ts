type FirestoreValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
};

export type FirebaseIdentity = {
  uid: string;
  email: string;
  displayName: string;
  idToken: string;
};

export type BusinessCollection = "orders" | "customers" | "transactions" | "bills" | "notes";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";

function withTimeout(ms = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function safeFetch(input: string, init: RequestInit, ms?: number) {
  const timeout = withTimeout(ms);
  try {
    return await fetch(input, { ...init, signal: timeout.signal });
  } finally {
    timeout.done();
  }
}

export async function authenticateFirebaseRequest(request: Request): Promise<FirebaseIdentity> {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!idToken) throw new Response("Sessão ausente.", { status: 401 });
  if (!firebaseApiKey || !projectId) throw new Response("Firebase não configurado no servidor.", { status: 503 });

  const response = await safeFetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Response("Sua sessão expirou. Entre novamente.", { status: 401 });
  const data = await response.json() as { users?: Array<{ localId?: string; email?: string; displayName?: string }> };
  const user = data.users?.[0];
  if (!user?.localId) throw new Response("Não foi possível validar a conta.", { status: 401 });
  return { uid: user.localId, email: user.email ?? "", displayName: user.displayName ?? "", idToken };
}

function decodeValue(value?: FirestoreValue): unknown {
  if (!value || value.nullValue === null) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decodeValue);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [key, decodeValue(nested)]));
  return null;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeValue(nested)])) } };
  return { stringValue: String(value) };
}

function decodeDocument(document: FirestoreDocument) {
  const id = document.name.split("/").pop() ?? "";
  return {
    ...Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)])),
    id,
    _createTime: document.createTime,
    _updateTime: document.updateTime,
  } as Record<string, unknown> & { id: string };
}

function collectionUrl(uid: string, collection: BusinessCollection) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}/${collection}`;
}

export async function listUserCollection(identity: FirebaseIdentity, collection: BusinessCollection, pageSize = 300) {
  const response = await safeFetch(`${collectionUrl(identity.uid, collection)}?pageSize=${Math.min(500, Math.max(1, pageSize))}`, {
    headers: { authorization: `Bearer ${identity.idToken}` },
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Falha ao consultar ${collection}.`);
  const data = await response.json() as { documents?: FirestoreDocument[] };
  return (data.documents ?? []).map(decodeDocument);
}

export async function getUserDocument(identity: FirebaseIdentity, collection: BusinessCollection, id: string) {
  const response = await safeFetch(`${collectionUrl(identity.uid, collection)}/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${identity.idToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Registro ${id} não encontrado.`);
  return decodeDocument(await response.json() as FirestoreDocument);
}

export async function patchUserDocument(identity: FirebaseIdentity, collection: BusinessCollection, id: string, values: Record<string, unknown>) {
  const mask = Object.keys(values).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  const response = await safeFetch(`${collectionUrl(identity.uid, collection)}/${encodeURIComponent(id)}?${mask}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${identity.idToken}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, encodeValue(value)])) }),
  });
  if (!response.ok) throw new Error(`Não foi possível atualizar ${collection}/${id}.`);
  return decodeDocument(await response.json() as FirestoreDocument);
}

export async function createUserDocument(identity: FirebaseIdentity, collection: BusinessCollection, values: Record<string, unknown>) {
  const response = await safeFetch(collectionUrl(identity.uid, collection), {
    method: "POST",
    headers: { authorization: `Bearer ${identity.idToken}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, encodeValue(value)])) }),
  });
  if (!response.ok) throw new Error(`Não foi possível criar registro em ${collection}.`);
  return decodeDocument(await response.json() as FirestoreDocument);
}

export async function deleteUserDocument(identity: FirebaseIdentity, collection: BusinessCollection, id: string) {
  const response = await safeFetch(`${collectionUrl(identity.uid, collection)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${identity.idToken}` },
  });
  if (!response.ok && response.status !== 404) throw new Error(`Não foi possível excluir ${collection}/${id}.`);
  return { deleted: true, id };
}
