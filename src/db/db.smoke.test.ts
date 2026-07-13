import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

beforeAll(() => {
  process.env.PGLITE_DIR = ".data/smoke-" + Date.now();
});

describe("DB (PGlite, Auto-Migration)", () => {
  it("migriert, schreibt und liest die Hierarchie", async () => {
    const { getDb, schema } = await import("./client");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "c1", name: "Testkunde", slug: "testkunde" });
    await db.insert(schema.brands).values({ id: "b1", clientId: "c1", name: "Testmarke" });
    await db.insert(schema.products).values({ id: "p1", brandId: "b1", name: "Testprodukt", asin: "B012345678" });
    const p = await db.query.products.findFirst({ where: eq(schema.products.id, "p1") });
    expect(p?.asin).toBe("B012345678");
    expect(p?.marketplace).toBe("de");
  });
});
