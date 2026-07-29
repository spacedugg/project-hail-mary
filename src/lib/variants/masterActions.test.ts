import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import type { SlotKlassifikator } from "./masterLlm";
import type { SlotRegenerator } from "./master";

/**
 * Voller Master-Flow gegen echte DB via PGlite (D221/D222/D262): gruppieren → Content des
 * Base-Childs freigeben → Master ableiten → freigeben → auf Geschwister propagieren.
 * LLM (Klassifikator/Regenerator) wird als Stub injiziert — deterministisch.
 */

beforeAll(() => {
  process.env.DB_DRIVER = "pglite";
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

  it("kopierte Base-Zahlen gelten in Geschwistern als belegt — kein Scrape-Rausch-Widerspruch, erfundene Zahl schlägt weiter an", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "zc", name: "K", slug: "k-zahl" });
    await db.insert(schema.brands).values({ id: "zb", clientId: "zc", name: "M" });
    // Base trägt die physische Familien-Wahrheit; Kiwi wurde pro-ASIN leicht abweichend gescrapt
    // (10,8 statt 10,2 → genau das „Scrape-Rauschen", das früher falsche Widersprüche erzeugte).
    await db.insert(schema.products).values({ id: "z-base", brandId: "zb", name: "Erdbeere", asin: "B0ZAH001", marke: "Freaky Joe", marketplace: "de", facts: { dimensions: "10,2 x 10,1 x 9 cm", specs: { zubereitung: "30 Sekunden" } } });
    await db.insert(schema.products).values({ id: "z-kiwi", brandId: "zb", name: "Kiwi", asin: "B0ZAH002", marke: "Freaky Joe", marketplace: "de", facts: { dimensions: "10,8 x 10,3 x 9 cm" } });

    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "zb",
      parent: { modus: "container", name: "Fam" },
      theme: ["flavor"],
      children: [
        { productId: "z-base", axisValues: { flavor: "Erdbeere" } },
        { productId: "z-kiwi", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;

    // LOCKED-Bullets (kein Flavor) tragen Base-Maße + Zubereitungszeit → wortgleich zum Kiwi kopiert.
    // Bullet 5 trägt eine ERFUNDENE Zahl (42, in KEINER Quelle) als Gegenprobe.
    const bullets = [
      "PRAKTISCHE DOSE: Kompakt mit 10,2 x 10,1 cm für unterwegs.",
      "SCHNELL FERTIG: In 30 Sekunden angerührt und trinkfertig.",
      "REIN PFLANZLICH: Zuckerfrei und vegan ohne künstliche Zusätze.",
      "IDEAL UNTERWEGS: Passt in jede Sporttasche und jeden Rucksack.",
      "HITZEFEST: Hält problemlos 42 Grad Sommerhitze im Auto aus.",
    ];
    const titel = "Freaky Joe Elektrolytpulver Erdbeere zuckerfrei vegan zum Anmischen in stillem Wasser";
    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "z-base", type, version: 1, payload, status: "approved" });
    await mk("title", { text: titel });
    await mk("bullets", { items: bullets });
    await mk("description", { text: "Kompakt mit 10,2 x 10,1 cm und in 30 Sekunden fertig angerührt." });

    // Bullet 5 (mit der erfundenen 42) wird als REGENERATE markiert → es durchläuft
    // das volle QM (D247). Bullets 1–4 + Beschreibung bleiben locked → keine erneute Prüfung.
    const markiereBullet5: SlotKlassifikator = async () => ({ regenerateIds: ["bullet.5"], mock: false });
    const regenBehaeltText: SlotRegenerator = async (slot) => slot.template; // Referenztext (inkl. „42 Grad")
    const entwurf = await baueMasterEntwurfKern(db, grp.parentId, "z-base", markiereBullet5);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, grp.parentId, entwurf.master);

    const prop = await propagiereFamilieKern(db, grp.parentId, regenBehaeltText);
    expect(prop.ok).toBe(true);
    const kiwi = prop.kinder.find((k) => k.productId === "z-kiwi")!;

    // Base-belegte Zahlen dürfen im Geschwister NICHT als ohne-quelle/widerspruch anschlagen
    // (locked-Bullets werden ohnehin nicht mehr geprüft; zusätzlich sind sie via D240 belegt).
    const zahlMeldungen = kiwi.issues.filter((i) => i.rule.includes("zahl")).map((i) => i.message).join(" | ");
    expect(zahlMeldungen).not.toContain("10,1");
    expect(zahlMeldungen).not.toContain("10,2");
    expect(zahlMeldungen).not.toContain("30 Sekunden");
    // Gegenprobe: die ERFUNDENE Zahl (42) im REGENERATE-Bullet MUSS anschlagen — QM bleibt dort scharf.
    expect(kiwi.issues.some((i) => i.rule === "bullets.zahl-ohne-quelle" && i.message.includes("42"))).toBe(true);
  });

  it("Content-Plan begrenzt den Ableitungs-Umfang — Abgewähltes wird nicht propagiert (D258)", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern, umfangAusPlan } = await import("./masterActions");
    const { eq: eqOp, and: andOp } = await import("drizzle-orm");
    const db = await getDb();

    // Plan-Mapping: nur Titel + Bullets geplant (keine Beschreibung).
    expect(umfangAusPlan(["title", "bullets", "qa"])).toEqual(["title", "bullet"]);
    expect(umfangAusPlan(null)).toEqual(["title", "bullet", "description"]);

    await db.insert(schema.clients).values({ id: "pc", name: "K", slug: "k-plan" });
    await db.insert(schema.brands).values({ id: "pb", clientId: "pc", name: "M" });
    await db.insert(schema.products).values({ id: "p-base", brandId: "pb", name: "Erdbeere", asin: "B0PLAN01", marke: "Freaky Joe", marketplace: "de", facts: {} });
    await db.insert(schema.products).values({ id: "p-kiwi", brandId: "pb", name: "Kiwi", asin: "B0PLAN02", marke: "Freaky Joe", marketplace: "de", facts: {} });
    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "pb",
      parent: { modus: "container", name: "Fam" },
      theme: ["flavor"],
      children: [
        { productId: "p-base", axisValues: { flavor: "Erdbeere" } },
        { productId: "p-kiwi", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;
    // Parent-Plan: NUR Titel + Bullets.
    await db.update(schema.products).set({ contentPlan: ["title", "bullets"] }).where(eqOp(schema.products.id, grp.parentId));

    // Base hat freigegebenen Titel + Bullets, aber KEINE Beschreibung.
    const mk = (type: "title" | "bullets", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "p-base", type, version: 1, payload, status: "approved" });
    await mk("title", { text: "Freaky Joe Elektrolytpulver Erdbeere vegan zuckerfrei zum Anmischen" });
    await mk("bullets", { items: ["PRAKTISCH: Kompakt.", "VEGAN: Ohne Zutaten.", "SCHNELL: Fix.", "DABEI: Tasche.", "DEUTSCH: Germany."] });

    // Ableitung gelingt OHNE Beschreibung, weil sie nicht im Plan steht.
    const entwurf = await baueMasterEntwurfKern(db, grp.parentId, "p-base", keinRegenerate);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    expect(entwurf.master.umfang).toEqual(["title", "bullet"]);
    expect(entwurf.master.slots.some((s) => s.quelle === "description")).toBe(false);
    await gibMasterFreiKern(db, grp.parentId, entwurf.master);

    const prop = await propagiereFamilieKern(db, grp.parentId, regeneratorVerboten);
    expect(prop.ok).toBe(true);
    // Beim Kind entstehen Titel + Bullets — aber KEINE Beschreibung.
    const hat = async (t: "title" | "bullets" | "description") =>
      !!(await db.query.contentVersions.findFirst({
        where: andOp(eqOp(schema.contentVersions.productId, "p-kiwi"), eqOp(schema.contentVersions.type, t)),
      }));
    expect(await hat("title")).toBe(true);
    expect(await hat("bullets")).toBe(true);
    expect(await hat("description")).toBe(false);
    // Und kein Beschreibungs-Befund als Rauschen über etwas absichtlich Fehlendes.
    const kiwi = prop.kinder.find((k) => k.productId === "p-kiwi")!;
    expect(kiwi.issues.some((i) => i.rule.startsWith("description."))).toBe(false);
  });

  it("kopierte Slots (locked/token) werden nicht erneut geprüft — Budget-Unterschreitung blockt nicht (D247)", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "sc", name: "K", slug: "k-slot" });
    await db.insert(schema.brands).values({ id: "sb", clientId: "sc", name: "M" });
    await db.insert(schema.products).values({ id: "s-base", brandId: "sb", name: "Erdbeere", asin: "B0SLOT01", marke: "Freaky Joe", marketplace: "de", facts: {} });
    await db.insert(schema.products).values({ id: "s-kiwi", brandId: "sb", name: "Kiwi", asin: "B0SLOT02", marke: "Freaky Joe", marketplace: "de", facts: {} });
    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "sb",
      parent: { modus: "container", name: "Fam" },
      theme: ["flavor"],
      children: [
        { productId: "s-base", axisValues: { flavor: "Erdbeere" } },
        { productId: "s-kiwi", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;
    // Kurze Bullets (<300 B) → im vollen Gate budget-Warnungen; als locked kopiert dürfen sie NICHT
    // anschlagen. Titel im gültigen Band (kein hartes Limit), damit der Test nur die Unterschreitung prüft.
    const bullets = [
      "PRAKTISCH: Kompakt und leicht.",
      "VEGAN: Ohne tierische Zutaten.",
      "SCHNELL: Fix angerührt.",
      "DABEI: Passt in die Tasche.",
      "DEUTSCH: Made in Germany.",
    ];
    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "s-base", type, version: 1, payload, status: "approved" });
    await mk("title", { text: "Freaky Joe Elektrolytpulver Erdbeere vegan zuckerfrei zum Anmischen" });
    await mk("bullets", { items: bullets });
    await mk("description", { text: "Kurze Beschreibung zum Anmischen mit Wasser." });

    const entwurf = await baueMasterEntwurfKern(db, grp.parentId, "s-base", keinRegenerate);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, grp.parentId, entwurf.master);

    const prop = await propagiereFamilieKern(db, grp.parentId, regeneratorVerboten);
    expect(prop.ok).toBe(true);
    const kiwi = prop.kinder.find((k) => k.productId === "s-kiwi")!;
    // Unterschreitungs-/Qualitäts-Findings kopierter Slots dürfen NICHT erscheinen …
    expect(kiwi.issues.some((i) => i.rule === "bullets.budget")).toBe(false);
    expect(kiwi.issues.some((i) => i.rule.startsWith("title.") || i.rule.startsWith("description."))).toBe(false);
    // … und ohne echten Fehler ist das Kind freigabefähig.
    expect(kiwi.passed).toBe(true);
  });

  it("Zahl nur auf dem Base-Bild gilt im Geschwister als belegt (D240 Bild-Beleg fließt in die Familien-Wahrheit)", async () => {
    const { getDb, schema } = await import("../../db/client");
    const { gruppiereZuFamilieKern } = await import("./gruppieren");
    const { baueMasterEntwurfKern, gibMasterFreiKern, propagiereFamilieKern } = await import("./masterActions");
    const db = await getDb();
    await db.insert(schema.clients).values({ id: "bc", name: "K", slug: "k-bild" });
    await db.insert(schema.brands).values({ id: "bb", clientId: "bc", name: "M" });
    // facts LEER + KEINE Keywords → die Zahl „480 mg" hat NUR eine mögliche Quelle: den Bild-Text.
    await db.insert(schema.products).values({ id: "b-base", brandId: "bb", name: "Erdbeere", asin: "B0BILD01", marke: "Freaky Joe", marketplace: "de", facts: {} });
    await db.insert(schema.products).values({ id: "b-kiwi", brandId: "bb", name: "Kiwi", asin: "B0BILD02", marke: "Freaky Joe", marketplace: "de", facts: {} });

    // Base-Snapshot: „480 mg Koffein" steht NUR im ausgelesenen Bild-Text (bilderText).
    await db.insert(schema.listingSnapshots).values({
      id: crypto.randomUUID(),
      productId: "b-base",
      source: "manual",
      bilderText: [{ slot: 1, textImBild: ["480 mg Koffein pro Dose"], inhalt: "Nährwert-Grafik auf der Dose", claims: [] }],
    });

    const grp = await gruppiereZuFamilieKern(db, {
      brandId: "bb",
      parent: { modus: "container", name: "Fam" },
      theme: ["flavor"],
      children: [
        { productId: "b-base", axisValues: { flavor: "Erdbeere" } },
        { productId: "b-kiwi", axisValues: { flavor: "Kiwi" } },
      ],
    });
    expect(grp.ok).toBe(true);
    if (!grp.ok) return;

    // Locked-Bullet + Beschreibung tragen die Bild-Zahl → wortgleich nach Kiwi kopiert.
    const bullets = [
      "STARKER KICK: Enthält 480 mg Koffein pro Dose für lange Wachheit.",
      "REIN PFLANZLICH: Zuckerfrei und vegan ohne künstliche Zusätze im Pulver.",
      "IDEAL UNTERWEGS: Passt in jede Sporttasche und jeden Rucksack bequem.",
      "SCHNELL FERTIG: Einfach mit stillem Wasser anrühren und sofort genießen.",
      "MADE IN GERMANY: Nach streng geprüften Qualitätsstandards produziert.",
    ];
    const mk = (type: "title" | "bullets" | "description", payload: Record<string, unknown>) =>
      db.insert(schema.contentVersions).values({ id: crypto.randomUUID(), productId: "b-base", type, version: 1, payload, status: "approved" });
    await mk("title", { text: "Freaky Joe Energy Pulver Erdbeere zuckerfrei vegan mit Koffein zum Anmischen" });
    await mk("bullets", { items: bullets });
    await mk("description", { text: "Enthält 480 mg Koffein pro Dose und ist mit Wasser schnell angerührt." });

    const entwurf = await baueMasterEntwurfKern(db, grp.parentId, "b-base", keinRegenerate);
    expect(entwurf.ok).toBe(true);
    if (!entwurf.ok) return;
    await gibMasterFreiKern(db, grp.parentId, entwurf.master);

    const prop = await propagiereFamilieKern(db, grp.parentId, regeneratorVerboten);
    expect(prop.ok).toBe(true);
    const kiwi = prop.kinder.find((k) => k.productId === "b-kiwi")!;

    // Die Bild-Zahl (480) darf NICHT als „ohne Quelle" anschlagen — ihre einzige Quelle ist der Bild-Text.
    const zahlMeldungen = kiwi.issues.filter((i) => i.rule.includes("zahl")).map((i) => i.message).join(" | ");
    expect(zahlMeldungen).not.toContain("480");
  });
});
