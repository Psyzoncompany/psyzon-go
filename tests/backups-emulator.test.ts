import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { backupStatus, captureSnapshot, createBackup, prepareRestore, readBackup, restoreBackup } from "../app/lib/server/backups";
import { snapshotHash } from "../app/lib/server/backup-format";

// Never point these destructive recovery tests at a real database.
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") throw new Error("BACKUP_TEST_REQUIRES_LOCAL_EMULATOR");
const app = initializeApp({ projectId: "psyzon-go-rules-test" }, "backups-emulator");
const db = getFirestore(app);
after(async () => { await db.terminate(); await deleteApp(app); });

test("cloud backups preserve nested data, owner isolation and a complete verified recovery", async () => {
  const uid = "backup-round-trip";
  const root = db.doc(`users/${uid}`);
  await Promise.all([
    root.collection("orders").doc("a").set({ paid: 100, total: 600, customerId: "c" }),
    root.collection("customers").doc("c").set({ name: "Cliente" }),
    root.collection("notes").doc("costureiras").set({ content: "ledger and credits", purchasedMaterialIds: ["m"] }),
    root.collection("privateVault").doc("main").set({ encrypted: "unchanged-ciphertext" }),
    root.collection("notes").doc("missing-parent").collection("versions").doc("v").set({ content: "orphan child" }),
  ]);
  const before = await captureSnapshot(db, uid);
  assert.equal(before.documents.length, 5);
  const info = await createBackup(uid, "manual", db);
  assert.ok(info.verifiedAt && info.documents === 5);
  assert.equal(snapshotHash((await readBackup(db, uid, info.id)).snapshot), snapshotHash(before));
  await assert.rejects(readBackup(db, "another-owner", info.id), /NOT_FOUND/);
  await root.collection("orders").doc("a").update({ paid: 200 });
  await root.collection("notes").doc("costureiras").delete();
  await root.collection("bills").doc("new").set({ amount: 40 });
  const preview = await prepareRestore(uid, info.id, db);
  assert.deepEqual([preview.added, preview.changed, preview.removed], [1, 1, 1]);
  const result = await restoreBackup(uid, preview.token, db);
  assert.equal(result.restored, true);
  assert.equal(snapshotHash(await captureSnapshot(db, uid)), snapshotHash(before));
  const checkpoint = await readBackup(db, uid, result.checkpoint);
  assert.ok(checkpoint.snapshot.documents.some(doc => doc.path === "bills/new"));
  await assert.rejects(restoreBackup(uid, preview.token, db), /PREVIEW_EXPIRED/);
  assert.equal((await db.doc(`backupLocks/${uid}`).get()).get("status"), "ready");
});

test("stale recovery previews refuse to overwrite newer edits", async () => {
  const uid = "backup-conflict", ref = db.doc(`users/${uid}/orders/a`);
  await ref.set({ paid: 30 });
  const info = await createBackup(uid, "manual", db);
  const preview = await prepareRestore(uid, info.id, db);
  await ref.update({ paid: 50 });
  await assert.rejects(restoreBackup(uid, preview.token, db), /DATA_CHANGED/);
  assert.equal((await ref.get()).get("paid"), 50);
  assert.match((await backupStatus(uid, db)).lastError ?? "", /dados mudaram/);
});

test("a weekly run is idempotent and corrupt stored chunks cannot be recovered", async () => {
  const uid = "backup-weekly";
  await db.doc(`users/${uid}/orders/a`).set({ quantity: 4 });
  const first = await createBackup(uid, "weekly", db), again = await createBackup(uid, "weekly", db);
  assert.equal(first.id, again.id);
  assert.equal((await backupStatus(uid, db)).backups.length, 1);
  await db.doc(`accountBackups/${uid}/snapshots/${first.id}/chunks/0`).update({ data: Buffer.from("corrupted") });
  await assert.rejects(readBackup(db, uid, first.id), /CHECKSUM/);
  assert.equal((await db.doc(`users/${uid}/orders/a`).get()).get("quantity"), 4);
});

test("recovering business data keeps current access settings, usage limits and payment replay protection", async () => {
  const uid = "backup-operational", root = db.doc(`users/${uid}`);
  await Promise.all([
    root.collection("orders").doc("a").set({ paid: 30 }),
    root.collection("aiUsage").doc("month").set({ requests: 1 }),
    root.collection("aiSettings").doc("settings").set({ permissionMode: "financial_confirm" }),
  ]);
  const copy = await createBackup(uid, "manual", db);
  await Promise.all([
    root.collection("orders").doc("a").update({ paid: 60 }),
    root.collection("aiUsage").doc("month").update({ requests: 10 }),
    root.collection("aiSettings").doc("settings").update({ permissionMode: "read_only" }),
    root.collection("financeIntentReceipts").doc("processed-payment").set({ applied: true }),
  ]);
  const preview = await prepareRestore(uid, copy.id, db);
  await root.collection("aiUsage").doc("month").update({ requests: 11 });
  await restoreBackup(uid, preview.token, db);
  assert.equal((await root.collection("orders").doc("a").get()).get("paid"), 30);
  assert.equal((await root.collection("aiUsage").doc("month").get()).get("requests"), 11);
  assert.equal((await root.collection("aiSettings").doc("settings").get()).get("permissionMode"), "read_only");
  assert.equal((await root.collection("financeIntentReceipts").doc("processed-payment").get()).exists, true);
});

test("large photos are split into verified archive chunks without truncation", async () => {
  const uid = "backup-photos", photo = randomBytes(340_000).toString("base64");
  await Promise.all([db.doc(`users/${uid}/orders/a`).set({ photo }), db.doc(`users/${uid}/notes/b`).set({ photo: randomBytes(340_000).toString("base64") })]);
  const info = await createBackup(uid, "manual", db);
  assert.ok((await db.doc(`accountBackups/${uid}/snapshots/${info.id}`).get()).get("chunks") > 1);
  const restored = await readBackup(db, uid, info.id);
  assert.equal(restored.snapshot.documents.length, 2);
});

test("a failed multi-batch recovery rolls back the completed batches and preserves its checkpoint", async () => {
  const uid = "backup-rollback", root = db.collection(`users/${uid}/orders`);
  const seed = db.batch();
  for (let i = 0; i < 105; i++) seed.set(root.doc(String(i)), { amount: 10 });
  await seed.commit();
  const info = await createBackup(uid, "manual", db);
  const change = db.batch();
  for (let i = 0; i < 105; i++) change.update(root.doc(String(i)), { amount: 20 });
  await change.commit();
  const before = await captureSnapshot(db, uid), preview = await prepareRestore(uid, info.id, db);
  const original = db.runTransaction.bind(db);
  let writes = 0, injected = false;
  db.runTransaction = ((fn: Parameters<typeof db.runTransaction>[0], options: Parameters<typeof db.runTransaction>[1]) => original(async tx => {
    const set = tx.set.bind(tx);
    tx.set = ((ref, ...args) => {
      if (ref.path.startsWith(`users/${uid}/`) && ++writes > 100 && !injected) { injected = true; throw new Error("INJECTED_TEST_FAILURE"); }
      return set(ref, ...args);
    }) as typeof tx.set;
    return fn(tx);
  }, options)) as typeof db.runTransaction;
  try { await assert.rejects(restoreBackup(uid, preview.token, db), /INJECTED_TEST_FAILURE/); }
  finally { db.runTransaction = original; }
  assert.equal(injected, true);
  assert.equal(snapshotHash(await captureSnapshot(db, uid)), snapshotHash(before));
  assert.ok((await backupStatus(uid, db)).backups.some(info => info.kind === "before-restore"));
});
