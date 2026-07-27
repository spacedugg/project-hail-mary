import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * DB-Zugriff via Supabase/Postgres (D221) — EINE gemeinsame Online-DB, auf die
 * alle Personen/Geräte/Sessions denselben Stand sehen. Es gibt bewusst KEINEN
 * lokalen Datei-Fallback mehr (früher SQLite): Nichts darf offline/isoliert
 * liegen. `DATABASE_URL` ist Pflicht — lokal in .env.local, in Produktion in
 * Vercel. `prepare: false` ist für den Supabase-Transaction-Pooler nötig
 * (pgBouncer im Transaction-Modus kennt keine Prepared Statements).
 * Migrationen (./drizzle) laufen beim ersten Zugriff automatisch.
 */

export type Db = PostgresJsDatabase<typeof schema>;

let _db: Promise<Db> | null = null;

/** Minimaler struktureller Typ des postgres-js-Clients (nur was wir hier brauchen). */
type SqlClient = { unsafe: (query: string) => Promise<unknown> };

/**
 * Migrationen anwenden — robust gegen eine bereits provisionierte DB, deren
 * Ist-Stand vom Migrations-Verlauf abweicht (D207-Muster): Wenn ein Objekt aus
 * einem früheren Deploy schon existiert, scheitert der Standard-Migrator an
 * genau EINER Anweisung und reißt — weil der Fehler in getDb() gecacht wird —
 * die GANZE App mit (500 auf jeder Seite, inkl. Login).
 *
 * Ablauf: erst der normale Drizzle-Migrator. Scheitert er, ziehen wir die
 * .sql-Dateien statementweise nach und überspringen bewusst „already exists"
 * bzw. „duplicate" — so konvergiert das Schema, ohne dass ein Hickup das Tool
 * lahmlegt. Ein ECHTER Fehler (kein Idempotenz-Fall) wird protokolliert, aber
 * nicht geworfen (Nutzer-Vorgabe: „das Tool soll trotzdem laden").
 */
async function runMigrations(client: SqlClient, db: Db): Promise<void> {
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    return;
  } catch (err) {
    console.error("[db] Standard-Migrator fehlgeschlagen — toleranter Nachlauf:", err);
  }

  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = "./drizzle";
  const dateien = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const datei of dateien) {
    const inhalt = readFileSync(`${dir}/${datei}`, "utf8");
    for (const roh of inhalt.split("--> statement-breakpoint")) {
      const stmt = roh.trim().replace(/;\s*$/, "");
      if (!stmt) continue;
      try {
        await client.unsafe(stmt);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        // Idempotenz: bereits vorhandene Objekte/Spalten sind erwartbar
        // (Postgres: „relation … already exists", „column … already exists").
        if (msg.includes("already exists") || msg.includes("duplicate")) continue;
        // Anderer Fehler: protokollieren, aber NICHT werfen — ein einzelnes
        // fehlgeschlagenes Statement darf das ganze Tool nicht lahmlegen.
        console.error(`[db] Migrations-Statement übersprungen (${datei}):`, msg, "\n", stmt.slice(0, 200));
      }
    }
  }
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL fehlt. Supabase-Connection-String (Transaction Pooler) lokal in .env.local und in Vercel unter Settings → Environment Variables setzen, dann neu starten/Redeploy.",
    );
  }

  // prepare:false = Pflicht hinter dem Supabase-Transaction-Pooler.
  const client = postgres(url, { prepare: false });
  const db = drizzle(client, { schema });
  await runMigrations(client as unknown as SqlClient, db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!_db) {
    // Eine fehlgeschlagene Initialisierung NICHT dauerhaft cachen — sonst bliebe
    // die App bis zum nächsten Deploy tot. Bei Fehler wird _db zurückgesetzt,
    // der nächste Aufruf versucht es erneut.
    _db = init().catch((e) => {
      _db = null;
      throw e;
    });
  }
  return _db;
}

export { schema };
