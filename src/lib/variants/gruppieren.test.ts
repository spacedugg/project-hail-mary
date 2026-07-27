import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Integrationstest der Gruppieren-Kern-Funktion gegen eine echte (lokale) DB —
 * Muster wie db.smoke.test.ts: eigener DB_FILE, Auto-Migration beim ersten Zugriff.
 * Prüft die Persistenz der Variations-Familie inkl. Auflösen (D221).
 */

beforeAll(() => {
  process.env.DB_FILE = `.data/gruppieren-${Date.now()}.db`;
});

async function seedMarke(db: Awaited<ReturnType<(typeof import("../../db/client"))["getDb"]>>, schema: (typeof import("../../db/client"))["schema"], suffix: string) {
  const brandId = `b-${suffix}`;
  await db.insert(schema.clients).values({ id: `c-${suffix}`, name: `K${suffix}`, slug: `k-${suffix}` });
  await db.insert(schema.brands).values({ id: brandId, clientId: `c-${suffix}`, name: `M${suffix}` });
  return brandId;
}

describe("gruppiereZuFamilieKern", () => {
  it("verknüpft Childs zu einem Container-Parent und persistiert Rollen/Theme/Achsenwerte", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "ok");
    await db.insert(schema.products).values({ id: "ok-ch1", brandId, name: "Erdbeere", asin: "B0OK0001", marke: "Freaky Joe", marketplace: "de" });
    await db.insert(schema.products).values({ id: "ok-ch2", brandId, name: "Kiwi", asin: "B0OK0002", marke: "Freaky Joe", marketplace: "de" });

    const res = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "Freaky Joe Elektrolyte" },
      theme: ["flavor"],
      children: [
        { productId: "ok-ch1", axisValues: { flavor: "Erdbeere" } },
        { productId: "ok-ch2", axisValues: { flavor: "Kiwi" } },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const ch1 = await db.query.products.findFirst({ where: eq(schema.products.id, "ok-ch1") });
    expect(ch1?.variantRole).toBe("child");
    expect(ch1?.parentProductId).toBe(res.parentId);
    expect(ch1?.variantAxisValues).toEqual({ flavor: "Erdbeere" });

    const parent = await db.query.products.findFirst({ where: eq(schema.products.id, res.parentId) });
    expect(parent?.variantRole).toBe("parent");
    expect(parent?.variationTheme).toEqual(["flavor"]);
    expect(parent?.asin).toBeNull(); // Container: nicht kaufbar
    expect(parent?.marke).toBe("Freaky Joe");
  });

  it("löst die Familie auf: Childs zurück auf standalone, Container gelöscht", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern, loeseFamilieAufKern } = await import("./gruppieren");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "auf");
    await db.insert(schema.products).values({ id: "auf-ch1", brandId, name: "A", asin: "B0AUF001", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "auf-ch2", brandId, name: "B", asin: "B0AUF002", marke: "X", marketplace: "de" });
    const res = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "X Familie" },
      theme: ["size"],
      children: [
        { productId: "auf-ch1", axisValues: { size: "500 g" } },
        { productId: "auf-ch2", axisValues: { size: "1 kg" } },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const auf = await loeseFamilieAufKern(db, res.parentId);
    expect(auf.ok).toBe(true);
    const ch1 = await db.query.products.findFirst({ where: eq(schema.products.id, "auf-ch1") });
    expect(ch1?.variantRole).toBe("standalone");
    expect(ch1?.parentProductId).toBeNull();
    expect(ch1?.variantAxisValues).toBeNull();
    const parentGone = await db.query.products.findFirst({ where: eq(schema.products.id, res.parentId) });
    expect(parentGone).toBeUndefined(); // Container entfernt
  });

  it("weist doppelte Achsen-Kombination ab (Familien-Kontrakt greift, nichts wird geschrieben)", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "dup");
    await db.insert(schema.products).values({ id: "dup-ch1", brandId, name: "A", asin: "B0DUP001", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "dup-ch2", brandId, name: "B", asin: "B0DUP002", marke: "X", marketplace: "de" });

    const res = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "X" },
      theme: ["flavor"],
      children: [
        { productId: "dup-ch1", axisValues: { flavor: "Vanille" } },
        { productId: "dup-ch2", axisValues: { flavor: "vanille" } }, // gleiche Kombination
      ],
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.verstoesse?.length).toBeGreaterThan(0);
    const ch1 = await db.query.products.findFirst({ where: eq(schema.products.id, "dup-ch1") });
    expect(ch1?.variantRole).toBe("standalone"); // unverändert
  });

  it("weist gemischte Marktplätze ab", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "mp");
    await db.insert(schema.products).values({ id: "mp-ch1", brandId, name: "A", asin: "B0MP0001", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "mp-ch2", brandId, name: "B", asin: "B0MP0002", marke: "X", marketplace: "uk" });

    const res = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "X" },
      theme: ["flavor"],
      children: [
        { productId: "mp-ch1", axisValues: { flavor: "A" } },
        { productId: "mp-ch2", axisValues: { flavor: "B" } },
      ],
    });
    expect(res.ok).toBe(false);
  });

  it("Representative-Parent bleibt kaufbare Variante (Parent UND Child) und wird beim Auflösen NICHT gelöscht", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern, loeseFamilieAufKern } = await import("./gruppieren");
    const { ladeFamilie } = await import("./laden");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "vor");
    await db.insert(schema.products).values({ id: "vor-par", brandId, name: "Parent", asin: "B0VOR000", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "vor-ch1", brandId, name: "A", asin: "B0VOR001", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "vor-ch2", brandId, name: "B", asin: "B0VOR002", marke: "X", marketplace: "de" });

    const res = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "vorhanden", productId: "vor-par" },
      theme: ["flavor"],
      children: [
        // Der Representative ist SELBST eine Variante mit Achsenwert.
        { productId: "vor-par", axisValues: { flavor: "C" } },
        { productId: "vor-ch1", axisValues: { flavor: "A" } },
        { productId: "vor-ch2", axisValues: { flavor: "B" } },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.parentId).toBe("vor-par");

    const par = await db.query.products.findFirst({ where: eq(schema.products.id, "vor-par") });
    expect(par?.variantRole).toBe("parent");
    expect(par?.variantParentContainer).toBe(false); // kaufbarer Representative, kein Container
    expect(par?.asin).toBe("B0VOR000"); // ASIN bleibt → weiter kaufbar/bearbeitbar
    expect(par?.variantAxisValues).toEqual({ flavor: "C" }); // eigene Variante
    const ch1 = await db.query.products.findFirst({ where: eq(schema.products.id, "vor-ch1") });
    expect(ch1?.parentProductId).toBe("vor-par");

    // ladeFamilie zeigt den Representative als Kopf-Kind (Parent UND Child)
    const fam = await ladeFamilie(db, "vor-par");
    expect(fam?.istContainer).toBe(false);
    expect(fam?.kinder.length).toBe(3);
    expect(fam?.kinder.find((k) => k.id === "vor-par")?.istKopf).toBe(true);

    await loeseFamilieAufKern(db, "vor-par");
    const parAfter = await db.query.products.findFirst({ where: eq(schema.products.id, "vor-par") });
    expect(parAfter).toBeDefined(); // NICHT gelöscht — echtes Produkt bleibt erhalten
    expect(parAfter?.variantRole).toBe("standalone");
    expect(parAfter?.variationTheme).toBeNull();
    expect(parAfter?.variantAxisValues).toBeNull();
  });

  it("weist ein Child ohne ASIN mit klarer Meldung ab", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "noasin");
    await db.insert(schema.products).values({ id: "na-ch1", brandId, name: "A", asin: null, marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "na-ch2", brandId, name: "B", asin: "B0NA0002", marke: "X", marketplace: "de" });
    const res = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "X" },
      theme: ["flavor"],
      children: [
        { productId: "na-ch1", axisValues: { flavor: "A" } },
        { productId: "na-ch2", axisValues: { flavor: "B" } },
      ],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fehler).toContain("keine ASIN");
  });

  it("weist ein Child ab, das bereits Teil einer Familie ist (Re-Grouping-Schutz)", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const db = await getDb();
    const brandId = await seedMarke(db, schema, "regroup");
    await db.insert(schema.products).values({ id: "rg-ch1", brandId, name: "A", asin: "B0RG0001", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "rg-ch2", brandId, name: "B", asin: "B0RG0002", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "rg-ch3", brandId, name: "C", asin: "B0RG0003", marke: "X", marketplace: "de" });

    const erste = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "Familie A" },
      theme: ["flavor"],
      children: [
        { productId: "rg-ch1", axisValues: { flavor: "A" } },
        { productId: "rg-ch2", axisValues: { flavor: "B" } },
      ],
    });
    expect(erste.ok).toBe(true);

    // rg-ch1 ist jetzt Child von Familie A → darf nicht in eine neue Familie umgehängt werden
    const zweite = await gruppiereZuFamilieKern(db, {
      brandId,
      parent: { modus: "container", name: "Familie B" },
      theme: ["flavor"],
      children: [
        { productId: "rg-ch1", axisValues: { flavor: "A" } },
        { productId: "rg-ch3", axisValues: { flavor: "C" } },
      ],
    });
    expect(zweite.ok).toBe(false);
    if (zweite.ok) return;
    expect(zweite.fehler).toContain("bereits Teil einer Familie");
    // Familie A bleibt intakt
    const ch1 = await db.query.products.findFirst({ where: eq(schema.products.id, "rg-ch1") });
    expect(ch1?.variantRole).toBe("child");
  });
});
