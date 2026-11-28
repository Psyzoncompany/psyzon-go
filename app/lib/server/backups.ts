import { randomUUID } from "node:crypto";
import { Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebase-admin";
import { compareSnapshots, decodeValue, documentHash, encodeValue, MAX_BACKUP_DOCUMENTS, packSnapshot, recoveryData, snapshotHash, unpackSnapshot, versionOf, type BackupDocument, type BackupSnapshot } from "./backup-format";
import { nextWeeklyBackup, weeklyBackupId, type BackupInfo, type BackupKind, type BackupStatus, type RestorePreview } from "../../backup-types";

const CHUNK_BYTES = 480 * 1024;
const archives = (db: Firestore, uid: string) => db.collection("accountBackups").doc(uid).collection("snapshots");
const account = (db: Firestore, uid: string) => db.collection("accountBackups").doc(uid);
const lockRef = (db: Firestore, uid: string) => db.collection("backupLocks").doc(uid);
const userRef = (db: Firestore, uid: string, path: string) => db.doc(`users/${uid}${path ? "/" + path : ""}`);
const assertId = (id: string) => { if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error("BACKUP_INVALID_ID"); return id; };

export async function captureSnapshot(db: Firestore, uid: string): Promise<BackupSnapshot> {
  return db.runTransaction(async transaction => {
    const documents: BackupDocument[] = [];
    const pending: DocumentReference[] = [db.collection("users").doc(uid)];
    const prefix = `users/${uid}/`;
    let scanned = 0;
    while (pending.length) {
      const refs = pending.splice(0, 16);
      scanned += refs.length;
      if (scanned > MAX_BACKUP_DOCUMENTS) throw new Error("BACKUP_TOO_MANY_DOCUMENTS");
      const snapshots = await transaction.getAll(...refs);
      for (const snapshot of snapshots) if (snapshot.exists) documents.push({
        path: snapshot.ref.path === `users/${uid}` ? "" : snapshot.ref.path.slice(prefix.length),
        data: encodeValue(snapshot.data()), version: versionOf(snapshot.updateTime),
      });
      // listDocuments also finds missing parent documents with subcollections.
      const children = await Promise.all(refs.map(async ref => {
        const collections = await ref.listCollections();
        return (await Promise.all(collections.map(collection => collection.listDocuments()))).flat();
      }));
      pending.push(...children.flat());
    }
    documents.sort((a, b) => a.path.localeCompare(b.path));
    return { format: "psyzon-backup", version: 1, uid, createdAt: new Date().toISOString(), documents };
  }, { readOnly: true });
}

async function lease(db: Firestore, uid: string, operation: "backup" | "restore", previewToken?: string) {
  const token = randomUUID();
  await db.runTransaction(async tx => {
    const ref = lockRef(db, uid);
    const lock = await tx.get(ref);
    if (lock.get("status") === "working" && lock.get("expiresAt")?.toMillis() > Date.now()) throw new Error("BACKUP_BUSY");
    if (previewToken) {
      const preview = await tx.get(account(db, uid).collection("previews").doc(assertId(previewToken)));
      if (!preview.exists || preview.get("expiresAt")?.toMillis() <= Date.now()) throw new Error("BACKUP_PREVIEW_EXPIRED");
      tx.delete(preview.ref);
    }
    tx.set(ref, { operation, status: "working", token, expiresAt: Timestamp.fromMillis(Date.now() + 300_000) }, { merge: true });
  });
  return token;
}

async function finishLease(db: Firestore, uid: string, token: string, error = false, restored = false) {
  await db.runTransaction(async tx => {
    const ref = lockRef(db, uid), lock = await tx.get(ref);
    if (lock.get("token") !== token) return;
    tx.set(ref, { status: error ? "error" : "ready", expiresAt: Timestamp.now(), ...(restored ? { restoreRevision: randomUUID() } : {}) }, { merge: true });
  });
}

export async function readBackup(db: Firestore, uid: string, id: string) {
  const ref = archives(db, uid).doc(assertId(id));
  const manifest = await ref.get();
  if (manifest.get("status") !== "ready" || manifest.get("uid") !== uid) throw new Error("BACKUP_NOT_FOUND");
  const count = manifest.get("chunks") as number;
  if (!Number.isInteger(count) || count < 1 || count > 256) throw new Error("BACKUP_INVALID_FORMAT");
  const chunks = await db.getAll(...Array.from({ length: count }, (_, i) => ref.collection("chunks").doc(String(i))));
  const parts = chunks.map(chunk => {
    const data = chunk.get("data");
    if (!Buffer.isBuffer(data)) throw new Error("BACKUP_CHECKSUM_FAILED");
    return data;
  });
  const bytes = Buffer.concat(parts);
  const snapshot = unpackSnapshot(bytes, String(manifest.get("hash")), uid);
  if (snapshotHash(snapshot) !== manifest.get("dataHash")) throw new Error("BACKUP_CHECKSUM_FAILED");
  return { snapshot, bytes, info: manifest.get("info") as BackupInfo };
}

async function storeSnapshot(db: Firestore, snapshot: BackupSnapshot, kind: BackupKind, id: string) {
  const packed = packSnapshot(snapshot);
  const ref = archives(db, snapshot.uid).doc(id);
  const countMap = new Map<string, number>();
  snapshot.documents.forEach(document => { const key = document.path.split("/")[0] || "perfil"; countMap.set(key, (countMap.get(key) ?? 0) + 1); });
  const info: BackupInfo = { id, kind, createdAt: snapshot.createdAt, verifiedAt: "", documents: snapshot.documents.length, bytes: packed.bytes.length, counts: Object.fromEntries(countMap) };
  const chunks = Math.max(1, Math.ceil(packed.bytes.length / CHUNK_BYTES));
  await ref.set({ status: "writing", uid: snapshot.uid, chunks, hash: packed.hash, dataHash: packed.dataHash, info });
  for (let i = 0; i < chunks; i += 12) {
    const batch = db.batch();
    for (let n = i; n < Math.min(chunks, i + 12); n++) batch.set(ref.collection("chunks").doc(String(n)), { data: packed.bytes.subarray(n * CHUNK_BYTES, (n + 1) * CHUNK_BYTES) });
    await batch.commit();
  }
  // Check the actual persisted bytes before publishing a usable copy.
  const saved = await db.getAll(...Array.from({ length: chunks }, (_, i) => ref.collection("chunks").doc(String(i))));
  const verified = unpackSnapshot(Buffer.concat(saved.map(item => item.get("data") as Buffer)), packed.hash, snapshot.uid);
  if (snapshotHash(verified) !== packed.dataHash) throw new Error("BACKUP_CHECKSUM_FAILED");
  info.verifiedAt = new Date().toISOString();
  await ref.update({ status: "ready", info });
  await account(db, snapshot.uid).set({ lastSuccessAt: info.verifiedAt, lastError: "" }, { merge: true });
  return info;
}

async function retainBackups(db: Firestore, uid: string) {
  const saved = await archives(db, uid).get();
  const counts = { weekly: 0, manual: 0, "before-restore": 0 };
  const limits = { weekly: 8, manual: 3, "before-restore": 3 };
  for (const doc of saved.docs.sort((a, b) => String(b.get("info.createdAt") ?? "").localeCompare(String(a.get("info.createdAt") ?? "")))) {
    if (doc.get("status") !== "ready") continue;
    const kind = doc.get("info.kind") as BackupKind;
    if (!(kind in counts)) continue;
    if (++counts[kind] > limits[kind]) await db.recursiveDelete(doc.ref);
  }
}

export async function createBackup(uid: string, kind: "weekly" | "manual" = "manual", db = getAdminFirestore()) {
  const id = kind === "weekly" ? weeklyBackupId() : "manual-" + randomUUID();
  if (kind === "weekly") { const saved = await archives(db, uid).doc(id).get(); if (saved.get("status") === "ready") return saved.get("info") as BackupInfo; }
  const token = await lease(db, uid, "backup");
  let failed = false;
  try {
    // Another worker could have completed the same week before we acquired the lease.
    if (kind === "weekly") { const saved = await archives(db, uid).doc(id).get(); if (saved.get("status") === "ready") return saved.get("info") as BackupInfo; }
    const snapshot = await captureSnapshot(db, uid);
    const info = await storeSnapshot(db, snapshot, kind, id);
    await retainBackups(db, uid);
    return info;
  } catch (error) {
    failed = true;
    await account(db, uid).set({ lastError: "Não foi possível concluir a última cópia.", lastAttemptAt: new Date().toISOString() }, { merge: true });
    throw error;
  } finally { await finishLease(db, uid, token, failed); }
}

export async function backupStatus(uid: string, db = getAdminFirestore()): Promise<BackupStatus> {
  const [saved, state, lock] = await Promise.all([archives(db, uid).get(), account(db, uid).get(), lockRef(db, uid).get()]);
  return {
    enabled: Boolean(process.env.CRON_SECRET), nextRun: nextWeeklyBackup(),
    backups: saved.docs.filter(doc => doc.get("status") === "ready").map(doc => doc.get("info") as BackupInfo).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    lastError: state.get("lastRestoreError") || state.get("lastError") || undefined,
    working: lock.get("status") === "working" && lock.get("expiresAt")?.toMillis() > Date.now(),
  };
}

export async function prepareRestore(uid: string, id: string, db = getAdminFirestore()): Promise<RestorePreview> {
  const [backup, current] = await Promise.all([readBackup(db, uid, id), captureSnapshot(db, uid)]);
  const token = randomUUID(), expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await account(db, uid).collection("previews").doc(token).set({ backupId: id, currentHash: snapshotHash(recoveryData(current)), expiresAt: Timestamp.fromDate(new Date(expiresAt)) });
  return { token, backup: backup.info, expiresAt, ...compareSnapshots(recoveryData(current), recoveryData(backup.snapshot)) };
}

function restoreChunks(paths: string[], target: Map<string, BackupDocument>, current: Map<string, BackupDocument>) {
  const chunks: string[][] = [];
  let size = 0;
  for (const path of paths) {
    const bytes = Buffer.byteLength(JSON.stringify(target.get(path)?.data ?? null)) + Buffer.byteLength(JSON.stringify(current.get(path)?.data ?? null)) + 1024;
    if (!chunks.length || chunks.at(-1)!.length >= 100 || size + bytes > 5 * 1024 * 1024) { chunks.push([]); size = 0; }
    chunks.at(-1)!.push(path); size += bytes;
  }
  return chunks;
}

async function writeChunk(db: Firestore, uid: string, paths: string[], target: Map<string, BackupDocument>, expected: Map<string, BackupDocument>, rollback = false) {
  await db.runTransaction(async (tx: Transaction) => {
    const refs = paths.map(path => userRef(db, uid, path));
    const snapshots = await tx.getAll(...refs);
    snapshots.forEach((snapshot, i) => {
      const before = expected.get(paths[i]);
      if (!rollback && versionOf(snapshot.updateTime) !== (before?.version ?? "")) throw new Error("BACKUP_DATA_CHANGED");
      if (rollback && (snapshot.exists ? JSON.stringify(encodeValue(snapshot.data())) : "") !== (before ? JSON.stringify(before.data) : "")) throw new Error("BACKUP_DATA_CHANGED");
    });
    paths.forEach((path, i) => {
      const document = target.get(path);
      if (document) tx.set(refs[i], decodeValue(document.data, db) as Record<string, unknown>);
      else tx.delete(refs[i]);
    });
  });
}

export async function restoreBackup(uid: string, previewToken: string, db = getAdminFirestore()) {
  const preview = await account(db, uid).collection("previews").doc(assertId(previewToken)).get();
  if (!preview.exists || preview.get("expiresAt")?.toMillis() <= Date.now()) throw new Error("BACKUP_PREVIEW_EXPIRED");
  const backup = await readBackup(db, uid, String(preview.get("backupId")));
  const token = await lease(db, uid, "restore", previewToken);
  let changed = false, failed = false;
  const applied: string[][] = [];
  let previous: BackupSnapshot | undefined;
  const restoredData = recoveryData(backup.snapshot);
  const target = new Map(restoredData.documents.map(document => [document.path, document]));
  try {
    previous = await captureSnapshot(db, uid);
    if (snapshotHash(recoveryData(previous)) !== preview.get("currentHash")) throw new Error("BACKUP_DATA_CHANGED");
    const checkpoint = await storeSnapshot(db, previous, "before-restore", "recovery-" + randomUUID());
    const current = new Map(recoveryData(previous).documents.map(document => [document.path, document]));
    const paths = [...new Set([...current.keys(), ...target.keys()])].filter(path => !current.has(path) || !target.has(path) || documentHash(current.get(path)!) !== documentHash(target.get(path)!));
    for (const chunk of restoreChunks(paths, target, current)) {
      await writeChunk(db, uid, chunk, target, current);
      applied.push(chunk); changed = true;
    }
    const verified = await captureSnapshot(db, uid);
    if (snapshotHash(recoveryData(verified)) !== snapshotHash(restoredData)) throw new Error("BACKUP_RESTORE_VERIFICATION_FAILED");
    await account(db, uid).set({ lastRestoreAt: new Date().toISOString(), lastRestoreBackup: backup.info.id, lastRestoreError: "" }, { merge: true });
    await retainBackups(db, uid);
    return { restored: true, documents: verified.documents.length, checkpoint: checkpoint.id };
  } catch (error) {
    failed = true;
    await account(db, uid).set({ lastRestoreError: error instanceof Error && error.message === "BACKUP_DATA_CHANGED"
      ? "A recuperação foi cancelada porque os dados mudaram após a conferência. Abra uma nova prévia."
      : "A recuperação não foi concluída. A cópia dos dados anteriores foi preservada." }, { merge: true });
    if (changed && previous) {
      const before = new Map(recoveryData(previous).documents.map(document => [document.path, document]));
      try {
        for (const chunk of applied.reverse()) await writeChunk(db, uid, chunk, before, target, true);
        if (snapshotHash(recoveryData(await captureSnapshot(db, uid))) !== snapshotHash(recoveryData(previous))) throw new Error("BACKUP_ROLLBACK_FAILED");
      } catch {
        await account(db, uid).set({ lastRestoreError: "A recuperação foi interrompida. A cópia anterior foi preservada; confira os dados antes de continuar." }, { merge: true });
        throw new Error("BACKUP_ROLLBACK_FAILED");
      }
    }
    throw error;
  } finally { await finishLease(db, uid, token, failed, changed); }
}

export async function runWeeklyBackups(db = getAdminFirestore()) {
  const users = await db.collection("users").listDocuments();
  const stats = { completed: 0, failed: 0, busy: 0 };
  for (const user of users) {
    try { await createBackup(user.id, "weekly", db); stats.completed++; }
    catch (error) { if (error instanceof Error && error.message === "BACKUP_BUSY") stats.busy++; else stats.failed++; }
  }
  return stats;
}
