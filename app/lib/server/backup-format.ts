import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { DocumentReference, GeoPoint, Timestamp, type Firestore } from "firebase-admin/firestore";

export const MAX_BACKUP_BYTES = 96 * 1024 * 1024;
export const MAX_BACKUP_DOCUMENTS = 20_000;
export type Encoded = null | boolean | string | number | { t: string; v: unknown };
export type BackupDocument = { path: string; data: Encoded; version?: string };
export type BackupSnapshot = { format: "psyzon-backup"; version: 1; uid: string; createdAt: string; documents: BackupDocument[] };

// Archive everything, but never rewind access settings, usage limits, audit
// records or idempotency/provider state when recovering business data.
const operationalCollections = new Set([
  "aiSettings", "aiConfirmations", "aiAuditLogs", "aiUsage", "aiRateLimits", "financeIntentReceipts",
  "integrationSyncState", "pluggyItems", "pluggyAccounts", "pluggyTransactions", "mercadoPagoPayments", "mercadoPagoReconciliation",
]);
export function recoveryData(snapshot: BackupSnapshot): BackupSnapshot {
  return { ...snapshot, documents: snapshot.documents.filter(document => document.path !== "" && !operationalCollections.has(document.path.split("/")[0])) };
}

export function encodeValue(value: unknown): Encoded {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : { t: "number", v: String(value) };
  if (value instanceof Timestamp) return { t: "timestamp", v: [value.seconds, value.nanoseconds] };
  if (value instanceof Date) return { t: "date", v: value.toISOString() };
  if (value instanceof GeoPoint) return { t: "geopoint", v: [value.latitude, value.longitude] };
  if (value instanceof DocumentReference) return { t: "reference", v: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { t: "bytes", v: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return { t: "array", v: value.map(encodeValue) };
  if (value && typeof value === "object") return { t: "map", v: Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, encodeValue(item)])) };
  throw new Error("BACKUP_UNSUPPORTED_VALUE");
}

export function decodeValue(value: Encoded, db: Firestore): unknown {
  if (!value || typeof value !== "object") return value;
  switch (value.t) {
    case "timestamp": { const [seconds, nanos] = value.v as number[]; return new Timestamp(seconds, nanos); }
    case "date": return new Date(String(value.v));
    case "geopoint": { const [lat, lng] = value.v as number[]; return new GeoPoint(lat, lng); }
    case "reference": return db.doc(String(value.v));
    case "bytes": return Buffer.from(String(value.v), "base64");
    case "number": return Number(value.v);
    case "array": return (value.v as Encoded[]).map(item => decodeValue(item, db));
    case "map": return Object.fromEntries(Object.entries(value.v as Record<string, Encoded>).map(([key, item]) => [key, decodeValue(item, db)]));
    default: throw new Error("BACKUP_INVALID_VALUE");
  }
}

export const versionOf = (value?: Timestamp) => value ? `${value.seconds}:${value.nanoseconds}` : "";
export const documentHash = (document: BackupDocument) => JSON.stringify([document.path, document.data]);
export function snapshotHash(snapshot: BackupSnapshot) {
  const hash = createHash("sha256");
  for (const document of [...snapshot.documents].sort((a, b) => a.path.localeCompare(b.path))) hash.update(documentHash(document) + "\n");
  return hash.digest("hex");
}

export function validateSnapshot(snapshot: BackupSnapshot, uid: string) {
  if (snapshot?.format !== "psyzon-backup" || snapshot.version !== 1 || snapshot.uid !== uid || !Array.isArray(snapshot.documents) || snapshot.documents.length > MAX_BACKUP_DOCUMENTS || !Number.isFinite(Date.parse(snapshot.createdAt))) throw new Error("BACKUP_INVALID_FORMAT");
  const paths = new Set<string>();
  for (const document of snapshot.documents) {
    if (typeof document.path !== "string" || paths.has(document.path) || (document.path !== "" && (document.path.split("/").length % 2 !== 0 || document.path.split("/").some(part => !part || part === "." || part === ".." || /^__.*__$/.test(part)))) || document.path.length > 1500) throw new Error("BACKUP_INVALID_PATH");
    if (!document.data || typeof document.data !== "object" || document.data.t !== "map") throw new Error("BACKUP_INVALID_DOCUMENT");
    paths.add(document.path);
  }
  return snapshot;
}

export function packSnapshot(snapshot: BackupSnapshot) {
  validateSnapshot(snapshot, snapshot.uid);
  const raw = Buffer.from(JSON.stringify(snapshot));
  if (raw.length > MAX_BACKUP_BYTES) throw new Error("BACKUP_TOO_LARGE");
  const bytes = gzipSync(raw, { level: 6 });
  return { bytes, hash: createHash("sha256").update(bytes).digest("hex"), dataHash: snapshotHash(snapshot) };
}

export function unpackSnapshot(bytes: Buffer, hash: string, uid: string) {
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("BACKUP_CHECKSUM_FAILED");
  const snapshot = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_BACKUP_BYTES }).toString("utf8")) as BackupSnapshot;
  return validateSnapshot(snapshot, uid);
}

export function compareSnapshots(current: BackupSnapshot, backup: BackupSnapshot) {
  const remaining = new Map(current.documents.map(doc => [doc.path, documentHash(doc)]));
  let added = 0, changed = 0, unchanged = 0;
  for (const doc of backup.documents) {
    if (!remaining.has(doc.path)) added++;
    else if (remaining.get(doc.path) === documentHash(doc)) unchanged++;
    else changed++;
    remaining.delete(doc.path);
  }
  return { added, changed, unchanged, removed: remaining.size };
}
