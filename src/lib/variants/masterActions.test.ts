import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import type { SlotKlassifikator } from "./masterLlm";
import type { SlotRegenerator } from "./master";

/**
 * Voller Master-Flow gegen echte (lokale) DB (D221/D222): gruppieren → Content des
 * Base-Childs freigeben → Master ableiten → freigeben → auf Geschwister propagieren.
 * LLM (Klassifikator/Regenerator) wird als Stub injiziert — deterministisch.
 */

beforeAll(() => {
  process.env.DB_FILE = `.data/master-${Date.now()}.db`;
});

const keinRegenerate: SlotKlassifikator = async () => ({ regenerateIds: [], mock: true });
const regeneratorVerboten: SlotRegenerator = async () => {
  throw new Error("regenerate darf hier nicht aufgerufen werden (keine regenerate-Slots)");
};

const BASE_BULLETS = [
  "Zuckerfrei und vegan ohne künstliche Süßstoffe für den ganzen Tag.",
  "Erdbeere sorgt für den fruchtigen Geschmack beim Anmischen.",
  "Perfekt zum Anmischen mit stillem oder sprudelndem Wasser.",
  "Ideal für Sport, Büro und unterwegs in praktischer Dose.",
  "Hergestellt in Deutschland nach geprüften Qualitätsstandards.",
];
const BASE_TITLE = "Freaky Joe Erdbeere Elektrolytpulver 500 g zuckerfrei vegan zum Anmischen in Wasser";
const BASE_DESC = "Freaky Joe Erdbeere Elektrolytpulver versorgt dich mit Mineralstoffen.\n\nEinfach mit Wasser anmischen und genießen.";

