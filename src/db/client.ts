import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * DB-Zugriff via Supabase/Postgres (D221/D262) — EINE gemeinsame Online-DB, auf
 * die alle Personen/Geräte/Sessions denselben Stand sehen. Es gibt bewusst
 * KEINEN lokalen Datei-Fallback mehr (früher SQLite ./.data/dev.db): Nichts darf
 * offline/isoliert liegen. `DATABASE_URL` ist Pflicht.
 *
 * Verbindung: Supabase Transaction Pooler (Port 6543).
 * - `prepare: false` ist dort Pflicht — der Transaction-Modus kennt keine
 *   Prepared Statements.
 * - TLS wird im Code erzwungen (`ssl: "require"`), nicht über die URL: so kann
 *   sie beim Kopieren nicht verloren gehen. Notausgang ohne Code-Deploy, falls
 *   ein Pooler-Endpunkt sie verweigert: `DATABASE_SSL=off`.
 *
 * Tests nutzen `DB_DRIVER=pglite` (echtes Postgres als WASM im Prozess) —
 * gleiche Engine wie Produktion, aber ohne Netz und ohne gemeinsame DB.
 *
 * Migrationen (./drizzle) laufen beim ersten Zugriff automatisch.
 */

export type Db = PostgresJsDatabase<typeof schema>;

let _db: Promise<Db> | null = null;

/** Minimaler struktureller Typ für den toleranten Migrations-Nachlauf. */
type SqlRunner = (query: string) => Promise<unknown>;

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
 * lahmlegt. Ein ECHTER Fehler wird protokolliert, aber nicht geworfen
 * (Nutzer-Vorgabe: „das Tool soll trotzdem laden"). /api/health macht die
 * Ursache sichtbar.
 */
async function runMigrations(migrator: () => Promise<void>, run: SqlRunner): Promise<void> {
  try {
    await migrator();
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
        await run(stmt);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        // Idempotenz: bereits vorhandene Objekte/Spalten sind erwartbar
        // (Postgres: „relation … already exists", „column … already exists").
        if (msg.includes("already exists") || msg.includes("duplicate")) continue;
        console.error(`[db] Migrations-Statement übersprungen (${datei}):`, msg, "\n", stmt.slice(0, 200));
      }
    }
  }
}

/**
 * Test-Treiber: PGlite = echtes Postgres als WASM im Prozess. Bewusst
 * In-Memory und pro Prozess frisch — Tests dürfen niemals auf der gemeinsamen
 * Online-DB laufen (und nichts darf lokal liegenbleiben).
 */
async function initPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await runMigrations(
    () => migrate(db, { migrationsFolder: "./drizzle" }),
    (stmt) => client.exec(stmt),
  );
  // Für unsere Queries ist die Oberfläche identisch; der Cast hält alle 38
  // Aufrufstellen frei von einem Union-Typ, den nur die Tests bräuchten.
  return db as unknown as Db;
}

async function initPostgres(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL fehlt. Supabase-Connection-String (Transaction Pooler, Port 6543) in Vercel unter Settings → Environment Variables setzen bzw. lokal in .env.local, dann Redeploy/Neustart.",
    );
  }

  const { default: postgres } = await import("postgres");
  const client = postgres(url, {
    prepare: false,
    ssl: process.env.DATABASE_SSL === "off" ? false : "require",
  });
  const db = drizzle(client, { schema });
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  await runMigrations(
    () => migrate(db, { migrationsFolder: "./drizzle" }),
    (stmt) => client.unsafe(stmt),
  );
  return db;
}

async function init(): Promise<Db> {
  return process.env.DB_DRIVER === "pglite" ? initPglite() : initPostgres();
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
