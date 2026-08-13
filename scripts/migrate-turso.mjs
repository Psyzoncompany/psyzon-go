import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";

const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url || !authToken) {
  throw new Error("Defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN antes de executar a migração.");
}

const migrationId = "0000_talented_hellfire_club";
const client = createClient({ url, authToken });
await client.execute(`
  CREATE TABLE IF NOT EXISTS __psyzon_migrations (
    id TEXT PRIMARY KEY NOT NULL,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

const existing = await client.execute({
  sql: "SELECT id FROM __psyzon_migrations WHERE id = ? LIMIT 1",
  args: [migrationId],
});

if (existing.rows.length) {
  console.log(`Migração ${migrationId} já aplicada.`);
  process.exit(0);
}

const sql = await readFile(new URL("../drizzle/0000_talented_hellfire_club.sql", import.meta.url), "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

await client.batch([
  ...statements,
  { sql: "INSERT INTO __psyzon_migrations (id) VALUES (?)", args: [migrationId] },
], "write");

console.log(`Migração ${migrationId} aplicada com sucesso (${statements.length} instruções).`);