describe("Master-Flow (Ableiten → Freigeben → Propagieren)", () => {
  it("propagiert den Master auf ein Geschwister-Child: token-Tausch + locked byte-identisch", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const db = await getDb();

    // Marke + zwei Childs
    await db.insert(schema.clients).values({ id: "mc", name: "K", slug: "k-master" });
    await db.insert(schema.brands).values({ id: "mb", clientId: "mc", name: "M" });
    await db.insert(schema.products).values({ id: "m-base", brandId: "mb", name: "Erdbeere", asin: "B0MST001", marke: "Freaky Joe", marketplace: "de" });
    await db.insert(schema.products).values({ id: "m-kiwi", brandId: "mb", name: "Kiwi", asin: "B0MST002", marke: "Freaky Joe", marketplace: "de" });

    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "mb",
      parent: { modus: "container", name: "Freaky Joe Elektrolyte" },
      theme: ["flavor"],
      children: [
        { productId: "m-base", axisValues: { flavor: "Erdbeere" } },
        { productId: "m-kiwi", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;
    const parentId = grp.parentId;

    // Freigegebener Content des Base-Childs
    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "m-base", type, version: 1, payload, status: "approved" });
    await mk("title", { text: BASE_TITLE });
    await mk("bullets", { items: BASE_BULLETS });
    await mk("description", { text: BASE_DESC });

    // Master ableiten (Stub-Klassifikator: nichts regenerate) + freigeben
    const entwurf = await baueMasterEntwurfKern(db, parentId, "m-base", keinRegenerate);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    // Titel-Slot muss Token tragen (Erdbeere → {{flavor}})
    const titleSlot = entwurf.master.slots.find((s) => s.id === "title")!;
    expect(titleSlot.kind).toBe("token");
    expect(titleSlot.template).toContain("{{flavor}}");
    // Bullet 1 (kein Achsenwert) locked
    expect(entwurf.master.slots.find((s) => s.id === "bullet.1")!.kind).toBe("locked");

    const frei = await gibMasterFreiKern(db, parentId, entwurf.master);
    expect(frei.ok).toBe(true);

    // Propagieren (Regenerator verboten — es gibt keine regenerate-Slots)
    const prop = await propagiereFamilieKern(db, parentId, regeneratorVerboten);
    expect(prop.ok).toBe(true);
    expect(prop.kinder.map((k) => k.asin)).toEqual(["B0MST002"]); // nur Kiwi, nicht Base

    // KEINE Cross-Child-Verletzung (locked byte-identisch)
    expect(prop.kinder[0].issues.some((i) => i.rule === "familie.locked-konsistent")).toBe(false);

    // Persistierte Entwürfe des Kiwi-Childs prüfen
    const titleV = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "m-kiwi"), eq(schema.contentVersions.type, "title")),
    });
    expect((titleV?.payload as { text: string }).text).toBe(BASE_TITLE.replace("Erdbeere", "Kiwi")); // token-Tausch
    const bulletsV = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "m-kiwi"), eq(schema.contentVersions.type, "bullets")),
    });
    const items = (bulletsV?.payload as { items: string[] }).items;
    expect(items[0]).toBe(BASE_BULLETS[0]); // locked byte-identisch
    expect(items[1]).toBe("Kiwi sorgt für den fruchtigen Geschmack beim Anmischen."); // token-Tausch
  });

  it("verweigert Ableiten ohne freigegebenen Base-Content", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern } = await import("./masterActions");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "mc2", name: "K2", slug: "k-master2" });
    await db.insert(schema.brands).values({ id: "mb2", clientId: "mc2", name: "M2" });
    await db.insert(schema.products).values({ id: "m2-base", brandId: "mb2", name: "A", asin: "B0MSTA01", marke: "X", marketplace: "de" });
    await db.insert(schema.products).values({ id: "m2-ch2", brandId: "mb2", name: "B", asin: "B0MSTA02", marke: "X", marketplace: "de" });
    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "mb2",
      parent: { modus: "container", name: "X" },
      theme: ["flavor"],
      children: [
        { productId: "m2-base", axisValues: { flavor: "A" } },
        { productId: "m2-ch2", axisValues: { flavor: "B" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;
    const res = await baueMasterEntwurfKern(db, grp.parentId, "m2-base", keinRegenerate);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fehler).toContain("freigegebenen Content");
  });

  // Gemeinsames Seeding: Marke + Base + Kiwi gruppieren + freigegebenen Base-Content anlegen.
  async function seedFamilie(suffix: string) {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: `c-${suffix}`, name: "K", slug: `k-${suffix}` });
    await db.insert(schema.brands).values({ id: `b-${suffix}`, clientId: `c-${suffix}`, name: "M" });
    await db.insert(schema.products).values({ id: `${suffix}-base`, brandId: `b-${suffix}`, name: "Erdbeere", asin: `B0${suffix}A`, marke: "Freaky Joe", marketplace: "de" });
    await db.insert(schema.products).values({ id: `${suffix}-kiwi`, brandId: `b-${suffix}`, name: "Kiwi", asin: `B0${suffix}B`, marke: "Freaky Joe", marketplace: "de" });
    const grp = await gruppiereZuFamilieKern(db, {
      brandId: `b-${suffix}`,
      parent: { modus: "container", name: "Fam" },
      theme: ["flavor"],
      children: [
        { productId: `${suffix}-base`, axisValues: { flavor: "Erdbeere" } },
        { productId: `${suffix}-kiwi`, axisValues: { flavor: "Kiwi" } },
      ],
    });
    if (!grp.ok) throw new Error("seed grouping failed");
    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: `${suffix}-base`, type, version: 1, payload, status: "approved" });
    await mk("title", { text: BASE_TITLE });
    await mk("bullets", { items: BASE_BULLETS });
    await mk("description", { text: BASE_DESC });
    return { db, schema, parentId: grp.parentId };
  }

  it("propagiert regenerate-Slots über den injizierten Regenerator und meldet Mock ehrlich", async () => {
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const { db, schema, parentId } = await seedFamilie("rgn");

    // Klassifikator hebt einen locked-Bullet auf regenerate (bullet.3 = „Perfekt zum Anmischen…")
    const markiere: SlotKlassifikator = async () => ({ regenerateIds: ["bullet.3"], mock: false });
    const entwurf = await baueMasterEntwurfKern(db, parentId, "rgn-base", markiere);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    expect(entwurf.master.slots.find((s) => s.id === "bullet.3")!.kind).toBe("regenerate");
    await gibMasterFreiKern(db, parentId, entwurf.master);

    let calls = 0;
    const regen: SlotRegenerator = async (slot, axis) => {
      calls++;
      return `Frisch für ${axis.flavor}: ${slot.id}`;
    };
    const prop = await propagiereFamilieKern(db, parentId, regen, { regeneratorMock: true });
    expect(prop.ok).toBe(true);
    expect(calls).toBe(1); // genau ein regenerate-Slot × ein Ziel-Child
    expect(prop.mock).toBe(true); // regeneratorMock + regenerate-Slots → ehrliches Signal
    expect(prop.warnung).toContain("Mock");

    const bulletsV = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "rgn-kiwi"), eq(schema.contentVersions.type, "bullets")),
    });
    expect((bulletsV?.payload as { items: string[] }).items[2]).toBe("Frisch für Kiwi: bullet.3");
  });

  it("weist ein Child mit fehlendem Achsenwert ab und persistiert es NICHT", async () => {
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const { eq: eqOp } = await import("drizzle-orm");
    const { db, schema, parentId } = await seedFamilie("axf");
    const entwurf = await baueMasterEntwurfKern(db, parentId, "axf-base", keinRegenerate);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, parentId, entwurf.master);

    // Achsenwert des Geschwisters nachträglich zerstören
    await db.update(schema.products).set({ variantAxisValues: {} }).where(eqOp(schema.products.id, "axf-kiwi"));

    const prop = await propagiereFamilieKern(db, parentId, regeneratorVerboten);
    const kiwi = prop.kinder.find((k) => k.productId === "axf-kiwi")!;
    expect(kiwi.passed).toBe(false);
    expect(kiwi.issues.some((i) => i.rule === "familie.achsenwert-fehlt")).toBe(true);
    const titleV = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "axf-kiwi"), eq(schema.contentVersions.type, "title")),
    });
    expect(titleV).toBeUndefined(); // nicht persistiert
  });

  it("Familien-Audit erkennt einen manuell abweichenden locked-Slot (Gate NICHT tautologisch)", async () => {
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern, auditFamilieKonsistenzKern } = await import("./masterActions");
    const { db, schema, parentId } = await seedFamilie("aud");
    const entwurf = await baueMasterEntwurfKern(db, parentId, "aud-base", keinRegenerate);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, parentId, entwurf.master);
    await propagiereFamilieKern(db, parentId, regeneratorVerboten);

    // Kiwi-Bullets manuell so freigeben, dass der locked-Bullet 1 („zuckerfrei…") abweicht
    const kaputt = [...BASE_BULLETS];
    kaputt[0] = "Nur vegan.";
    await db.insert(schema.contentVersions).values({
      id: crypto.randomUUID(), productId: "aud-kiwi", type: "bullets", version: 99, payload: { items: kaputt }, status: "approved",
    });

    const audit = await auditFamilieKonsistenzKern(db, parentId);
    expect(audit.ok).toBe(true);
    const kiwi = audit.kinder.find((k) => k.productId === "aud-kiwi")!;
    expect(kiwi.issues.some((i) => i.rule === "familie.locked-konsistent")).toBe(true);
  });

  it("Representative als Base: Master ableiten + auf die übrigen Varianten propagieren", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "rc", name: "K", slug: "k-rep" });
    await db.insert(schema.brands).values({ id: "rb", clientId: "rc", name: "M" });
    await db.insert(schema.products).values({ id: "rep-par", brandId: "rb", name: "Erdbeere", asin: "B0REP001", marke: "Freaky Joe", marketplace: "de" });
    await db.insert(schema.products).values({ id: "rep-a", brandId: "rb", name: "Kiwi", asin: "B0REP002", marke: "Freaky Joe", marketplace: "de" });

    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "rb",
      parent: { modus: "vorhanden", productId: "rep-par" }, // Representative = Base
      theme: ["flavor"],
      children: [
        { productId: "rep-par", axisValues: { flavor: "Erdbeere" } },
        { productId: "rep-a", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;

    // Freigegebener Content des Representative (= Base)
    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "rep-par", type, version: 1, payload, status: "approved" });
    await mk("title", { text: BASE_TITLE });
    await mk("bullets", { items: BASE_BULLETS });
    await mk("description", { text: BASE_DESC });

    const entwurf = await baueMasterEntwurfKern(db, "rep-par", "rep-par", keinRegenerate);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, "rep-par", entwurf.master);

    const prop = await propagiereFamilieKern(db, "rep-par", regeneratorVerboten);
    expect(prop.ok).toBe(true);
    expect(prop.kinder.map((k) => k.asin)).toEqual(["B0REP002"]); // nur rep-a (Kiwi), NICHT der Representative
    const titleV = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "rep-a"), eq(schema.contentVersions.type, "title")),
    });
    expect((titleV?.payload as { text: string }).text).toBe(BASE_TITLE.replace("Erdbeere", "Kiwi"));
  });

  it("Representative als NICHT-Base wird mit-propagiert (nicht übersprungen)", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "rnc", name: "K", slug: "k-rns" });
    await db.insert(schema.brands).values({ id: "rnb", clientId: "rnc", name: "M" });
    await db.insert(schema.products).values({ id: "rns-rep", brandId: "rnb", name: "Cola", asin: "B0RNS001", marke: "Freaky Joe", marketplace: "de" });
    await db.insert(schema.products).values({ id: "rns-a", brandId: "rnb", name: "Erdbeere", asin: "B0RNS002", marke: "Freaky Joe", marketplace: "de" });
    await db.insert(schema.products).values({ id: "rns-b", brandId: "rnb", name: "Kiwi", asin: "B0RNS003", marke: "Freaky Joe", marketplace: "de" });

    // rns-rep ist der Representative (Kopf), Base wird aber rns-a (Erdbeere)
    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "rnb",
      parent: { modus: "vorhanden", productId: "rns-rep" },
      theme: ["flavor"],
      children: [
        { productId: "rns-rep", axisValues: { flavor: "Cola" } },
        { productId: "rns-a", axisValues: { flavor: "Erdbeere" } },
        { productId: "rns-b", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);

    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "rns-a", type, version: 1, payload, status: "approved" });
    await mk("title", { text: BASE_TITLE });
    await mk("bullets", { items: BASE_BULLETS });
    await mk("description", { text: BASE_DESC });

    const entwurf = await baueMasterEntwurfKern(db, "rns-rep", "rns-a", keinRegenerate); // Base = Child, nicht Representative
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, "rns-rep", entwurf.master);

    const prop = await propagiereFamilieKern(db, "rns-rep", regeneratorVerboten);
    expect(prop.ok).toBe(true);
    // Ziele = Representative (rns-rep) UND rns-b — NICHT die Base (rns-a).
    expect(prop.kinder.map((k) => k.asin).sort()).toEqual(["B0RNS001", "B0RNS003"]);

    // Der Representative bekam den Master: locked-Bullet 1 byte-identisch, Titel Cola-getauscht.
    const repBullets = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "rns-rep"), eq(schema.contentVersions.type, "bullets")),
    });
    expect((repBullets?.payload as { items: string[] }).items[0]).toBe(BASE_BULLETS[0]);
    const repTitle = await db.query.contentVersions.findFirst({
      where: and(eq(schema.contentVersions.productId, "rns-rep"), eq(schema.contentVersions.type, "title")),
    });
    expect((repTitle?.payload as { text: string }).text).toBe(BASE_TITLE.replace("Erdbeere", "Cola"));
  });
});
