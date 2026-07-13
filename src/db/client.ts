import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * DB-Zugriff via Turso/libSQL (D43) — gleicher Stack wie sales-room/seo-os:
 * - Mit TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN): Turso-Cloud, von überall erreichbar.
 * - Ohne: lokale Datei ./.data/dev.db (gleiche Engine, kein Setup nötig).
 * Migrationen (./drizzle) laufen beim ersten Zugriff automatisch.
 */

export type Db = LibSQLDatabase<typeof schema>;

let _db: Promise<Db> | null = null;

async function init(): Promise<Db> {
  const { createClient } = await import("@libsql/client");
  const { migrate } = await import("drizzle-orm/libsql/migrator");

  const url = process.env.TURSO_DATABASE_URL;
  let client;
  if (url) {
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  } else if (process.env.VERCEL) {
    // Auf Vercel gibt es kein beschreibbares Dateisystem — ohne Turso-Variablen
    // klar scheitern statt kryptisch beim mkdir.
    throw new Error(
      "TURSO_DATABASE_URL fehlt. In Vercel unter Settings → Environment Variables setzen (siehe DEPLOY.md) und danach Redeploy klicken.",
    );
  } else {
    const file = process.env.DB_FILE ?? "./.data/dev.db";
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(file), { recursive: true });
    client = createClient({ url: `file:${file}` });
  }

  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export function getDb(): Promise<Db> {
  if (!_db) _db = init();
  return _db;
}

export { schema };
