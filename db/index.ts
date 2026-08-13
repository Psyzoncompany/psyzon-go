import { env } from "cloudflare:workers";
import { createClient } from "@libsql/client";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzleLibSql } from "drizzle-orm/libsql";
import * as schema from "./schema";

type AppDatabase = ReturnType<typeof drizzleD1<typeof schema>>;
let remoteDatabase: AppDatabase | null = null;

export function getDb() {
  const remoteUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (remoteUrl) {
    if (!remoteDatabase) {
      const client = createClient({
        url: remoteUrl,
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      });
      remoteDatabase = drizzleLibSql(client, { schema }) as unknown as AppDatabase;
    }
    return remoteDatabase;
  }

  if (env.DB) return drizzleD1(env.DB, { schema });

  throw new Error("AI_DATABASE_NOT_CONFIGURED");
}
