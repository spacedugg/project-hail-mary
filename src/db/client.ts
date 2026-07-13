import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * DB-Zugriff, anbieter-neutral (D25/D36):
 * - Mit DATABASE_URL (Supabase/Postgres): postgres-js.
 * - Ohne: eingebettetes PGlite (echte Postgres-Semantik, Datei ./.data/dev).
 * Der Wechsel auf Supabase ist ausschließlich ein Env-Wechsel — kein Code-Umbau.
 * Migrationen (./drizzle) laufen beim ersten Zugriff automatisch.
 */

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

let _db: Promise<Db> | null = null;

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const db = drizzlePostgres(postgres(url, { prepare: false }), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    return db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = process.env.PGLITE_DIR ?? "./.data/dev";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dataDir, { recursive: true });
  const db = drizzlePglite(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export function getDb(): Promise<Db> {
  if (!_db) _db = init();
  return _db;
}

export { schema };
