import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";

/**
 * DB-Smoke-Test gegen ein ECHTES Postgres — läuft NUR mit einer ausdrücklichen
 * Wegwerf-DB (SMOKE_DB_URL), NIE gegen die geteilte Produktions-DATABASE_URL
 * (D221: eine gemeinsame Online-DB — ein Testlauf würde sonst echte Daten
 * anlegen). Ohne SMOKE_DB_URL wird der Test übersprungen; er verifiziert dann
 * on demand Auto-Migration + Schreiben/Lesen der Hierarchie auf Postgres.
 */
const smokeUrl = process.env.SMOKE_DB_URL;

describe.skipIf(!smokeUrl)("DB (Supabase/Postgres, Auto-Migration)", () => {
  it("migriert, schreibt und liest die Hierarchie", { timeout: 30000 }, async () => {
    process.env.DATABASE_URL = smokeUrl;
    const { getDb, schema } = await import("./client");
    const db = await getDb();
    const suffix = `${process.pid}-${Math.round(performance.now())}`;
    const [c, b, p] = [`c-${suffix}`, `b-${suffix}`, `p-${suffix}`];
    await db.insert(schema.clients).values({ id: c, name: "Testkunde", slug: `testkunde-${suffix}` });
    await db.insert(schema.brands).values({ id: b, clientId: c, name: "Testmarke" });
    await db.insert(schema.products).values({ id: p, brandId: b, name: "Testprodukt", asin: "B012345678" });
    const gelesen = await db.query.products.findFirst({ where: eq(schema.products.id, p) });
    expect(gelesen?.asin).toBe("B012345678");
    expect(gelesen?.marketplace).toBe("de");
  });
});
