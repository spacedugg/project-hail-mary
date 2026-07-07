import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * DB-Zugriff, anbieter-neutral (D25/D36):
 * - Mit DATABASE_URL (Supabase/Postgres): postgres-js.
 * - Ohne: eingebettetes PGlite (echte Postgres-Semantik, Datei ./.data/dev.db).
 * Der Wechsel auf Supabase ist ausschließlich ein Env-Wechsel — kein Code-Umbau.
 */

export type Db = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    _db = drizzlePostgres(postgres(url, { prepare: false }), { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = process.env.PGLITE_DIR ?? "./.data/dev";
    _db = drizzlePglite(new PGlite(dataDir), { schema });
  }
  return _db;
}

export { schema };
