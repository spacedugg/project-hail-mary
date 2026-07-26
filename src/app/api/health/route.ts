import { NextResponse } from "next/server";
import { getDb, schema } from "@/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Health-Check (D207-Nachtrag): prüft, ob die DB erreichbar ist und die
 * Migrationen durchliefen. Öffentlich, aber ohne sensible Daten — meldet nur
 * ok/Fehlermeldung und die Anzahl vorhandener Content-Verwaltungs-Tabellen.
 * Dient zur schnellen Live-Verifikation nach einem Deploy.
 */
export async function GET() {
  try {
    const db = await getDb();
    // leichte Query gegen eine Kern- und eine Feature-Tabelle
    const users = await db.select({ n: sql<number>`count(*)` }).from(schema.users);
    const pieces = await db.select({ n: sql<number>`count(*)` }).from(schema.contentPieces);
    return NextResponse.json({
      ok: true,
      db: "reachable",
      migrationsOk: true,
      users: users[0]?.n ?? null,
      contentPieces: pieces[0]?.n ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
