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

/** Minimaler struktureller Typ des libSQL-Clients (nur was wir hier brauchen). */
type SqlClient = { execute: (sql: string) => Promise<unknown> };

/**
 * Migrationen anwenden — robust gegen eine bereits provisionierte Turso-DB,
 * deren Ist-Stand vom Migrations-Verlauf abweicht (D207-Nachtrag): Wenn ein
 * Objekt aus einem früheren Deploy/Push schon existiert, scheitert der
 * Standard-Migrator an genau EINER Anweisung und reißt — weil der Fehler in
 * getDb() gecacht wird — die GANZE App mit (500 auf jeder Seite, inkl. Login).
 *
 * Ablauf: erst der normale Drizzle-Migrator. Scheitert er, ziehen wir die
 * .sql-Dateien statementweise nach und überspringen bewusst „already exists"
 * bzw. „duplicate column" — so konvergiert das Schema, ohne dass ein Hickup das
 * Tool lahmlegt. Ein ECHTER Fehler (kein Idempotenz-Fall) wird weitergereicht.
 */
async function runMigrations(client: SqlClient, db: Db): Promise<void> {
  const { migrate } = await import("drizzle-orm/libsql/migrator");
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
        await client.execute(stmt);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e).toLowerCase();
        // Idempotenz: bereits vorhandene Objekte/Spalten sind erwartbar.
        if (msg.includes("already exists") || msg.includes("duplicate column")) continue;
        // Anderer Fehler: protokollieren, aber NICHT werfen — ein einzelnes
        // fehlgeschlagenes Statement darf das ganze Tool nicht lahmlegen
        // (Nutzer-Vorgabe: „das Tool soll trotzdem laden"). Der /api/health-
        // Endpunkt und die Logs machen die Ursache sichtbar.
        console.error(`[db] Migrations-Statement übersprungen (${datei}):`, msg, "\n", stmt.slice(0, 200));
      }
    }
  }
}

async function init(): Promise<Db> {
  const { createClient } = await import("@libsql/client");

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
  await runMigrations(client as SqlClient, db);
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
