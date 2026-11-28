import assert from "node:assert/strict";
import test from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { GeoPoint, Timestamp, getFirestore } from "firebase-admin/firestore";
import { nextWeeklyBackup, weeklyBackupId } from "../app/backup-types";
import { compareSnapshots, decodeValue, encodeValue, packSnapshot, recoveryData, snapshotHash, unpackSnapshot, validateSnapshot, type BackupSnapshot } from "../app/lib/server/backup-format";
import { GET, POST } from "../app/api/backups/route";
import { GET as weekly } from "../app/api/backups/weekly/route";

const snapshot = (uid = "owner"): BackupSnapshot => ({ format: "psyzon-backup", version: 1, uid, createdAt: "2026-11-28T12:00:00.000Z", documents: [
  { path: "orders/a", data: encodeValue({ quantity: 13, paid: 80, total: 600, customerId: "c", createdAt: new Timestamp(1_790_000_000, 123_456_789) }) },
  { path: "customers/c", data: encodeValue({ name: "Cliente", phone: "5573000000000" }) },
  { path: "privateVault/main", data: encodeValue({ encrypted: "opaque-ciphertext", revision: "revision" }) },
] });

test("the weekly schedule uses Sunday 03:00 in Bahia, including year boundaries", () => {
  assert.equal(nextWeeklyBackup(new Date("2026-11-28T15:00:00Z")), "2026-11-29T06:00:00.000Z");
  assert.equal(nextWeeklyBackup(new Date("2026-11-29T06:00:00Z")), "2026-12-06T06:00:00.000Z");
  assert.equal(nextWeeklyBackup(new Date("2026-12-31T15:00:00Z")), "2027-01-03T06:00:00.000Z");
  assert.equal(weeklyBackupId(new Date("2026-11-29T02:59:00Z")), "weekly-2026-11-22");
  assert.equal(weeklyBackupId(new Date("2026-11-29T06:00:00Z")), "weekly-2026-11-29");
});

test("backup files verify their checksum, owner and references without changing money or vault ciphertext", () => {
  const original = snapshot(), packed = packSnapshot(original);
  const restored = unpackSnapshot(packed.bytes, packed.hash, "owner");
  assert.deepEqual(restored, original);
  assert.equal(snapshotHash(restored), packed.dataHash);
  assert.throws(() => unpackSnapshot(packed.bytes, packed.hash, "other"), /INVALID_FORMAT/);
  const corrupt = Buffer.from(packed.bytes); corrupt[12] ^= 255;
  assert.throws(() => unpackSnapshot(corrupt, packed.hash, "owner"), /CHECKSUM/);
});

test("Firestore special values, nested subcollections and user fields round trip without type collisions", async () => {
  const app = initializeApp({ projectId: "psyzon-backup-unit-test" }, "backup-unit");
  const db = getFirestore(app);
  try {
    const value = { time: new Timestamp(1234, 123456789), point: new GeoPoint(-12, -38), bytes: Buffer.from([0, 255, 43]), ref: db.doc("users/owner/orders/o"), nested: [{ t: "timestamp", v: "normal user text" }], special: [NaN, Infinity, -Infinity], dot: { "a.b": 12 } };
    const decoded = decodeValue(encodeValue(value), db) as typeof value;
    assert.deepEqual(decoded.time, value.time);
    assert.deepEqual(decoded.point, value.point);
    assert.deepEqual(decoded.bytes, value.bytes);
    assert.equal(decoded.ref.path, value.ref.path);
    assert.deepEqual(decoded.nested, value.nested);
    assert.deepEqual(decoded.special, value.special);
    assert.deepEqual(decoded.dot, value.dot);
    const source = snapshot(); source.documents.push({ path: "notes/a/history/b", data: encodeValue({ note: "versão" }) });
    assert.deepEqual(unpackSnapshot(packSnapshot(source).bytes, packSnapshot(source).hash, "owner"), source);
  } finally { await deleteApp(app); }
});

test("recovery previews report additions, replacements and removals and ignore update metadata", () => {
  const backup = snapshot(), current = snapshot();
  current.documents[0] = { path: "orders/a", data: encodeValue({ paid: 200 }), version: "new" };
  current.documents = current.documents.filter(doc => doc.path !== "customers/c");
  current.documents.push({ path: "orders/new", data: encodeValue({ total: 55 }) });
  assert.deepEqual(compareSnapshots(current, backup), { added: 1, changed: 1, removed: 1, unchanged: 1 });
  const same = structuredClone(backup); same.documents[0].version = "different-read-time";
  assert.equal(snapshotHash(same), snapshotHash(backup));
});

test("malformed, duplicate and escaping paths cannot be recovered", () => {
  for (const path of ["../other", "orders/a/../b", "/orders/a", "orders/a/", "orders", "orders//a/b", "__reserved__/a"]) {
    const source = snapshot(); source.documents[0].path = path;
    assert.throws(() => validateSnapshot(source, "owner"), /INVALID_PATH/, path);
  }
  const duplicate = snapshot(); duplicate.documents.push(duplicate.documents[0]);
  assert.throws(() => validateSnapshot(duplicate, "owner"), /INVALID_PATH/);
});

test("copies retain operational records but recovery never rewinds permissions, rate limits or payment idempotency", () => {
  const source = snapshot();
  for (const path of ["aiSettings/main", "aiRateLimits/rate", "aiUsage/month", "financeIntentReceipts/payment", "pluggyItems/account"]) source.documents.push({ path, data: encodeValue({ value: "retained in file" }) });
  const unpacked = unpackSnapshot(packSnapshot(source).bytes, packSnapshot(source).hash, "owner");
  assert.equal(unpacked.documents.length, 8);
  const restored = recoveryData(unpacked);
  assert.equal(restored.documents.length, 3);
  assert.ok(restored.documents.some(doc => doc.path === "privateVault/main"));
});

test("backup APIs reject missing authentication and a forged weekly scheduler request", async () => {
  assert.equal((await GET(new Request("https://psyzon.test/api/backups?download=weekly-id"))).status, 401);
  assert.equal((await POST(new Request("https://psyzon.test/api/backups", { method: "POST", body: '{"action":"restore","confirmed":true}' }))).status, 401);
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-only-cron-secret";
  try { assert.equal((await weekly(new Request("https://psyzon.test/api/backups/weekly", { headers: { authorization: "Bearer wrong" } }))).status, 401); }
  finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});
