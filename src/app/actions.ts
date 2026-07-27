"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { generateSection, QmBlockFehler, type ListingSection, type RecipeInputs } from "@/lib/recipes/listing";
import type { ContentSprache, Marketplace, ProductFacts } from "@/db/schema";
import { amazonDomain, erkenneSprache, marktplatzFuerSprache, marktplatzSprache, SPRACH_NAMEN } from "@/lib/text/sprache";
import { contentMarkenKontext } from "@/lib/text/marken";

const id = () => crypto.randomUUID();
const slugify = (s: string) =>
  s.toLowerCase().replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function createClient(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = await getDb();
  const clientId = id();
  const brandId = id();
  await db.insert(schema.clients).values({ id: clientId, name, slug: slugify(name) || clientId.slice(0, 8) });
  // Default-Marke = Kundenname (vereinfachter v0-Flow; mehrere Marken jederzeit möglich)
  await db.insert(schema.brands).values({ id: brandId, clientId, name });
  redirect(`/marke/${brandId}`);
}

/**
 * Listing Optimizer (D68): Einzelauftrag OHNE Kundenmarke — läuft in einem
 * automatisch angelegten Werkbank-Container (kind=workbench), der nie im
 * Portfolio als Marke auftaucht. Volle Produkt-Werkbank inklusive.
 */
export async function createOptimizerOrder(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const asin = String(formData.get("asin") ?? "").trim().toUpperCase();
  const marke = String(formData.get("brandName") ?? "").trim();
  // Pflichtfelder (D159): ASIN und Marke sind erforderlich
  if (!name || !asin || !marke) return;
  const MARKETPLACES: Marketplace[] = ["de", "uk", "us", "fr", "it", "es", "nl"];
  const SPRACHEN: ContentSprache[] = ["de", "en", "fr", "it", "es"];
  const mpRoh = String(formData.get("marketplace") ?? "de") as Marketplace;
  const marketplace = MARKETPLACES.includes(mpRoh) ? mpRoh : "de";
  const sprRoh = String(formData.get("contentSprache") ?? "") as ContentSprache;
  const contentSprache = SPRACHEN.includes(sprRoh) ? sprRoh : (marktplatzSprache(marketplace) ?? "de");
  const db = await getDb();

  let workbench = await db.query.brands.findFirst({ where: eq(schema.brands.kind, "workbench") });
  if (!workbench) {
    const clientId = id();
    await db.insert(schema.clients).values({ id: clientId, name: "Intern (Einzelaufträge)", slug: "intern-optimizer" });
    const brandId = id();
    await db.insert(schema.brands).values({ id: brandId, clientId, name: "Listing Optimizer", kind: "workbench" });
    workbench = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  }
  const productId = id();
  await db.insert(schema.products).values({
    id: productId,
    brandId: workbench!.id,
    name,
    marke,
    asin,
    marketplace,
    contentSprache,
  });
  redirect(`/produkte/${productId}`);
}

export async function createProduct(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const asin = String(formData.get("asin") ?? "").trim().toUpperCase();
  const marke = String(formData.get("marke") ?? "").trim();
  // Pflichtfelder (D159): ASIN und Marke sind erforderlich
  if (!brandId || !name || !asin || !marke) return;
  // Marktplatz beim Anlegen wählbar (D128): Import & Scrapes laufen dann
  // automatisch gegen amazon.<Ziel-Domain> — die ASIN allein verrät ihn nicht.
  const MARKETPLACES: Marketplace[] = ["de", "uk", "us", "fr", "it", "es", "nl"];
  const mpRoh = String(formData.get("marketplace") ?? "de") as Marketplace;
  const marketplace = MARKETPLACES.includes(mpRoh) ? mpRoh : "de";
  const db = await getDb();
  const productId = id();
  const sprRoh = String(formData.get("contentSprache") ?? "") as ContentSprache;
  const SPRACHEN: ContentSprache[] = ["de", "en", "fr", "it", "es"];
  await db.insert(schema.products).values({
    id: productId,
    brandId,
    name,
    marke,
    asin,
    marketplace,
    contentSprache: SPRACHEN.includes(sprRoh) ? sprRoh : (marktplatzSprache(marketplace) ?? "de"),
  });
  redirect(`/produkte/${productId}`);
}

/**
 * Produkt löschen (D159): FK-Kaskaden räumen alle Kind-Daten ab (Keywords,
 * Scrapes, Insights, Versionen, Audits, Rankings, Snapshots). Bestätigung
 * passiert zweistufig in der UI (Aufklappen + Checkbox) — hier wird nur
 * noch ausgeführt.
 */
export async function deleteProductAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  await db.delete(schema.products).where(eq(schema.products.id, productId));
  revalidatePath("/optimizer");
  redirect(brand?.kind === "workbench" ? "/optimizer" : `/marke/${product.brandId}/katalog`);
}

/** Marktplatz & Content-Sprache je Produkt (D128) — Sprache unabhängig vom Marktplatz wählbar. */
/**
 * Marktplatz + Content-Sprache sind nach dem Anlegen FEST (D169, Nutzer-
 * Vorgabe 22.07.) — änderbar ist nur noch die Marke, und die speichert
 * automatisch beim Verlassen des Felds (kein Speichern-Knopf).
 */
export async function saveMarke(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const marke = String(formData.get("marke") ?? "").trim();
  if (!productId || !marke) return;
  const db = await getDb();
  await db.update(schema.products).set({ marke }).where(eq(schema.products.id, productId));
  revalidatePath(`/produkte/${productId}`);
}

export async function saveFacts(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const split = (k: string) =>
    String(formData.get(k) ?? "").split(/[|;\n]/).map((s) => s.trim()).filter(Boolean);
  const facts: ProductFacts = {
    productType: String(formData.get("productType") ?? "").trim() || undefined,
    materials: split("materials"),
    dimensions: String(formData.get("dimensions") ?? "").trim() || undefined,
    usps: split("usps"),
    targetAudience: String(formData.get("targetAudience") ?? "").trim() || undefined,
    certifications: split("certifications"),
  };
  const db = await getDb();
  await db.update(schema.products).set({ facts }).where(eq(schema.products.id, productId));
  revalidatePath(`/produkte/${productId}`);
}

export async function saveKeywords(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const raw = String(formData.get("keywords") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  await db.delete(schema.keywords).where(and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "manual")));

  // Relevanz-Check auch für Hand-Eingaben (D87) — nur die schnellen,
  // deterministischen Regeln (Maße/Anzahl); Marken-LLM läuft beim SOV-Import.
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  const { pruefeProduktAttribute } = await import("@/lib/keywords/relevanz");
  const ctx = {
    attributText: [product.facts.dimensions, snapshot?.title, product.name].filter(Boolean).join(" · "),
    produktName: product.name,
    eigeneMarke: null,
  };

  // v0-Tiering nach Reihenfolge: 1–3 primary, 4–13 secondary, 14–18 tertiary, Rest backend
  const rows = lines.map((line, i) => {
    const [kw, vol] = line.split(/[;\t]/).map((s) => s?.trim());
    const tier = i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend";
    const grund = kw ? pruefeProduktAttribute(kw, ctx) : null;
    return {
      id: id(),
      productId,
      keyword: kw,
      searchVolume: vol ? parseInt(vol.replace(/\D/g, ""), 10) || null : null,
      tier: tier as "primary" | "secondary" | "tertiary" | "backend",
      source: "manual",
      ausgeschlossen: grund !== null,
      ausschlussGrund: grund,
    };
  });
  if (rows.length) await db.insert(schema.keywords).values(rows);
  revalidatePath(`/produkte/${productId}`);
}

/**
 * Margen-Kalkulation je Produkt (reporting-main-Port): Prozente kommen als
 * ganze Zahlen (19 = 19 %), Maße nur wenn L+B+H ALLE gesetzt; Ergebnis wird
 * mitgespeichert und liefert den Break-even-ACoS für die Ampel.
 */
export async function saveMarginCalc(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(",", ".").trim();
    return v === "" ? undefined : parseFloat(v);
  };
  const purchasePrice = num("purchasePrice");
  const sellingPriceGross = num("sellingPriceGross");
  if (purchasePrice === undefined || sellingPriceGross === undefined) return;
  const l = num("dimL"), w = num("dimW"), h = num("dimH");

  const { computeMargin } = await import("@/lib/margin/calc");
  const inputs: import("@/lib/margin/calc").MarginInputs = {
    purchasePrice,
    sellingPriceGross,
    orderQty: num("orderQty") ?? 1,
    vatRate: (num("vatPct") ?? 19) / 100,
    category: String(formData.get("category") ?? "Alles andere"),
    customsRate: (num("customsPct") ?? 0) / 100,
    returnRate: (num("returnPct") ?? 0) / 100,
    disposalShare: (num("disposalPct") ?? 0) / 100,
    packagingCost: num("packagingCost"),
    qualityInspection: num("qualityInspection"),
    logisticsCost: num("logisticsCost"),
    variableCosts: num("variableCosts"),
    fbaShippingFee: num("fbaShippingFee"),
    dims: l !== undefined && w !== undefined && h !== undefined ? { l, w, h } : null,
    weightG: num("weightG") ?? null,
  };
  // Wirksame Gebühren-Tabellen (Rechenwerk-Override oder Workbook-Default)
  const { getFeeConfigState } = await import("@/lib/settings");
  const feeState = await getFeeConfigState();
  const results = computeMargin(inputs, feeState.config);
  const db = await getDb();
  await db.update(schema.products).set({ marginCalc: { inputs, results } }).where(eq(schema.products.id, productId));
  revalidatePath(`/produkte/${productId}`);
}

/**
 * Rechenwerk (D62): Gebühren-Update per PDF — Amazon liefert Änderungen als
 * PDF, keine öffentliche Tabellen-API. LLM extrahiert, deterministische
 * Validierung + Diff-Vorschau; wirksam wird erst die bestätigte Übernahme.
 */
export async function uploadFeePdf(formData: FormData) {
  const { getSessionUser } = await import("@/lib/auth/session");
  const user = await getSessionUser();
  if (!user) return;
  const file = formData.get("file") as File | null;
  if (!file) return;

  const { getFeeConfigState } = await import("@/lib/settings");
  const { extractFeeConfigFromPdf } = await import("@/lib/margin/feesFromPdf");
  const { config: current } = await getFeeConfigState();

  let pending: unknown;
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractFeeConfigFromPdf(base64, current);
    pending = {
      config: result.config,
      changes: result.changes,
      warnings: result.warnings,
      fileName: file.name,
      extractedBy: user.email,
      extractedAt: new Date().toISOString(),
    };
  } catch (e) {
    pending = {
      error: e instanceof Error ? e.message : String(e),
      fileName: file.name,
      extractedBy: user.email,
      extractedAt: new Date().toISOString(),
    };
  }
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key: "fee_config_pending", value: pending, updatedBy: user.email, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: pending, updatedBy: user.email, updatedAt: new Date() } });
  revalidatePath("/rechenwerk");
}

export async function applyPendingFeeConfig() {
  const { getSessionUser } = await import("@/lib/auth/session");
  const user = await getSessionUser();
  if (!user) return;
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, "fee_config_pending") });
  const pending = row?.value as { config?: import("@/lib/margin/fees").FeeConfig } | undefined;
  if (!pending?.config) return;
  const { saveFeeConfig } = await import("@/lib/settings");
  await saveFeeConfig(pending.config, user.email);
  await db.delete(schema.settings).where(eq(schema.settings.key, "fee_config_pending"));
  revalidatePath("/rechenwerk");
}

export async function discardPendingFeeConfig() {
  const db = await getDb();
  await db.delete(schema.settings).where(eq(schema.settings.key, "fee_config_pending"));
  revalidatePath("/rechenwerk");
}

/**
 * Demo & Zurücksetzen (D65). Wipe ist destruktiv: der Nutzer muss „LÖSCHEN"
 * eintippen (Server prüft) — Konten und Rechenwerk-Einstellungen bleiben.
 */
export async function wipeAllDataAction(formData: FormData) {
  const { getSessionUser } = await import("@/lib/auth/session");
  if (!(await getSessionUser())) return;
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "LÖSCHEN") {
    redirect(`/einstellungen?fehler=${encodeURIComponent("Zum Löschen bitte exakt LÖSCHEN eintippen.")}&code=SET-01`);
  }
  const db = await getDb();
  const { wipeAllBrandData } = await import("@/lib/demo/seed");
  await wipeAllBrandData(db);
  revalidatePath("/", "layout");
  redirect(`/einstellungen?ok=${encodeURIComponent("Alle Marken und Daten gelöscht — Konten und die Einstellungen unter Daten & Formeln blieben erhalten.")}`);
}

export async function seedDemoDataAction() {
  const { getSessionUser } = await import("@/lib/auth/session");
  if (!(await getSessionUser())) return;
  const db = await getDb();
  const { seedDemoBrand } = await import("@/lib/demo/seed");
  const { brandId } = await seedDemoBrand(db);
  revalidatePath("/", "layout");
  redirect(`/marke/${brandId}`);
}

export async function resetFeeConfigAction() {
  const { resetFeeConfig } = await import("@/lib/settings");
  await resetFeeConfig();
  revalidatePath("/rechenwerk");
}

/**
 * Account-Marge in % = Break-even-ACoS-Schwelle für die ACoS/TACoS-Ampel.
 * Hand-Eintrag hat Vorrang (reporting-main-Priorität); der volle
 * Margen-Rechner mit Gebühren-Tabellen liefert die Schwelle später je Produkt.
 */
export async function saveBrandMargin(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const raw = String(formData.get("marginPct") ?? "").replace(",", ".").trim();
  if (!brandId) return;
  const marginPct = raw === "" ? null : parseFloat(raw);
  if (marginPct !== null && (!Number.isFinite(marginPct) || marginPct < 0 || marginPct > 100)) return;
  const db = await getDb();
  await db.update(schema.brands).set({ marginPct }).where(eq(schema.brands.id, brandId));
  revalidatePath(`/marke/${brandId}`, "layout");
}

/**
 * Content-Freigabe: die neueste Version einer Sektion wird "approved" —
 * Flat File & Analyse bevorzugen ab dann Freigaben vor Entwürfen.
 * Freigabe nur ohne Gate-Fehler (Warnungen sind ok — Ausschöpfungs-Prinzip).
 */
export async function approveContent(formData: FormData) {
  const versionId = String(formData.get("versionId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!versionId) return;
  const db = await getDb();
  const version = await db.query.contentVersions.findFirst({ where: eq(schema.contentVersions.id, versionId) });
  if (!version) return;
  if (version.validation && !version.validation.passed) return;
  await db.update(schema.contentVersions).set({ status: "approved" }).where(eq(schema.contentVersions.id, versionId));

  // Geführte Kette (D195; Reihenfolge D204): Die Freigabe ist der Taktgeber —
  // direkt danach wird die NÄCHSTE Sektion generiert (Titel → Highlights →
  // Bullets → Backend → Beschreibung → Q&A). Kontext sind ausschließlich Freigaben; so entstehen
  // keine Wort-Dopplungen zwischen parallel gewürfelten Sektionen mehr.
  const sektionVonDbType: Record<string, ListingSection> = {
    title: "title", bullets: "bullets", item_highlights: "highlights",
    backend_keywords: "backend", description: "description", qa: "qa",
  };
  const aktuelle = sektionVonDbType[version.type];
  const naechste = SEKTIONS_REIHENFOLGE[SEKTIONS_REIHENFOLGE.indexOf(aktuelle) + 1];
  if (naechste) {
    const schonFreigegeben = await db.query.contentVersions.findFirst({
      where: and(
        eq(schema.contentVersions.productId, productId),
        eq(schema.contentVersions.type, naechste === "backend" ? "backend_keywords" : naechste === "highlights" ? "item_highlights" : naechste),
        eq(schema.contentVersions.status, "approved"),
      ),
    });
    if (!schonFreigegeben) {
      try {
        // ohneAnalyseBestaetigt=true: die Grundlagen-Entscheidung fiel beim
        // Start der Kette (Titel) — sie gilt für alle Folge-Sektionen.
        await generiereSektionKern(db, productId, naechste, true);
      } catch (e) {
        const code = e instanceof GenFehler ? e.code : "GEN-01";
        redirect(`/produkte/${productId}?fehler=${encodeURIComponent(e instanceof Error ? e.message : String(e))}&code=${code}`);
      }
    }
  }
  revalidatePath(`/produkte/${productId}`);
}

/**
 * Geführte Kette neu aufsetzen (D195): ALLE Freigaben dieses Produkts werden
 * zurückgezogen (Versionen bleiben als Historie erhalten) — die Kette startet
 * wieder beim Titel. Einzel-Regenerierung nach Abschluss gibt es bewusst
 * nicht: die Sektionen bauen aufeinander auf.
 */
export async function resetContentChain(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  const db = await getDb();
  await db
    .update(schema.contentVersions)
    .set({ status: "draft" })
    .where(and(eq(schema.contentVersions.productId, productId), eq(schema.contentVersions.status, "approved")));
  revalidatePath(`/produkte/${productId}`);
}

/** Keyword-Tiering aus dem SOV-Audit ableiten — ersetzt nur source="cerebro", manuelle bleiben. */
export async function deriveKeywordsFromSov(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;

  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, product.brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const sovUpload = uploads.find(
    (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === productId,
  );
  const audit = (sovUpload?.parsed as { audit?: import("@/lib/sov/audit").SovAudit })?.audit;
  if (!audit) return;

  const { deriveKeywordTiers } = await import("@/lib/sov/tiering");
  const { tiered } = deriveKeywordTiers(audit);
  try {
    await keywordBasisSchreiben(db, product, tiered.map((k) => ({
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      tier: k.tier as "primary" | "secondary" | "tertiary" | "backend",
    })));
  } catch (e) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`Keyword-Relevanz-Prüfung: ${e instanceof Error ? e.message : String(e)}`)}&code=KW-02`);
  }
  revalidatePath(`/produkte/${productId}`);
}

/** Relevanz-Entscheidung von Hand (D87): ausschließen oder wieder aufnehmen — überschreibt Auto-Läufe dauerhaft. */
export async function toggleKeywordRelevanz(formData: FormData) {
  const keywordId = String(formData.get("keywordId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const aktion = String(formData.get("aktion") ?? "");
  if (!keywordId || !productId) return;
  const db = await getDb();
  await db
    .update(schema.keywords)
    .set(
      aktion === "aufnehmen"
        ? { ausgeschlossen: false, ausschlussGrund: "manuell wieder aufgenommen" }
        : { ausgeschlossen: true, ausschlussGrund: "manuell ausgeschlossen" },
    )
    .where(eq(schema.keywords.id, keywordId));
  revalidatePath(`/produkte/${productId}`);
}

/** Optionale Produktbeschreibung speichern (D108/D219) — fließt in jede Text-Generierung UND (als Fallback) in die Beschreibungs-Dimension des Tiefen-Audits ein. */
export async function saveZusatzKontext(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  const db = await getDb();
  await db
    .update(schema.products)
    .set({ zusatzKontext: String(formData.get("zusatzKontext") ?? "").trim() || null })
    .where(eq(schema.products.id, productId));
  revalidatePath(`/produkte/${productId}`);
}

/**
 * Fremdmarken, die der Keyword-Relevanz-Filter bereits erkannt hat (D87:
 * ausschlussGrund „Marke: XY") — als Blacklist für Prompt UND Validation-Gate
 * (D97). Die eigene Marke („eigene Marke: …") gehört NICHT auf die Blacklist.
 */
function fremdmarkenAusKeywords(kws: Array<{ ausschlussGrund: string | null }>): string[] {
  return [
    ...new Set(
      kws
        .map((k) => k.ausschlussGrund ?? "")
        .filter((g) => g.startsWith("Marke: "))
        .map((g) => g.slice("Marke: ".length).trim())
        .filter(Boolean),
    ),
  ];
}

// Marken-Kontext für Content (D149): siehe src/lib/text/marken.ts

/**
 * Keywords in Tiering-Reihenfolge (D97): sortiert nach demselben Score wie
 * die Tier-Vergabe (SV × Cluster-Relevanzgewicht, src/lib/sov/tiering.ts) —
 * nicht nach zufälliger DB-Reihenfolge. So ist primary[0] wirklich das
 * Hauptkeyword, das Titel-Prompt und -Gate verlangen.
 */
async function nachTieringScore<K extends { keyword: string; searchVolume: number | null }>(kws: K[]): Promise<K[]> {
  const { clusterKeyword, relevanceWeight } = await import("@/lib/sov/audit");
  const score = (k: K) => (k.searchVolume ?? 0) * relevanceWeight(clusterKeyword(k.keyword));
  return [...kws].sort((a, b) => score(b) - score(a));
}

/** Generierungs-Fehler mit Fehlercode — der Kern wirft, die Actions leiten um. */
class GenFehler extends Error {
  constructor(msg: string, public code: string) {
    super(msg);
  }
}

export async function generateContent(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const section = String(formData.get("section") ?? "") as ListingSection;
  const db = await getDb();
  try {
    await generiereSektionKern(db, productId, section, String(formData.get("ohneAnalyseBestaetigt") ?? "") === "on");
  } catch (e) {
    const code = e instanceof GenFehler ? e.code : "GEN-01";
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(e instanceof Error ? e.message : String(e))}&code=${code}`);
  }
  revalidatePath(`/produkte/${productId}`);
}

/** Ketten-Reihenfolge (D195; Backend vor Beschreibung ab D204): Titel → Highlights → Bullets → Backend → Beschreibung → Q&A — Freigaben fließen als Kontext in jede Folge-Sektion. */
const SEKTIONS_REIHENFOLGE: ListingSection[] = ["title", "highlights", "bullets", "backend", "description", "qa"];
const SEKTIONS_LABEL: Record<string, string> = {
  title: "Titel", bullets: "Bullet Points", highlights: "Item Highlights",
  backend: "Backend-Keywords", description: "Beschreibung", qa: "Q&A",
};


async function generiereSektionKern(
  db: Awaited<ReturnType<typeof getDb>>,
  productId: string,
  section: ListingSection,
  ohneAnalyseBestaetigt: boolean,
) {
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  // Nur relevante Keywords fließen in die Generierung (D87) — in Tiering-Reihenfolge (D97)
  const alleKws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
  const kws = await nachTieringScore(alleKws.filter((k) => !k.ausgeschlossen));
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });

  // Content-Gate (D108, Nutzer-Vorgabe): Die Bewertungs-Analyse ist die
  // Grundlage des Contents (Kundensprache, Pain Points, Kaufauslöser).
  // OHNE Analyse ist die Generierung gesperrt — es sei denn, sie wurde
  // ausdrücklich doppelt bestätigt UND es gibt eine Ersatz-Grundlage
  // (Listing-IST oder Zusatz-Infos vom Team).
  if (!insights) {
    if (!ohneAnalyseBestaetigt) {
      throw new GenFehler("Content ist gesperrt: Es liegt keine Bewertungs-Analyse vor — sie liefert Kundensprache, Pain Points und Kaufauslöser als Text-Grundlage. Erst analysieren oder bewusst ohne Analyse bestätigen.", "GEN-02");
    }
    const hatGrundlage = Boolean(snapshot?.title || snapshot?.bullets?.length || product.zusatzKontext?.trim());
    if (!hatGrundlage) {
      throw new GenFehler("Ohne Bewertungs-Analyse braucht die Generierung eine Ersatz-Grundlage: Listing importieren oder die optionale Produktbeschreibung eintragen — sonst gäbe es nur erfundenen Text.", "GEN-03");
    }
  }

  // Sprach-Gate 1 (D128): Die Keyword-Basis muss zur Content-Sprache passen —
  // lokalisieren statt übersetzen. Geblockt wird NUR bei sicherem Widerspruch
  // (Heuristik über die GESAMTE Liste); bei Unsicherheit ehrlich passiv.
  if (kws.length > 0) {
    const erkannt = erkenneSprache(kws.map((k) => k.keyword)).sprache;
    if (erkannt && erkannt !== product.contentSprache) {
      throw new GenFehler(`Die Keyword-Basis ist erkennbar ${SPRACH_NAMEN[erkannt]}, die Content-Sprache dieses Produkts ist aber ${SPRACH_NAMEN[product.contentSprache]}. Lokalisierter Content braucht eine Keyword-Analyse vom Ziel-Marktplatz.`, "GEN-04");
    }
  }

  const byTier = (t: string) => kws.filter((k) => k.tier === t).map((k) => k.keyword);

  // Freigegebene/neueste Sektionen als Kontext (temoa-os-Ablauf)
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, productId),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const freigegeben = (t: string) => versions.find((v) => v.type === t && v.status === "approved")?.payload as Record<string, unknown> | undefined;

  // Geführte Kette (D195, Nutzer 23.07.): Die Sektionen bauen aufeinander auf
  // (Wort-Dopplung Titel↔Highlights entsteht, wenn parallel statt sequenziell
  // generiert wird). Eine Sektion wird erst generiert, wenn ALLE Vorgänger
  // FREIGEGEBEN sind — die Freigabe ist der Taktgeber der Kette.
  const dbTypeFuer = (s: ListingSection) => (s === "backend" ? "backend_keywords" : s === "highlights" ? "item_highlights" : s);
  for (const vorgaenger of SEKTIONS_REIHENFOLGE.slice(0, SEKTIONS_REIHENFOLGE.indexOf(section))) {
    if (!versions.some((v) => v.type === dbTypeFuer(vorgaenger) && v.status === "approved"))
      throw new GenFehler(
        `Die Texte bauen aufeinander auf (geführte Kette): Erst „${SEKTIONS_LABEL[vorgaenger]}" freigeben — danach wird ${SEKTIONS_LABEL[section] ?? section} automatisch generiert.`,
        "GEN-05",
      );
  }

  // Marken-Kontext (D149/D159): Produkt-Marke (Pflichtfeld) schlägt alles;
  // Werkbank-Name nie als Marke, Eigenmarke nie auf der Blacklist
  const mk = contentMarkenKontext(brand ?? undefined, snapshot?.title, fremdmarkenAusKeywords(alleKws), product.marke);

  const inputs: RecipeInputs = {
    brand: mk.marke,
    eigenmarkeAusListing: mk.eigenmarkeAusListing,
    productName: product.name,
    marketplace: product.marketplace,
    facts: product.facts,
    keywords: {
      primary: byTier("primary"),
      secondary: byTier("secondary"),
      tertiary: byTier("tertiary"),
      backendPool: byTier("backend"),
    },
    reviewInsights: insights?.payload ?? null,
    voiceTone: brand?.voiceTone,
    // Kontext NUR aus FREIGEGEBENEN Sektionen (D195): die Kette garantiert,
    // dass alle Vorgänger freigegeben sind — Entwürfe sind kein verlässlicher
    // Dedup-Kontext (Wort-Dopplung Titel↔Highlights, Nutzer-Befund 23.07.).
    approved: {
      title: freigegeben("title")?.text as string | undefined,
      bullets: freigegeben("bullets")?.items as string[] | undefined,
      highlights: freigegeben("item_highlights")?.text as string | undefined,
      description: freigegeben("description")?.text as string | undefined,
    },
    competitorBrands: mk.fremdmarken,
    listingIst: snapshot ? { title: snapshot.title, bullets: snapshot.bullets } : null,
    zusatzKontext: product.zusatzKontext,
    sprache: product.contentSprache,
    // Conversion-Blocker in die Content-Prompts (D194, Nutzer 23.07.):
    // unbeantwortete Kunden-Themen sind Pflicht-Input der Text-Erstellung.
    conversionBlocker: await (async () => {
      const blocker = await db.query.conversionBlockers.findFirst({
        where: eq(schema.conversionBlockers.productId, productId),
        orderBy: desc(schema.conversionBlockers.createdAt),
      });
      return blocker?.payload.cards.map((c) => ({ titel: c.titel, beschreibung: c.beschreibung })) ?? null;
    })(),
    // Feature-Ranking (D205): die belegten Listing-Features nach Kunden-Relevanz
    // fließen in die Text-Generierung — bisher nur in der UI, jetzt Content-Input.
    featureRanking: await (async () => {
      const fr = await db.query.featureRankings.findFirst({
        where: eq(schema.featureRankings.productId, productId),
        orderBy: desc(schema.featureRankings.createdAt),
      });
      return (
        fr?.payload.cards.map((c) => ({
          titel: c.titel,
          beschreibung: c.beschreibung,
          relevanz: c.relevanz,
          kundenEcho: c.belegAspekte.length > 0,
        })) ?? null
      );
    })(),
    // Übertragbare Wettbewerber-Informationen (D199): nur ja/unbekannt (nein
    // wurde im Analyse-Modul bereits verworfen) fließen als Kandidaten ein.
    wettbewerbsInfos: await (async () => {
      const gaps = await db.query.competitorInfoGaps.findFirst({
        where: eq(schema.competitorInfoGaps.productId, productId),
        orderBy: desc(schema.competitorInfoGaps.createdAt),
      });
      return (
        gaps?.payload.gaps
          .filter((g) => g.urteil === "ja" || g.urteil === "unbekannt")
          .map((g) => ({ info: g.info, urteil: g.urteil as "ja" | "unbekannt", grund: g.grund })) ?? null
      );
    })(),
  };

  // Fehler (API, Zeitbudget, kaputtes JSON) als Banner, nie als Fehlerseite (D81).
  // QM-Block (D182): Nach allen Korrektur-Schleifen blieben Regelverstöße —
  // es wird KEIN Entwurf gespeichert oder angezeigt, der Banner trägt den
  // Prüfbericht. Jeder Block ist ein Bau-Auftrag (Log in generateSection).
  let result: Awaited<ReturnType<typeof generateSection>>;
  try {
    result = await generateSection(section, inputs);
  } catch (e) {
    if (e instanceof QmBlockFehler) {
      // QM-Block-Log (D182/D193): jeder Block ist ein Bau-Auftrag — persistent
      // gespeichert und unter „Daten & Formeln" ausgewertet (welche Regel
      // scheitert wie oft?). Log-Fehler dürfen den eigentlichen Befund nie verdecken.
      try {
        await db.insert(schema.qmBlocks).values({
          id: id(), productId, bereich: `listing.${section}`, findings: e.issues, versuche: e.versuche,
        });
      } catch (logFehler) {
        console.error("[QM-BLOCK-LOG] Speichern fehlgeschlagen", logFehler);
      }
      // Graceful Degradation (D202, Nutzer 24.07.: „das darf nicht mehr auftreten"):
      // Statt einer leeren Wand wird der beste Entwurf gespeichert und ANGEZEIGT —
      // aber als „Entwurf mit offenen Punkten" (validation.passed=false unten →
      // die UI zeigt die roten Verstöße und bietet KEINE Freigabe an, D182-Geist:
      // nichts wird fälschlich als sauber ausgegeben). Kam kein Entwurf zustande
      // (nur kaputtes JSON/Schema), bleibt der harte QM-01-Block.
      if (e.bestesErgebnis) {
        result = e.bestesErgebnis;
      } else {
        const kopf = e.issues.slice(0, 6).map((i) => `[${i.rule}] ${i.message}`).join(" · ");
        const rest = e.issues.length > 6 ? ` … +${e.issues.length - 6} weitere Verstöße.` : "";
        throw new GenFehler(
          `QM-Gate (${SEKTIONS_LABEL[section] ?? section}): nach ${e.versuche} Versuch(en) kein anzeigbarer Entwurf entstanden. Verstöße: ${kopf}${rest} Vollständiges Protokoll: QM-Log unter „Daten & Formeln".`,
          "QM-01",
        );
      }
    } else {
      throw new GenFehler(`Text-Generierung (${SEKTIONS_LABEL[section] ?? section}): ${e instanceof Error ? e.message : String(e)}`, "GEN-01");
    }
  }

  const dbType = section === "backend" ? "backend_keywords" : section === "highlights" ? "item_highlights" : section;
  const prev = versions.filter((v) => v.type === dbType);
  await db.insert(schema.contentVersions).values({
    id: id(),
    productId,
    type: dbType as "title" | "bullets" | "item_highlights" | "description" | "backend_keywords" | "qa",
    version: (prev[0]?.version ?? 0) + 1,
    payload: result!.payload,
    status: "draft",
    validation: {
      passed: !result!.issues.some((i) => i.severity === "error"),
      issues: result!.issues,
      checkedAt: new Date().toISOString(),
    },
    generatedBy: `${result!.provider}:${result!.model}`,
  });
  revalidatePath(`/produkte/${productId}`);
}

// ── Keyword-Basis: Cerebro-Export → Keywords IMMER, SOV wenn Wettbewerber ────

type KeywordKandidat = { keyword: string; searchVolume: number | null; tier: "primary" | "secondary" | "tertiary" | "backend" };

/**
 * Gemeinsamer Schreibweg der Keyword-Basis (D87/D89): Relevanz-Filter,
 * manuelle Entscheidungen überleben, Ausschlüsse gekennzeichnet statt gelöscht.
 */
async function keywordBasisSchreiben(
  db: Awaited<ReturnType<typeof getDb>>,
  product: { id: string; name: string; brandId: string; facts: ProductFacts },
  kandidatenListe: KeywordKandidat[],
) {
  const existing = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, product.id) });
  const manual = new Set(existing.filter((k) => k.source === "manual").map((k) => k.keyword.toLowerCase().trim()));
  const manuelleUrteile = new Map(
    existing
      .filter((k) => k.ausschlussGrund?.startsWith("manuell"))
      .map((k) => [k.keyword.toLowerCase().trim(), { ausgeschlossen: k.ausgeschlossen, grund: k.ausschlussGrund! }]),
  );

  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, product.id),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  const { pruefeRelevanz } = await import("@/lib/keywords/relevanz");
  const kandidaten = kandidatenListe.filter((k) => !manual.has(k.keyword.toLowerCase().trim()));
  const res = await pruefeRelevanz(kandidaten.map((k) => k.keyword), {
    attributText: [product.facts.dimensions, snapshot?.title, product.name].filter(Boolean).join(" · "),
    produktName: product.name,
    eigeneMarke: brand?.kind === "workbench" ? null : brand?.name ?? null,
  });
  const urteile = new Map(res.map((u) => [u.keyword.toLowerCase(), u.grund]));

  await db.delete(schema.keywords).where(and(eq(schema.keywords.productId, product.id), eq(schema.keywords.source, "cerebro")));
  const rows = kandidaten.map((k) => {
    const key = k.keyword.toLowerCase().trim();
    const manuell = manuelleUrteile.get(key);
    const autoGrund = urteile.get(key) ?? null;
    return {
      id: id(),
      productId: product.id,
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      tier: k.tier,
      source: "cerebro",
      ausgeschlossen: manuell ? manuell.ausgeschlossen : autoGrund !== null,
      ausschlussGrund: manuell ? manuell.grund : autoGrund,
    };
  });

  // Tiers NACH dem Relevanz-Filter vergeben (D91): Aussortierte (z. B.
  // Marken-Keywords mit Top-Suchvolumen) verbrauchen keine primary-Plätze —
  // sonst rutscht das Kopf-Keyword („krabbelmatte") fälschlich in secondary.
  const tierAt = (i: number) =>
    (i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend") as KeywordKandidat["tier"];
  let aktivIdx = 0;
  for (const r of rows) {
    if (!r.ausgeschlossen) r.tier = tierAt(aktivIdx++);
  }

  if (rows.length) await db.insert(schema.keywords).values(rows);
  return rows.filter((r) => r.ausgeschlossen).length;
}

/** Tiering ohne SOV-Audit: nach Suchvolumen — 1–3 primary, 4–13 secondary, 14–18 tertiary, Rest backend (v0-Konvention). */
function svTiering(list: Array<{ keyword: string; sv: number }>): KeywordKandidat[] {
  return [...list]
    .sort((a, b) => b.sv - a.sv)
    .map((k, i) => ({
      keyword: k.keyword,
      searchVolume: k.sv || null,
      tier: (i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend") as KeywordKandidat["tier"],
    }));
}

/**
 * EIN Upload für alles (D89, Nutzer-Vorgabe „Ordnung reinbringen"):
 * Der Helium-10-Cerebro-Export der zu optimierenden ASIN ist DIE Keyword-Quelle.
 * → Keyword-Basis entsteht IMMER (inkl. Relevanz-Filter D87, ohne Zweitklick).
 * → SOV-Audit entsteht ZUSÄTZLICH, wenn der Export Wettbewerber-ASIN-Spalten hat.
 * Kein separater SOV-Upload, nichts Doppeltes.
 */
export async function uploadCerebro(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file") as File | null;
  const formPreis = parseFloat(String(formData.get("price") ?? "").replace(",", ".")) || undefined;
  if (!productId || !file) return;

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  // Preis fürs SOV-Audit (D165): Eingabe beim Upload gewinnt und wird am
  // Produkt gespeichert; sonst der gepflegte Produkt-Preis. OHNE Preis rechnet
  // das Audit KEINE €-Werte (kein Default).
  const price = formPreis ?? (product.price !== null ? product.price / 100 : undefined);
  if (formPreis) {
    await db.update(schema.products).set({ price: Math.round(formPreis * 100) }).where(eq(schema.products.id, productId));
  }

  const { parseCerebroCsv, computeSovAudit } = await import("@/lib/sov/audit");
  let parseStatus = "ok", parseError: string | null = null, audit = null;
  let keywordCount = 0, aussortiert = 0, hasCompetitors = false, uebernommen = 0;
  try {
    // keepUnranked: für die Keyword-Basis zählen auch Keywords OHNE Ranking
    // und OHNE Suchvolumen (SV 0 = Helium 10 kennt keins, D92)
    const alleRows = parseCerebroCsv(await file.text(), product.asin, { keepUnranked: true });
    if (alleRows.length === 0) throw new Error("Keine Keyword-Zeilen gefunden — ist das der Cerebro-Export?");
    hasCompetitors = alleRows.some((r) => Object.keys(r.compRanks).length > 0);

    // Zusammenführung statt Ersetzen (D93, Nutzer-Vorgabe): eine bestehende
    // Basis geht durch einen weiteren Upload NIE verloren. Keywords aus
    // früheren Uploads, die in der NEUEN Datei fehlen, bleiben Teil der Basis
    // (mit ihrem gespeicherten Suchvolumen). Identische Keywords doppeln sich
    // nicht — die neue Datei gewinnt (frischere Daten). Löschen ist eine
    // eigene, bewusste Aktion (deleteKeywordBasis).
    const bestehend = await db.query.keywords.findMany({
      where: and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "cerebro")),
    });
    const imFile = new Set(alleRows.map((r) => r.keyword.toLowerCase().trim()));
    const uebernahme = bestehend
      .filter((k) => !imFile.has(k.keyword.toLowerCase().trim()))
      .map((k) => ({ keyword: k.keyword, sv: k.searchVolume ?? 0 }));
    uebernommen = uebernahme.length;

    // Das SOV-Audit ist Volumen-gewichtet und braucht Ränge — nur diese
    // Teilmenge fließt hinein. ALLE anderen Zeilen bleiben Teil der Basis.
    const fuerSov = (r: (typeof alleRows)[number]) =>
      r.sv > 0 && (r.mainRank > 0 || Object.values(r.compRanks).some((x) => x > 0));

    if (hasCompetitors) {
      audit = computeSovAudit(alleRows.filter(fuerSov), { price, mainAsin: product.asin });
    }

    // Keyword-Basis IMMER — mit Audit über das SOV-Tiering, sonst nach Suchvolumen.
    // Zeilen, die das Audit ausklammert (kein Rang oder kein SV), fließen als
    // `extra` mit ein (D91/D92) — Score 0 sortiert sie ehrlich ans Ende (Backend).
    let kandidaten: KeywordKandidat[];
    if (audit) {
      const unranked = [
        ...alleRows.filter((r) => !fuerSov(r)).map((r) => ({ keyword: r.keyword, sv: r.sv })),
        ...uebernahme,
      ];
      const { deriveKeywordTiers } = await import("@/lib/sov/tiering");
      kandidaten = deriveKeywordTiers(audit, unranked).tiered.map((k) => ({
        keyword: k.keyword,
        searchVolume: k.searchVolume,
        tier: k.tier as KeywordKandidat["tier"],
      }));
    } else {
      const gesehen = new Set<string>();
      const einmalig = alleRows.filter((r) => {
        const key = r.keyword.toLowerCase();
        if (gesehen.has(key)) return false;
        gesehen.add(key);
        return true;
      });
      kandidaten = svTiering([...einmalig.map((r) => ({ keyword: r.keyword, sv: r.sv })), ...uebernahme]);
    }
    keywordCount = kandidaten.length;
    aussortiert = await keywordBasisSchreiben(db, product, kandidaten);
  } catch (e) {
    parseStatus = "error";
    parseError = e instanceof Error ? e.message : String(e);
  }

  await db.insert(schema.reportUploads).values({
    id: id(),
    brandId: product.brandId,
    marketplace: product.marketplace,
    reportType: "cerebro",
    fileName: file.name,
    parsed: parseStatus === "ok" ? { productId, audit, hasCompetitors, keywordCount } : null,
    parseStatus,
    parseError,
  });
  revalidatePath(`/produkte/${productId}`);
  if (parseStatus === "error") {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`Keyword-Export: ${parseError}`)}&code=KW-01`);
  }
  const sovInfo = hasCompetitors
    ? "SOV-Audit erstellt (Sichtbarkeit & Analyse)."
    : "Kein SOV-Audit — der Export enthält keine Wettbewerber-ASIN-Spalten (für SOV in Cerebro Wettbewerber mitexportieren).";
  const mergeInfo = uebernommen > 0 ? ` Zusammengeführt: ${uebernommen} Keywords aus früheren Uploads übernommen, Duplikate nur einmal.` : "";
  redirect(`/produkte/${productId}?hinweis=${encodeURIComponent(`Keyword-Basis ${uebernommen > 0 ? "zusammengeführt" : "erstellt"}: ${keywordCount} Keywords, davon ${aussortiert} als irrelevant aussortiert (unten prüfbar).${mergeInfo} ${sovInfo}`)}`);
}

/**
 * Keyword-Basis löschen (D94, Nutzer-Vorgabe): das bewusste Gegenstück zur
 * Zusammenführung (D93). Entfernt alle Upload-Keywords des Produkts UND die
 * zugehörigen Cerebro-Uploads (inkl. SOV-Audit — es stammt aus derselben
 * Datei, ein Geister-Audit ohne Basis wäre unehrlich). Manuelle Keywords
 * bleiben erhalten. Alles per neuem Upload wiederherstellbar.
 */
export async function deleteKeywordBasis(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;

  const zuLoeschen = await db.query.keywords.findMany({
    where: and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "cerebro")),
  });
  await db.delete(schema.keywords).where(and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "cerebro")));

  const uploads = await db.query.reportUploads.findMany({
    where: and(eq(schema.reportUploads.brandId, product.brandId), eq(schema.reportUploads.reportType, "cerebro")),
  });
  const eigene = uploads.filter((u) => (u.parsed as { productId?: string } | null)?.productId === productId);
  for (const u of eigene) {
    await db.delete(schema.reportUploads).where(eq(schema.reportUploads.id, u.id));
  }

  revalidatePath(`/produkte/${productId}`);
  redirect(`/produkte/${productId}?hinweis=${encodeURIComponent(`Keyword-Basis gelöscht: ${zuLoeschen.length} Keywords und ${eigene.length} Upload(s) inkl. SOV-Audit entfernt. Manuelle Keywords bleiben. Neuer Upload startet eine frische Basis.`)}`);
}

// ── Review-Insights via Apify (Neubau der defekten temoa-os-Variante) ────────

/**
 * Bewertungs-Analyse in ZWEI bewussten Schritten (D71):
 * 1. Scrape — Reviews der eigenen ASIN (+ optionale Wettbewerber) holen und
 *    mit sichtbarer Datenbasis speichern (Reviews je Sterne-Zahl, je ASIN).
 * 2. Analyse — KI wertet den gespeicherten Scrape aus (Pain Points,
 *    Kaufauslöser, O-Töne) → eigenes Findings-Dashboard.
 */
/**
 * Verdichtungs-Etappe (D131/D136): läuft als EIGENER Schritt nach der
 * Roh-Analyse — Zwischenstand (Scrape + Roh-Themen) bleibt bei einem Abbruch
 * unversehrt gespeichert und die Etappe ist einzeln nachholbar (D129-Muster).
 * Quellen-Tags (D133) und Beleg-Text (D134) setzt diese Funktion
 * deterministisch aus dem, was tatsächlich eingeflossen ist.
 */
async function fuehreVerdichtungAus(db: Awaited<ReturnType<typeof getDb>>, productId: string): Promise<void> {
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) throw new Error("Produkt nicht gefunden.");
  const insight = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (!insight) throw new Error("Keine Roh-Analyse vorhanden — erst scrapen und analysieren.");

  const { normalisierePayload } = await import("@/lib/reviews/insights");
  const payload = normalisierePayload(insight.payload);

  const scrape = insight.scrapeId
    ? await db.query.reviewScrapes.findFirst({ where: eq(schema.reviewScrapes.id, insight.scrapeId) })
    : await db.query.reviewScrapes.findFirst({
        where: eq(schema.reviewScrapes.productId, productId),
        orderBy: desc(schema.reviewScrapes.createdAt),
      });

  // Quellen-Tags (D133): vom Code aus der echten Datenbasis, nie von der KI
  const norm = (a: string) => a.trim().toUpperCase();
  const asins = (scrape?.asins ?? []).map(norm);
  const eigene = product.asin && asins.includes(norm(product.asin));
  const wettbewerber = asins.filter((a) => !product.asin || a !== norm(product.asin)).length;
  const quellen = [
    eigene ? `Reviews: eigenes Produkt (${product.asin})` : null,
    wettbewerber > 0 ? `Reviews: ${wettbewerber} Wettbewerber-ASIN${wettbewerber === 1 ? "" : "s"}` : null,
  ].filter((q): q is string => q !== null);
  if (quellen.length === 0) quellen.push(`Reviews (Datenbasis: ${insight.dataBasis})`);

  // Beleg-Text für den Bild-Ideen-Wahrheitsfilter (D134): Produkt-Wahrheit +
  // Listing-IST inkl. der erweiterten Quellen (D145)
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  const f = product.facts;
  const belegText = [
    f.productType, f.dimensions, ...(f.materials ?? []), ...(f.usps ?? []), f.targetAudience,
    ...(f.certifications ?? []), ...Object.entries(f.specs ?? {}).map(([k, v]) => `${k}: ${v}`),
    product.zusatzKontext,
    snapshot?.title, ...(snapshot?.bullets ?? []), snapshot?.description,
    ...(snapshot?.attributes ? Object.entries(snapshot.attributes).map(([k, v]) => `${k}: ${v}`) : []),
    snapshot?.importantInfo, snapshot?.aplusContent,
    (await import("@/lib/analysis/bildAuslese")).bilderAlsText(snapshot?.bilderText),
  ].filter(Boolean).join("\n");

  const { verdichteInsights } = await import("@/lib/reviews/verdichtung");
  const res = await verdichteInsights(payload, { quellen, sprache: product.contentSprache, belegText });
  await db
    .update(schema.reviewInsights)
    .set({
      payload: {
        ...payload,
        insightCards: res.cards,
        kernThese: res.kernThese,
        verworfeneKarten: res.verworfen,
        entfernteBildIdeen: res.entfernteBildIdeen,
        // Signifikanz-Gate (D170): Übergangenes ausweisen, nie still
        qualitaetsNotizen: [...(payload.qualitaetsNotizen ?? []), ...res.hinweise],
      },
    })
    .where(eq(schema.reviewInsights.id, insight.id));
}

export async function verdichteInsightsAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const insight = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (!insight) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent("Verdichtung braucht die Roh-Analyse — erst Reviews scrapen und analysieren.")}&code=REV-05&tab=analyse#reviews`);
  }
  const { normalisierePayload } = await import("@/lib/reviews/insights");
  if ((normalisierePayload(insight!.payload).insightCards?.length ?? 0) > 0) {
    redirect(`/produkte/${productId}?tab=analyse&hinweis=${encodeURIComponent("Diese Analyse ist bereits verdichtet — neue Karten entstehen erst mit einer neuen Analyse (Redundanz-Guard).")}`);
  }
  try {
    await fuehreVerdichtungAus(db, productId);
  } catch (e) {
    redirect(`/produkte/${productId}?tab=analyse&fehler=${encodeURIComponent(`Insight-Verdichtung: ${e instanceof Error ? e.message : String(e)}`)}&code=VER-01`);
  }
  revalidatePath(`/produkte/${productId}`);
  redirect(`/produkte/${productId}?tab=analyse`);
}

/**
 * Feature-Relevanz-Ranking (D141/D146): Listing-Features nach Kunden-Relevanz.
 * Pflicht-Datenbasis: Listing-Snapshot + Bewertungs-Analyse. Läuft als eigene
 * Etappe mit Redundanz-Guard (D81-Muster) — dieselbe Datenbasis wird nicht
 * doppelt gerankt.
 */
async function featuresKern(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
): Promise<string | null> {
  const productId = product.id;
  const back = (msg: string, code: string): never => {
    throw new GenFehler(msg, code);
  };

  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  if (!snapshot) back("Feature-Ranking braucht den Listing-Import (Titel/Bullets/Attribute als Quelltexte).", "FEA-01");

  const insight = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (!insight) back("Feature-Ranking braucht die Bewertungs-Analyse — sie liefert das Kunden-Echo je Feature.", "FEA-01");

  // Redundanz-Guard: dieselbe Datenbasis wird nicht doppelt gerankt
  const last = await db.query.featureRankings.findFirst({
    where: eq(schema.featureRankings.productId, productId),
    orderBy: desc(schema.featureRankings.createdAt),
  });
  if (last && Math.max(snapshot!.createdAt.getTime(), insight!.createdAt.getTime()) <= last.createdAt.getTime()) {
    return "Die Datenbasis ist seit dem letzten Feature-Ranking unverändert.";
  }

  const { normalisierePayload } = await import("@/lib/reviews/insights");
  const p = normalisierePayload(insight!.payload);
  const scrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, productId),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });
  const normAsin = (a: string) => a.trim().toUpperCase();
  const wettbewerberAsins = (scrape?.asins ?? []).map(normAsin).filter((a) => !product.asin || a !== normAsin(product.asin)).length;

  const f = product.facts;
  const belegText = [
    f.productType, f.dimensions, ...(f.materials ?? []), ...(f.usps ?? []), f.targetAudience,
    ...(f.certifications ?? []), product.zusatzKontext,
    snapshot!.title, ...(snapshot!.bullets ?? []), snapshot!.description,
    ...(snapshot!.attributes ? Object.entries(snapshot!.attributes).map(([k, v]) => `${k}: ${v}`) : []),
    snapshot!.importantInfo, snapshot!.aplusContent,
    (await import("@/lib/analysis/bildAuslese")).bilderAlsText(snapshot!.bilderText),
  ].filter(Boolean).join("\n");

  try {
    const { rankeFeatures } = await import("@/lib/analysis/featureRanking");
    const payload = await rankeFeatures({
      quellen: {
        title: snapshot!.title,
        bullets: snapshot!.bullets ?? [],
        description: snapshot!.description,
        attributes: snapshot!.attributes,
        importantInfo: snapshot!.importantInfo,
        aplusContent: snapshot!.aplusContent,
        bilder: (await import("@/lib/analysis/bildAuslese")).bilderAlsText(snapshot!.bilderText) || null,
      },
      aspekte: { painPoints: p.painPoints, buyingTriggers: p.buyingTriggers },
      reviewsGesamt: p.stats.reviewsTotal,
      sprache: product.contentSprache,
      belegText,
      wettbewerberAsins,
    });
    const dataBasis = [
      `Listing-Import (${snapshot!.source}, ${snapshot!.createdAt.toLocaleDateString("de-DE")})`,
      `Review-Insights (${insight!.dataBasis}, ${p.stats.reviewsTotal} Reviews)`,
    ];
    await db.insert(schema.featureRankings).values({ id: id(), productId, payload, dataBasis });
  } catch (e) {
    if (e instanceof GenFehler) throw e;
    back(`Feature-Ranking: ${e instanceof Error ? e.message : String(e)}`, "FEA-01");
  }
  return null;
}

/**
 * Conversion-Blocker (D167): Kunden-Themen ohne Listing-Antwort — der
 * fehlende Match kostet Conversion. Pflicht-Datenbasis: Listing-Snapshot +
 * Bewertungs-Analyse; Redundanz-Guard nach D81-Muster.
 */
/** Blocker-Kern (D167/D172-Pipeline-fähig): wirft GenFehler, Hinweis bei Redundanz-Guard. */
async function blockerKern(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
): Promise<string | null> {
  const productId = product.id;
  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  if (!snapshot) throw new GenFehler("Der Blocker-Lauf braucht den Listing-Import — er prüft, was Kunden dort NICHT beantwortet finden.", "BLK-01");

  const insight = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (!insight) throw new GenFehler("Der Blocker-Lauf braucht die Bewertungs-Analyse — ihre Kunden-Themen sind die eine Hälfte des Matches.", "BLK-01");

  // Redundanz-Guard: dieselbe Datenbasis wird nicht doppelt geprüft
  const last = await db.query.conversionBlockers.findFirst({
    where: eq(schema.conversionBlockers.productId, productId),
    orderBy: desc(schema.conversionBlockers.createdAt),
  });
  if (last && Math.max(snapshot.createdAt.getTime(), insight.createdAt.getTime()) <= last.createdAt.getTime()) {
    return "Die Datenbasis ist seit dem letzten Blocker-Lauf unverändert — das Ergebnis ist aktuell.";
  }

  const { normalisierePayload } = await import("@/lib/reviews/insights");
  const p = normalisierePayload(insight.payload);

  try {
    const { findeBlocker } = await import("@/lib/analysis/blocker");
    const payload = await findeBlocker({
      quellen: {
        title: snapshot.title,
        bullets: snapshot.bullets ?? [],
        description: snapshot.description,
        attributes: snapshot.attributes,
        importantInfo: snapshot.importantInfo,
        aplusContent: snapshot.aplusContent,
        bilder: (await import("@/lib/analysis/bildAuslese")).bilderAlsText(snapshot.bilderText) || null,
      },
      aspekte: { painPoints: p.painPoints, buyingTriggers: p.buyingTriggers },
      reviewsGesamt: p.stats.reviewsTotal,
      sprache: product.contentSprache,
    });
    const dataBasis = [
      `Listing-Import (${snapshot.source}, ${snapshot.createdAt.toLocaleDateString("de-DE")})`,
      `Review-Insights (${insight.dataBasis}, ${p.stats.reviewsTotal} Reviews)`,
    ];
    await db.insert(schema.conversionBlockers).values({ id: id(), productId, payload, dataBasis });
  } catch (e) {
    throw new GenFehler(`Blocker-Lauf: ${e instanceof Error ? e.message : String(e)}`, "BLK-01");
  }
  return null;
}


/**
 * Ein-Klick-Pipeline (D172): EINE Etappe je Aufruf — der Client-Runner reiht
 * die Etappen und bleibt so unterm Vercel-Request-Limit (D136). Fehler kommen
 * als Wert zurück (kein Redirect), damit der Runner sie anzeigen und die
 * Etappe erneut anstoßen kann.
 */
export type PipelineErgebnis = { ok: boolean; hinweis?: string; fehler?: string; code?: string };

export async function runPipelineStufe(
  productId: string,
  stufe: "listing" | "scrape" | "auswertung" | "wettbewerb-texte" | "verdichtung" | "blocker" | "features" | "audit" | "content",
  extra?: { asins?: string[]; section?: string; force?: boolean; ohneAnalyseBestaetigt?: boolean },
): Promise<PipelineErgebnis> {
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return { ok: false, fehler: "Produkt nicht gefunden.", code: "ALG-00" };

  try {
    switch (stufe) {
      case "listing":
        return { ok: true, hinweis: (await importListingKern(db, product)) ?? undefined };
      case "scrape": {
        const asins = [...new Set((extra?.asins ?? []).map((a) => a.trim().toUpperCase()).filter(Boolean))];
        return { ok: true, hinweis: (await scrapeKern(db, product, asins, extra?.force === true)) ?? undefined };
      }
      case "auswertung":
        return { ok: true, hinweis: (await auswertungKern(db, product)) ?? undefined };
      case "wettbewerb-texte":
        return { ok: true, hinweis: (await wettbewerbsTexteKern(db, product)) ?? undefined };
      case "verdichtung": {
        const insight = await db.query.reviewInsights.findFirst({
          where: eq(schema.reviewInsights.productId, productId),
          orderBy: desc(schema.reviewInsights.createdAt),
        });
        const { normalisierePayload } = await import("@/lib/reviews/insights");
        if (insight && (normalisierePayload(insight.payload).insightCards?.length ?? 0) > 0) {
          return { ok: true, hinweis: "Diese Analyse ist bereits verdichtet." };
        }
        await fuehreVerdichtungAus(db, productId);
        return { ok: true };
      }
      case "blocker":
        return { ok: true, hinweis: (await blockerKern(db, product)) ?? undefined };
      case "features":
        return { ok: true, hinweis: (await featuresKern(db, product)) ?? undefined };
      case "audit":
        return { ok: true, hinweis: (await auditKern(db, product)) ?? undefined };
      case "content": {
        const section = String(extra?.section ?? "");
        const gueltig = ["title", "bullets", "description", "backend", "highlights", "qa"];
        if (!gueltig.includes(section)) return { ok: false, fehler: `Unbekannte Sektion: ${section}`, code: "GEN-01" };
        // Geführte Kette (D195): Der Ein-Klick-Lauf generiert nur, was in der
        // Kette dran ist — Sektionen mit nicht freigegebenen Vorgängern werden
        // als Hinweis übersprungen (kein Fehler): die Freigabe im Content-
        // Reiter generiert sie automatisch, sobald sie dran sind.
        const dbT = (s: ListingSection) => (s === "backend" ? "backend_keywords" : s === "highlights" ? "item_highlights" : s);
        const vorhandene = await db.query.contentVersions.findMany({ where: eq(schema.contentVersions.productId, productId) });
        const offenerVorgaenger = SEKTIONS_REIHENFOLGE
          .slice(0, SEKTIONS_REIHENFOLGE.indexOf(section as ListingSection))
          .find((s) => !vorhandene.some((v) => v.type === dbT(s) && v.status === "approved"));
        if (offenerVorgaenger) {
          return { ok: true, hinweis: `${SEKTIONS_LABEL[section]} wartet in der Kette auf die Freigabe von „${SEKTIONS_LABEL[offenerVorgaenger]}" — Freigabe im Content-Reiter generiert automatisch weiter.` };
        }
        // GEN-02-Gate gilt auch hier (Review-Fix): ohne Analyse nur mit
        // ausdrücklicher Bestätigung aus der Start-Maske, nie automatisch.
        await generiereSektionKern(db, productId, section as ListingSection, extra?.ohneAnalyseBestaetigt === true);
        return { ok: true };
      }
    }
  } catch (e) {
    if (e instanceof GenFehler) return { ok: false, fehler: e.message, code: e.code };
    const fallback = stufe === "verdichtung" ? "VER-01" : stufe === "content" ? "GEN-01" : "ALG-00";
    return { ok: false, fehler: e instanceof Error ? e.message : String(e), code: fallback };
  }
  // BEWUSST kein revalidatePath je Etappe (Review-Fix): der neue RSC-Baum
  // würde die laufende Start-Maske abbauen, sobald die erste Analyse existiert.
  // Der Client ruft am Ende router.refresh(); die Seite ist force-dynamic.
}

/**
 * Scrape-Kern (D172-Pipeline-fähig): scrapt + speichert, wirft GenFehler mit
 * Code, gibt bei Redundanz-Guard einen Hinweis zurück. KEINE Auswertung —
 * die ist eine eigene Etappe (auswertungKern).
 */
async function scrapeKern(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
  asins: string[],
  /** true („Neu scrapen"-Absicht, Review-Fix): 24-h-Guard bewusst übergehen. */
  force = false,
): Promise<string | null> {
  const productId = product.id;
  if (asins.length === 0) {
    throw new GenFehler("Review-Scrape: keine ASIN angegeben — mindestens einen ASIN-Chip stehen lassen.", "REV-04");
  }

  // Redundanz-Guard (D81): identische ASIN-Menge, jünger als 24 h → kein
  // Doppel-Scrape derselben Daten; neue ASINs oder Wartezeit schalten frei.
  const lastScrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, productId),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });
  const norm = (a: string[]) => [...new Set(a.map((x) => x.trim().toUpperCase()))].sort().join(",");
  if (
    !force &&
    lastScrape &&
    lastScrape.source === "apify" &&
    norm(lastScrape.asins) === norm(asins) &&
    Date.now() - lastScrape.createdAt.getTime() < 24 * 60 * 60 * 1000
  ) {
    return "Diese ASINs wurden in den letzten 24 h bereits gescraped — Datenbasis ist aktuell.";
  }

  const { scrapeReviews } = await import("@/lib/reviews/apify");

  let reviews: Array<{ asin: string; rating: number; title: string; body: string }> = [];
  let notes: string[] = [];
  let source: "apify" | "mock" = "apify";
  // Sprach-Gate 2 (D128): Reviews kommen vom Marktplatz der CONTENT-Sprache —
  // die ASIN allein verrät ihren Marktplatz nicht, also erzwingt das Gate die
  // Scrape-Domain. Existiert eine ASIN dort nicht, gibt es ehrlich 0 Treffer.
  const marktPasst = marktplatzSprache(product.marketplace) === product.contentSprache;
  const scrapeMarkt = marktPasst ? product.marketplace : marktplatzFuerSprache(product.contentSprache);
  try {
    ({ reviews, notes } = await scrapeReviews(asins, { domain: amazonDomain(scrapeMarkt) }));
    if (!marktPasst) {
      notes.unshift(`Sprach-Gate: Scrape lief gegen amazon.${amazonDomain(scrapeMarkt)} — der Marktplatz der Content-Sprache (${SPRACH_NAMEN[product.contentSprache]}), nicht amazon.${amazonDomain(product.marketplace)}.`);
    }
    // Zweite Sicherung: Sprache der gescrapten Texte gegen die Content-Sprache
    const textSprache = erkenneSprache(reviews.map((r) => `${r.title} ${r.body}`)).sprache;
    if (textSprache && textSprache !== product.contentSprache) {
      notes.push(`△ Sprach-Heuristik: Die gescrapten Reviews wirken ${SPRACH_NAMEN[textSprache]}, die Content-Sprache ist ${SPRACH_NAMEN[product.contentSprache]} — Datenbasis prüfen, bevor daraus Content entsteht.`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("APIFY_API_KEY")) {
      // Demo-Modus: klar gekennzeichneter Mock-Scrape, damit der Flow testbar bleibt
      source = "mock";
      reviews = [
        { asin: asins[0] ?? "B000000000", rating: 5, title: "Mock", body: "hält wirklich 24h kalt, bin begeistert" },
        { asin: asins[0] ?? "B000000000", rating: 4, title: "Mock", body: "gute Qualität, passt in den Becherhalter" },
        { asin: asins[0] ?? "B000000000", rating: 2, title: "Mock", body: "Dichtung tropft nach zwei Wochen in der Tasche" },
        { asin: asins[0] ?? "B000000000", rating: 1, title: "Mock", body: "kam zerkratzt an" },
      ];
    } else {
      throw new GenFehler(`Review-Scrape: ${msg}`, msg.includes("Zeitlimit") ? "REV-01" : "REV-03");
    }
  }
  if (reviews.length === 0) {
    throw new GenFehler("Review-Scrape: 0 Reviews gefunden — ASIN prüfen (neues Produkt ohne Bewertungen?).", "REV-02");
  }

  const starCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const perAsin: Record<string, number> = {};
  for (const r of reviews) {
    const star = String(Math.min(5, Math.max(1, Math.round(r.rating))));
    starCounts[star] += 1;
    perAsin[r.asin] = (perAsin[r.asin] ?? 0) + 1;
  }

  // Wahrheit neben die Stichprobe stellen (D74/D100): die Amazon-Gesamtzahlen
  // stammen aus dem LISTING-IMPORT (dort werden reviewsTotal/Ø/Verteilung
  // bereits geholt) — beim Review-Scrape läuft KEIN zusätzlicher
  // Produkt-Crawler mehr (Nutzer-Vorgabe: kostet Runs, bringt nichts Neues).
  let amazonTotals: { reviewsTotal: number | null; ratingAvg: number | null; dist: Record<string, number> | null; asOf: string } | null = null;
  if (source === "apify") {
    const snap = await db.query.listingSnapshots.findFirst({
      where: eq(schema.listingSnapshots.productId, productId),
      orderBy: desc(schema.listingSnapshots.createdAt),
    });
    if (snap && (snap.reviewsTotal !== null || snap.ratingAvg !== null)) {
      amazonTotals = { reviewsTotal: snap.reviewsTotal, ratingAvg: snap.ratingAvg, dist: snap.ratingDist, asOf: snap.createdAt.toISOString() };
    } else {
      notes = [...notes, "Amazon-Gesamtzahlen (Bewertungen gesamt, Ø) fehlen — zuerst das Listing importieren, dann stehen sie neben der Stichprobe."];
    }
  }

  await db.insert(schema.reviewScrapes).values({ id: id(), productId, source, asins, reviews, starCounts, perAsin, notes, amazonTotals });

  // Wettbewerber-LISTINGS scrapen (D199, Nutzer 23.07.): Nicht nur die Reviews
  // der Vergleichs-ASINs, auch deren Listing-TEXTE sind Rohstoff. Nicht-
  // blockierend: scheitert es, bleibt der Review-Scrape gültig. Nur echte
  // Wettbewerber (nicht die eigene ASIN), nur wenn nicht schon frisch vorhanden.
  if (source === "apify") {
    const eigene = (product.asin ?? "").toUpperCase();
    const competitors = [...new Set(asins.map((a) => a.toUpperCase()))].filter((a) => a && a !== eigene).slice(0, 6);
    if (competitors.length > 0) {
      try {
        await scrapeWettbewerberListings(db, product, competitors, force);
      } catch (e) {
        console.error("[WB-LISTINGS] Scrape übersprungen:", e instanceof Error ? e.message : e);
      }
    }
  }
  return null;
}

/**
 * Wettbewerber-Listings scrapen (D199): dieselbe Scrape-Maschinerie wie der
 * eigene Import, je Competitor-ASIN ein Snapshot in competitor_listings.
 * Nicht-blockierend; 24-h-Redundanz-Guard je ASIN (force übergeht ihn).
 */
async function scrapeWettbewerberListings(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
  competitors: string[],
  force: boolean,
): Promise<void> {
  const marktPasst = marktplatzSprache(product.marketplace) === product.contentSprache;
  const scrapeMarkt = marktPasst ? product.marketplace : marktplatzFuerSprache(product.contentSprache);
  const { scrapeProductViaAnthropic } = await import("@/lib/scrape/anthropicProduct");
  const { scrapeProductViaCrawler } = await import("@/lib/scrape/crawler");
  for (const asin of competitors) {
    const vorhanden = await db.query.competitorListings.findFirst({
      where: and(eq(schema.competitorListings.productId, product.id), eq(schema.competitorListings.asin, asin)),
      orderBy: desc(schema.competitorListings.createdAt),
    });
    if (!force && vorhanden && Date.now() - vorhanden.createdAt.getTime() < 24 * 60 * 60 * 1000) continue;
    let snap: import("@/lib/scrape/apifyProduct").ProductSnapshot | null = null;
    let src = "anthropic";
    try {
      snap = await scrapeProductViaAnthropic(asin, scrapeMarkt, { timeoutSec: 20 });
    } catch {
      try {
        snap = await scrapeProductViaCrawler(asin, scrapeMarkt, { timeoutSec: 15 });
        src = "crawler";
      } catch {
        continue; // dieser Competitor bleibt aus, der Rest läuft weiter
      }
    }
    if (!snap) continue;
    await db.insert(schema.competitorListings).values({
      id: id(), productId: product.id, asin, source: src,
      title: snap.title, bullets: snap.bullets, description: snap.description, attributes: snap.attributes,
    });
  }
}

/**
 * Wettbewerber-Listing-Abgleich (D199): gescrapte Konkurrenz-Listings gegen
 * unser Listing spiegeln → fehlende, übertragbare Informationen. Optional &
 * nicht-blockierend: ohne Competitor-Listings ehrlich „kein Abgleich".
 */
async function wettbewerbsTexteKern(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
): Promise<string | null> {
  const productId = product.id;
  const listings = await db.query.competitorListings.findMany({
    where: eq(schema.competitorListings.productId, productId),
    orderBy: desc(schema.competitorListings.createdAt),
  });
  // Je ASIN nur der jüngste Snapshot
  const jeAsin = new Map<string, (typeof listings)[number]>();
  for (const l of listings) if (!jeAsin.has(l.asin)) jeAsin.set(l.asin, l);
  if (jeAsin.size === 0) return "Kein Wettbewerber-Listing vorhanden — für den Abgleich am Analyse-Start Vergleichs-ASINs eintragen.";

  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });

  // Redundanz-Guard: neuestes Wettbewerber-Listing älter als letzter Abgleich → aktuell
  const last = await db.query.competitorInfoGaps.findFirst({
    where: eq(schema.competitorInfoGaps.productId, productId),
    orderBy: desc(schema.competitorInfoGaps.createdAt),
  });
  const neuestesListing = Math.max(...[...jeAsin.values()].map((l) => l.createdAt.getTime()));
  if (last && neuestesListing <= last.createdAt.getTime()) {
    return "Die Wettbewerber-Listings sind seit dem letzten Abgleich unverändert.";
  }

  try {
    const { analysiereWettbewerbsTexte } = await import("@/lib/analysis/wettbewerbsTexte");
    const payload = await analysiereWettbewerbsTexte({
      produktName: product.name,
      facts: product.facts,
      eigenesListing: { title: snapshot?.title ?? null, bullets: snapshot?.bullets ?? null, description: snapshot?.description ?? null },
      wettbewerber: [...jeAsin.values()].map((l) => ({ asin: l.asin, title: l.title, bullets: l.bullets, description: l.description, attributes: l.attributes })),
    });
    const dataBasis = [...jeAsin.keys()].map((a) => `Wettbewerber-Listing ${a}`);
    await db.insert(schema.competitorInfoGaps).values({ id: id(), productId, payload, dataBasis });
  } catch (e) {
    throw new GenFehler(`Wettbewerber-Abgleich: ${e instanceof Error ? e.message : String(e)}`, "WB-01");
  }
  return null;
}

/**
 * Auswertungs-Kern (D172-Pipeline-fähig): Roh-Analyse des letzten Scrapes.
 * Redundanz-Guard (D79): derselbe Scrape wird nie doppelt analysiert.
 */
async function auswertungKern(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
): Promise<string | null> {
  const productId = product.id;
  const scrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, productId),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });
  if (!scrape) throw new GenFehler("Erst Reviews scrapen, dann auswerten.", "REV-05");

  // Altbestand ohne scrapeId: Analyse nach dem Scrape gilt als dessen Analyse.
  const existing = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (existing && (existing.scrapeId === scrape.id || (!existing.scrapeId && existing.createdAt > scrape.createdAt))) {
    return "Dieser Scrape ist bereits ausgewertet.";
  }

  const { extractInsights } = await import("@/lib/reviews/apify");
  const dataBasis = scrape.source === "apify" ? "apify_scrape" : "none";
  try {
    // Quell-URLs wie beim Scrape (Review-Fix): echte Domain des Scrape-Marktplatzes
    const marktPasst = marktplatzSprache(product.marketplace) === product.contentSprache;
    const scrapeMarkt = marktPasst ? product.marketplace : marktplatzFuerSprache(product.contentSprache);
    const res = await extractInsights(
      scrape.reviews,
      scrape.asins.map((a) => `amazon.${amazonDomain(scrapeMarkt)}/dp/${a}`),
      dataBasis,
      product.asin ?? undefined,
    );
    // Übertragbarkeits-Prüfung (D196): wettbewerbs-dominante Aspekte werden
    // gegen UNSERE Produkt-Wahrheit + Listing beurteilt — erst damit werden
    // Wettbewerbs-Findings strategisch nutzbar (Lücken) statt weggeworfen.
    try {
      const snapshotFuerTransfer = await db.query.listingSnapshots.findFirst({
        where: eq(schema.listingSnapshots.productId, productId),
        orderBy: desc(schema.listingSnapshots.createdAt),
      });
      const { pruefeUebertragbarkeit } = await import("@/lib/reviews/uebertragbarkeit");
      res.payload = await pruefeUebertragbarkeit(res.payload, {
        produktName: product.name,
        facts: product.facts,
        listingTitel: snapshotFuerTransfer?.title ?? null,
        listingBullets: snapshotFuerTransfer?.bullets ?? null,
      });
    } catch (transferFehler) {
      // Nicht-blockierend: ohne Urteil gelten Wettbewerbs-Aspekte als „unbekannt"
      console.error("[TRANSFER-CHECK] übersprungen:", transferFehler instanceof Error ? transferFehler.message : transferFehler);
    }
    await db.insert(schema.reviewInsights).values({
      id: id(), productId, scrapeId: scrape.id, dataBasis, confidence: res.confidence, payload: res.payload,
    });
  } catch (e) {
    throw new GenFehler(`Review-Analyse: ${e instanceof Error ? e.message : String(e)}`, "ANA-01");
  }
  return null;
}


export async function analyzeReviewsAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;

  let hinweis: string | null = null;
  try {
    hinweis = await auswertungKern(db, product);
  } catch (e) {
    const code = e instanceof GenFehler ? e.code : "ANA-01";
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(e instanceof Error ? e.message : String(e))}&code=${code}&tab=analyse#reviews`);
  }
  // Bereits ausgewertet UND verdichtet → nichts erneut laufen lassen (Review-Fix:
  // sonst überschrieb ein Doppel-Klick die Karten und stapelte Qualitäts-Notizen)
  if (hinweis) {
    const insight = await db.query.reviewInsights.findFirst({
      where: eq(schema.reviewInsights.productId, productId),
      orderBy: desc(schema.reviewInsights.createdAt),
    });
    const { normalisierePayload } = await import("@/lib/reviews/insights");
    if (insight && (normalisierePayload(insight.payload).insightCards?.length ?? 0) > 0) {
      redirect(`/produkte/${productId}?tab=analyse&hinweis=${encodeURIComponent(hinweis)}`);
    }
  }

  // Etappe 3 (D131/D136): Verdichtung — eigener, nachholbarer Schritt
  try {
    await fuehreVerdichtungAus(db, productId);
  } catch (e) {
    revalidatePath(`/produkte/${productId}`);
    redirect(`/produkte/${productId}?tab=analyse&fehler=${encodeURIComponent(`Roh-Analyse gespeichert — aber die Verdichtung schlug fehl: ${e instanceof Error ? e.message : String(e)}`)}&code=VER-01`);
  }
  revalidatePath(`/produkte/${productId}`);
  redirect(`/produkte/${productId}?tab=analyse`);
}

/**
 * Tiefen-Audit (D76): umfassende 8-Dimensionen-Analyse nach temoa-audit-Spec.
 * Pflicht-Datenbasis: Listing-Inhalt (Import oder eigene Versionen) UND eine
 * Bewertungs-Analyse dieses Produkts (optional inkl. Wettbewerber-ASINs) —
 * USPs & Zielgruppe werden aus echten Daten HERGELEITET, nie getippt.
 */
async function auditKern(
  db: Awaited<ReturnType<typeof getDb>>,
  product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>,
): Promise<string | null> {
  const productId = product.id;
  const back = (msg: string): never => {
    throw new GenFehler(msg, "AUD-01");
  };

  const snapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, productId),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latest = (t: string) =>
    (versions.find((v) => v.type === t && v.status === "approved") ?? versions.find((v) => v.type === t))
      ?.payload as Record<string, unknown> | undefined;
  const title = (latest("title")?.text as string) || snapshot?.title || "";
  const bullets = ((latest("bullets")?.items as string[]) ?? []).length
    ? ((latest("bullets")?.items as string[]) ?? [])
    : (snapshot?.bullets ?? []);
  // D219: Kann Amazon keine Beschreibung liefern (A+ ersetzt das Beschreibungsfeld),
  // füllt die optionale, manuell eingegebene Produktbeschreibung diese Lücke —
  // so bekommt der Tiefen-Audit auch dann eine Beschreibungs-Dimension.
  const description = (latest("description")?.text as string) || snapshot?.description || product.zusatzKontext?.trim() || "";
  if (!title && bullets.length === 0 && !description) {
    back("Tiefen-Audit braucht Listing-Inhalt — erst ‚Listing von Amazon laden' (Sektion 0) oder Content erstellen.");
  }

  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (!insights) {
    back("Tiefen-Audit braucht die Bewertungs-Analyse zuerst (Sektion 2c — Scrape, dann Analyse; optional Wettbewerber-ASINs dazu). Sie liefert Pain Points, Kaufauslöser und Kundensprache als Herleitungs-Basis.");
  }

  const scrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, productId),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });
  const kws = (await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) })).filter((k) => !k.ausgeschlossen);
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, product.brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const sovUpload = uploads.find(
    (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === productId,
  );
  const sovAudit = (sovUpload?.parsed as { audit?: import("@/lib/sov/audit").SovAudit })?.audit ?? null;

  // Redundanz-Guard (D81): dieselbe Datenbasis wird nicht doppelt auditiert —
  // erst neuer Import/Scrape/Analyse/Content schaltet „Neu bewerten" frei.
  const lastAudit = await db.query.deepAudits.findFirst({
    where: eq(schema.deepAudits.productId, productId),
    orderBy: desc(schema.deepAudits.createdAt),
  });
  if (lastAudit) {
    const newestInput = Math.max(
      snapshot?.createdAt.getTime() ?? 0,
      insights!.createdAt.getTime(),
      versions[0]?.createdAt.getTime() ?? 0,
      scrape?.createdAt.getTime() ?? 0,
      sovUpload?.createdAt.getTime() ?? 0,
    );
    if (newestInput <= lastAudit.createdAt.getTime()) {
      return "Die Datenbasis ist seit der letzten KI-Bewertung unverändert.";
    }
  }

  // Bewertungs-Sockel: neueste Wahrheit gewinnt (Scrape-Totals vor Import-Basics)
  const basics = scrape?.amazonTotals
    ? { reviewsTotal: scrape.amazonTotals.reviewsTotal, ratingAvg: scrape.amazonTotals.ratingAvg, dist: scrape.amazonTotals.dist }
    : snapshot && (snapshot.reviewsTotal !== null || snapshot.ratingAvg !== null)
      ? { reviewsTotal: snapshot.reviewsTotal, ratingAvg: snapshot.ratingAvg, dist: snapshot.ratingDist }
      : null;

  const { buildDeepAudit } = await import("@/lib/analysis/deepAudit");
  try {
    const payload = await buildDeepAudit({
      productName: product.name,
      asin: product.asin,
      title,
      bullets,
      description,
      backendKeywords: (latest("backend_keywords")?.text as string) ?? "",
      imageCount: snapshot?.imageUrls ? snapshot.imageUrls.length : null,
      basics,
      priceEur: product.price !== null ? product.price / 100 : null,
      reviewInsights: insights!.payload,
      primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
      topGaps: (sovAudit?.topDemandGaps ?? []).map((g) => ({ keyword: g.keyword, sv: g.sv, fullRevGap: g.fullRevGap })),
    });

    const dataBasis = [
      snapshot ? `Listing-Import (${snapshot.source}, ${snapshot.createdAt.toLocaleDateString("de-DE")})` : "eigene Content-Versionen",
      `Review-Insights (${insights!.dataBasis}, Konfidenz ${insights!.confidence})`,
      ...(basics ? ["Amazon-Basics (Bewertungen gesamt, Ø)"] : []),
      ...(kws.length ? [`${kws.length} Keywords`] : []),
      ...(sovAudit ? ["SOV-Audit"] : []),
    ];
    await db.insert(schema.deepAudits).values({ id: id(), productId, payload, dataBasis });

    // Hergeleitete USPs/Zielgruppe in LEERE Fakten-Felder übernehmen (Prüf-Ansicht, D70-Regel)
    const f = { ...product.facts };
    let changed = false;
    if ((!f.usps || f.usps.length === 0) && payload.derived.usps.length) { f.usps = payload.derived.usps; changed = true; }
    if (!f.targetAudience && payload.derived.zielgruppe) { f.targetAudience = payload.derived.zielgruppe; changed = true; }
    if (changed) await db.update(schema.products).set({ facts: f }).where(eq(schema.products.id, productId));
  } catch (e) {
    if (e instanceof GenFehler) throw e;
    back(`Tiefen-Audit: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

// ── Handlungen (D45): aus Analysen ableiten + Status pflegen ─────────────────

export async function syncBrandActions(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  if (!brandId) return;
  const db = await getDb();
  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });

  const { analyzeListing } = await import("@/lib/analysis/listingAudit");
  const { inArray } = await import("drizzle-orm");

  const uploads = await db.query.reportUploads.findMany({ where: eq(schema.reportUploads.brandId, brandId) });

  const fresh: (typeof schema.actions.$inferInsert)[] = [];
  for (const product of products) {
    const versions = await db.query.contentVersions.findMany({
      where: eq(schema.contentVersions.productId, product.id),
      orderBy: desc(schema.contentVersions.createdAt),
    });
    if (versions.length === 0) continue;
    const latest = (t: string) => versions.find((v) => v.type === t)?.payload as Record<string, unknown> | undefined;
    const kws = (await db.query.keywords.findMany({ where: eq(schema.keywords.productId, product.id) })).filter((k) => !k.ausgeschlossen);
    const insight = await db.query.reviewInsights.findFirst({
      where: eq(schema.reviewInsights.productId, product.id),
      orderBy: desc(schema.reviewInsights.createdAt),
    });
    const sovUpload = uploads.find(
      (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === product.id,
    );
    const sovAudit = (sovUpload?.parsed as { audit?: import("@/lib/sov/audit").SovAudit })?.audit ?? null;

    const analysis = analyzeListing({
      snapshot: {
        title: (latest("title")?.text as string) ?? "",
        bullets: (latest("bullets")?.items as string[]) ?? [],
        description: (latest("description")?.text as string) ?? "",
        backendKeywords: (latest("backend_keywords")?.text as string) ?? "",
      },
      facts: product.facts,
      primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
      sovAudit,
      reviewInsights: insight?.payload ?? null,
    });

    const categorize = (text: string): "content" | "ppc" | "listing" =>
      /kampagne|ppc|spend|gebot/i.test(text) ? "ppc" : /keyword|titel|bullet|beschreibung|backend|einwand/i.test(text) ? "content" : "listing";

    for (const rec of analysis.recommendations) {
      fresh.push({
        id: id(), brandId, productId: product.id, scope: "product",
        category: categorize(rec), title: `${product.name}: ${rec}`,
        source: "listing-analyse", upliftEur: null, status: "open",
      });
    }
    if (analysis.sov && analysis.sov.corridor.high > 0) {
      fresh.push({
        id: id(), brandId, productId: product.id, scope: "brand",
        category: "content",
        title: `${product.name}: Top-Umsatzlücken schließen (${analysis.sov.topGaps.slice(0, 3).map((g) => g.keyword).join(", ")} …)`,
        source: "sov-audit", upliftEur: analysis.sov.corridor.high, status: "open",
      });
    }
  }

  // Marken-Ebene: Ads-Bericht → Spend ohne Verkäufe als PPC-Handlung (Hebel = eingesparter Spend)
  const adsUpload = uploads.find((u) => u.reportType === "ads" && u.parseStatus === "ok");
  const adsParsed = adsUpload?.parsed as { totals?: import("@/lib/reports/ads").AdsTotals; campaigns?: import("@/lib/reports/ads").AdsCampaign[] } | null;
  const adsTotals = adsParsed?.totals ?? null;
  if (adsTotals && adsTotals.noSaleSpend > 0) {
    fresh.push({
      id: id(), brandId, productId: null, scope: "brand",
      category: "ppc",
      title: `${adsTotals.noSaleCount} Kampagnen mit Spend ohne Verkäufe prüfen (pausieren/negativieren)`,
      source: "ads-bericht", upliftEur: Math.round(adsTotals.noSaleSpend), status: "open",
    });
  }
  // Ads-Bericht → Überspend über Portfolio-Ziel (spend − sales × targetAcos, reporting-main ads-over-target)
  const overTarget = (adsParsed?.campaigns ?? []).filter(
    (c) => c.targetAcos !== null && c.sales > 0 && c.spend > c.sales * c.targetAcos,
  );
  const overspend = overTarget.reduce((s, c) => s + (c.spend - c.sales * (c.targetAcos ?? 0)), 0);
  if (overTarget.length > 0 && overspend >= 1) {
    fresh.push({
      id: id(), brandId, productId: null, scope: "brand",
      category: "ppc",
      title: `${overTarget.length} Kampagnen über Portfolio-Ziel-ACoS — Gebote/Ausrichtung prüfen (${overTarget.slice(0, 3).map((c) => c.name).join(", ")}${overTarget.length > 3 ? " …" : ""})`,
      source: "ads-bericht", upliftEur: Math.round(overspend), status: "open",
    });
  }
  // Search-Term-Report → echte Negativ-Kandidaten; ASIN-Ziele separat (reporting-main st-negatives/st-asin-negatives)
  const stUpload = uploads.find((u) => u.reportType === "searchterm" && u.parseStatus === "ok");
  const stTotals = (stUpload?.parsed as { totals?: import("@/lib/reports/searchterm").SearchTermTotals })?.totals ?? null;
  if (stTotals) {
    const textWaste = stTotals.wastedSpend - stTotals.asinWastedSpend;
    if (textWaste >= 1) {
      fresh.push({
        id: id(), brandId, productId: null, scope: "brand",
        category: "ppc",
        title: `Negativ-Keywords setzen: ${stTotals.zeroOrderTerms} Suchbegriffe mit Spend ohne Kauf (Kandidaten unter Advertising → N-Gram)`,
        source: "searchterm-report", upliftEur: Math.round(textWaste), status: "open",
      });
    }
    if (stTotals.asinWastedSpend >= 1) {
      fresh.push({
        id: id(), brandId, productId: null, scope: "brand",
        category: "ppc",
        title: "ASIN-Ziele ohne Conversion aus den Kampagnen nehmen",
        source: "searchterm-report", upliftEur: Math.round(stTotals.asinWastedSpend), status: "open",
      });
    }
  }

  // SQP → größte Conversion-Lücke als Content-Handlung (reporting-main sqp-top-priority: Impact = Potenzial)
  const sqpUpload = uploads.find((u) => u.reportType === "sqp" && u.parseStatus === "ok");
  const sqpReport = (sqpUpload?.parsed as import("@/lib/reports/sqp").SqpReport | null) ?? null;
  if (sqpReport && sqpReport.totals.totalPotential >= 1) {
    const top = sqpReport.rows[0];
    fresh.push({
      id: id(), brandId, productId: null, scope: "brand",
      category: "content",
      title: `SQP: Conversion-Lücken schließen — größter Hebel „${top.query}" (eure CVR ${top.brandCvr ?? "–"} % vs. Markt ${top.marketCvr ?? "–"} %; Sichtbarkeit & Markt → Funnel)`,
      source: "sqp-bericht", upliftEur: Math.round(sqpReport.totals.totalPotential), status: "open",
    });
  }

  // Offene Auto-Handlungen ersetzen; manuell erledigte/in Arbeit bleiben stehen.
  const existing = await db.query.actions.findMany({ where: eq(schema.actions.brandId, brandId) });
  const replaceIds = existing.filter((a) => a.status === "open").map((a) => a.id);
  if (replaceIds.length) await db.delete(schema.actions).where(inArray(schema.actions.id, replaceIds));
  if (fresh.length) await db.insert(schema.actions).values(fresh);

  revalidatePath(`/marke/${brandId}`, "layout");
}

export async function setActionStatus(formData: FormData) {
  const actionId = String(formData.get("actionId") ?? "");
  const status = String(formData.get("status") ?? "") as "open" | "in_progress" | "done";
  const brandId = String(formData.get("brandId") ?? "");
  if (!actionId || !status) return;
  const db = await getDb();
  await db
    .update(schema.actions)
    .set({ status, doneAt: status === "done" ? new Date() : null })
    .where(eq(schema.actions.id, actionId));
  revalidatePath(`/marke/${brandId}/handlungen`);
}

// ── Produktdaten-Import (D46): Amazon-Scrape / H10-CSV → Original-Snapshot ───

/**
 * Listing-Import-Kern (D172-Pipeline-fähig): wirft GenFehler mit Code,
 * gibt bei Redundanz-Guard einen Hinweis zurück statt zu redirecten.
 */
async function importListingKern(db: Awaited<ReturnType<typeof getDb>>, product: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof getDb>>["query"]["products"]["findFirst"]>>>): Promise<string | null> {
  const productId = product.id;
  if (!product.asin) throw new GenFehler("Produkt hat keine ASIN — Import nicht möglich.", "IMP-02");

  // Redundanz-Guard (D81): erfolgreicher Import jünger als 24 h → kein Doppel-Import.
  // AUSNAHME (D191): Ein sprachfalscher Snapshot (Amazon-Maschinenübersetzung,
  // vor dem Sprach-Wächter gespeichert) ist KEIN gültiger Stand — er darf den
  // korrigierenden Neu-Import nicht 24 h blockieren.
  const lastSnap = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  if (lastSnap && ["apify", "anthropic", "crawler"].includes(lastSnap.source) && Date.now() - lastSnap.createdAt.getTime() < 24 * 60 * 60 * 1000) {
    const { erkenneSprache, marktplatzSprache } = await import("@/lib/text/sprache");
    const erwartet = marktplatzSprache(product.marketplace);
    const erkannt = erkenneSprache([lastSnap.title ?? "", ...(lastSnap.bullets ?? []), lastSnap.description ?? ""]).sprache;
    const sprachFalsch = Boolean(erwartet && erkannt && erkannt !== erwartet);
    if (!sprachFalsch) return "Das Listing wurde in den letzten 24 h bereits geladen — Stand ist aktuell.";
  }

  // Standard-Weg ist die Anthropic-API (D83); scheitert sie (Bot-Block),
  // springt automatisch der Produkt-Crawler ein (D84). Env-Override:
  // LISTING_IMPORT_PROVIDER=crawler|apify erzwingt einen Weg.
  const forced = process.env.LISTING_IMPORT_PROVIDER;
  let snap: import("@/lib/scrape/apifyProduct").ProductSnapshot | null = null;
  let source: "anthropic" | "crawler" | "apify" = "anthropic";
  try {
    if (forced === "apify") {
      const { scrapeProduct } = await import("@/lib/scrape/apifyProduct");
      snap = await scrapeProduct(product.asin, product.marketplace, { timeoutSec: 50 });
      source = "apify";
    } else if (forced === "crawler") {
      const { scrapeProductViaCrawler } = await import("@/lib/scrape/crawler");
      snap = await scrapeProductViaCrawler(product.asin, product.marketplace, { timeoutSec: 50 });
      source = "crawler";
    } else {
      // Beide Wege müssen zusammen ins 60-s-Function-Budget passen (D78)
      const { scrapeProductViaAnthropic } = await import("@/lib/scrape/anthropicProduct");
      try {
        snap = await scrapeProductViaAnthropic(product.asin, product.marketplace, { timeoutSec: 35 });
        source = "anthropic";
      } catch (first) {
        // Bot-Block o. Ä. → Crawler-Fallback; wirft auch der, gewinnt der erste Fehler
        try {
          const { scrapeProductViaCrawler } = await import("@/lib/scrape/crawler");
          snap = await scrapeProductViaCrawler(product.asin, product.marketplace, { timeoutSec: 18 });
          source = "crawler";
        } catch {
          throw first;
        }
      }
    }
  } catch (e) {
    throw new GenFehler(`Listing-Import: ${e instanceof Error ? e.message : String(e)}`, "IMP-01");
  }

  // Sprach-Wächter (D191, Nutzer-Befund 23.07.): Amazon liefert je nach
  // Client-Signal die MASCHINENÜBERSETZTE Sprachansicht („furry nose" statt
  // „Fellnase"). Ein fremdsprachiger Snapshot würde alle Folge-Analysen
  // vergiften (Listing-Kontrolle bewertete die Übersetzung mit 0/100) —
  // Abweisung an der Grenze statt stillem Speichern (D183). Die Erkennung
  // urteilt nur bei sicherem Widerspruch (erkenneSprache bleibt sonst passiv).
  {
    const { erkenneSprache, marktplatzSprache, SPRACH_NAMEN } = await import("@/lib/text/sprache");
    const erwartet = marktplatzSprache(product.marketplace);
    const erkannt = erkenneSprache([snap!.title ?? "", ...(snap!.bullets ?? []), snap!.description ?? ""]).sprache;
    if (erwartet && erkannt && erkannt !== erwartet) {
      throw new GenFehler(
        `Der Scrape lieferte die ${SPRACH_NAMEN[erkannt]}-Sprachansicht von amazon.${product.marketplace} statt des ${SPRACH_NAMEN[erwartet]}-Originals (Amazon-Maschinenübersetzung). Der Import wurde NICHT gespeichert — alle Analysen würden sonst eine Übersetzung bewerten. Bitte erneut importieren; der Scraper pinnt die Sprache jetzt explizit.`,
        "IMP-03",
      );
    }
  }
  const snapId = id();
  await db.insert(schema.listingSnapshots).values({
    id: snapId, productId, source,
    title: snap!.title, bullets: snap!.bullets, description: snap!.description,
    imageUrls: snap!.imageUrls,
    reviewsTotal: snap!.reviewsTotal, ratingAvg: snap!.ratingAvg, ratingDist: snap!.ratingDist,
    attributes: snap!.attributes, importantInfo: snap!.importantInfo, aplusContent: snap!.aplusContent,
    raw: snap!.raw,
  });

  // Bild-Auslese (D158) + Bild-Audit (D211): automatisch beim Import, KEIN
  // Extra-Schritt und kein Knopf — es kommen einfach mehr Analyse-Daten heraus.
  // Scheitert es, bleibt der Import gültig (null = ehrlich „nicht ausgelesen/bewertet").
  try {
    const { leseBilderAus, bilderAlsText } = await import("@/lib/analysis/bildAuslese");
    const auslese = await leseBilderAus(snap!.imageUrls, product.contentSprache);
    if (auslese) {
      // 4-Faktoren-Audit der bestehenden Bilder — je Bild in bilderText gemergt.
      let bilder = auslese.bilder;
      try {
        const { auditBilder } = await import("@/lib/analysis/bildAudit");
        const audit = await auditBilder(snap!.imageUrls, product.contentSprache, bilderAlsText(auslese.bilder));
        if (audit) {
          bilder = auslese.bilder.map((b) => {
            const a = audit.bilder.find((x) => x.slot === b.slot);
            return a ? { ...b, faktoren: a.faktoren } : b;
          });
        }
      } catch {
        // Audit ist Zusatz-Analyse, kein Blocker für den Import
      }
      await db.update(schema.listingSnapshots)
        .set({ bilderText: bilder, bildBefunde: auslese.befunde })
        .where(eq(schema.listingSnapshots.id, snapId));
    }
  } catch {
    // Auslese ist Zusatz-Quelle, kein Blocker
  }

  // Produkt-Fakten automatisch aus dem Import extrahieren (D70) — nur leere
  // Felder; scheitert leise (Import bleibt gültig, Felder bleiben prüfbar)
  try {
    const { extractFactsFromListing } = await import("@/lib/analysis/factsFromListing");
    const facts = await extractFactsFromListing(snap, product.facts);
    if (facts) await db.update(schema.products).set({ facts }).where(eq(schema.products.id, productId));
  } catch {
    // Autofill ist Komfort, kein Blocker
  }
  return null;
}

export async function importListingFromAmazon(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  let hinweis: string | null = null;
  try {
    hinweis = await importListingKern(db, product);
  } catch (e) {
    const code = e instanceof GenFehler ? e.code : "IMP-01";
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(e instanceof Error ? e.message : String(e))}&code=${code}`);
  }
  revalidatePath(`/produkte/${productId}`);
  if (hinweis) redirect(`/produkte/${productId}?hinweis=${encodeURIComponent(hinweis)}`);
}

/**
 * Content-Verwaltung (E-Feature): programmatischer Einzel-Import für den
 * Sammel-Import beim Kunden-Onboarding. Delegiert an den bestehenden, weiter
 * entwickelten PHM-Import (`importListingFromAmazon`) und übersetzt dessen
 * Redirect-Ergebnis in ein {ok,name,meldung}-Resultat für den Fortschrittslauf.
 * Der bestehende Einzelweg (Formular → Redirect) bleibt unverändert.
 */
export async function importiereProdukt(
  productId: string,
): Promise<{ ok: boolean; name: string; meldung: string }> {
  const db = await getDb();
  const vorher = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  const fd = new FormData();
  fd.set("productId", productId);
  try {
    await importListingFromAmazon(fd);
  } catch (e) {
    const digest = (e as { digest?: string })?.digest ?? "";
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const ziel = decodeURIComponent(digest);
      // Fehler-Redirect (?fehler=…) = echter Fehler; hinweis-Redirect = Erfolg mit Hinweis (fällt durch).
      if (ziel.includes("fehler=")) {
        return { ok: false, name: vorher?.name ?? productId, meldung: ziel.split("fehler=")[1].split("&")[0].slice(0, 120) };
      }
    } else {
      return { ok: false, name: vorher?.name ?? productId, meldung: e instanceof Error ? e.message : String(e) };
    }
  }
  const nachher = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  return { ok: true, name: nachher?.name ?? productId, meldung: "Listing geladen" };
}

/** Welche Produkte einer Marke haben noch keinen Snapshot? Für den Sammel-Import. */
export async function produkteOhneSnapshot(
  brandId: string,
): Promise<Array<{ id: string; name: string; asin: string | null }>> {
  const db = await getDb();
  const produkte = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = produkte.map((p) => p.id);
  if (!pids.length) return [];
  const snaps = await db.query.listingSnapshots.findMany({ where: inArray(schema.listingSnapshots.productId, pids) });
  const mitSnap = new Set(snaps.map((s) => s.productId));
  return produkte.filter((p) => p.asin && !mitSnap.has(p.id)).map((p) => ({ id: p.id, name: p.name, asin: p.asin }));
}

export async function uploadListingCsv(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file") as File | null;
  if (!productId || !file) return;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const { parseListingCsv } = await import("@/lib/scrape/apifyProduct");
  let snap: ReturnType<typeof parseListingCsv>;
  try {
    snap = parseListingCsv(await file.text());
  } catch (e) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`CSV-Import: ${e instanceof Error ? e.message : String(e)}`)}&code=CSV-01`);
  }
  await db.insert(schema.listingSnapshots).values({
    id: id(), productId, source: "h10_csv",
    title: snap!.title, bullets: snap!.bullets, description: snap!.description,
    imageUrls: snap!.imageUrls,
    attributes: snap!.attributes, importantInfo: snap!.importantInfo, aplusContent: snap!.aplusContent,
    raw: snap!.raw,
  });

  // Produkt-Fakten automatisch aus dem Import extrahieren (D70) — nur leere
  // Felder; scheitert leise (Import bleibt gültig, Felder bleiben prüfbar)
  try {
    const { extractFactsFromListing } = await import("@/lib/analysis/factsFromListing");
    const facts = await extractFactsFromListing(snap, product.facts);
    if (facts) await db.update(schema.products).set({ facts }).where(eq(schema.products.id, productId));
  } catch {
    // Autofill ist Komfort, kein Blocker
  }
  revalidatePath(`/produkte/${productId}`);
}

// ── Flat-File-Vorlage (D46): neuste Amazon-Vorlage pro Marke ────────────────

export async function uploadFlatfileTemplate(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const file = formData.get("file") as File | null;
  if (!brandId || !file) return;
  const db = await getDb();
  const { parseTemplate } = await import("@/lib/flatfile/build");
  const tpl = parseTemplate(await file.arrayBuffer(), file.name);
  await db.insert(schema.flatfileTemplates).values({
    id: id(), brandId, fileName: file.name,
    sheetName: tpl.sheetName, headerRows: tpl.headerRows, fieldNames: tpl.fieldNames,
  });
  revalidatePath(`/marke/${brandId}/flatfiles`);
}

// ── Manuelle Content-Bearbeitung (D47): Maske → Gate → neue Version → Flat File ──

export async function saveContentManual(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const section = String(formData.get("section") ?? "") as ListingSection;
  const raw = String(formData.get("content") ?? "").trim();
  if (!productId || !raw) return;

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const alleKws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
  const kws = await nachTieringScore(alleKws.filter((k) => !k.ausgeschlossen));
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, productId),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const manuSnapshot = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  const latest = (t: string) => versions.find((v) => v.type === t)?.payload as Record<string, unknown> | undefined;
  const manuBrand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const ctx = {
    facts: product.facts,
    primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
    // Auch Handarbeit läuft gegen die Fremdmarken-Blacklist (D97) — Marken-Kontext D149
    competitorBrands: contentMarkenKontext(manuBrand ?? undefined, manuSnapshot?.title, fremdmarkenAusKeywords(alleKws), product.marke).fremdmarken,
    // … und gegen den Zahlen-Herkunfts-Check (D114) — gleiche Quellen wie die Generierung
    zahlenQuellen: [
      product.name,
      JSON.stringify(product.facts),
      manuSnapshot?.title ?? "",
      ...(manuSnapshot?.bullets ?? []),
      manuSnapshot?.description ?? "",
      product.zusatzKontext ?? "",
      ...kws.map((k) => k.keyword),
    ].join("\n"),
  };

  const gate = await import("@/lib/validation/gate");
  let payload: Record<string, unknown>;
  let issues;
  switch (section) {
    case "bullets": {
      const items = raw.split("\n").map((l) => l.trim()).filter(Boolean);
      payload = { items };
      issues = gate.validateBullets(items, ctx);
      break;
    }
    case "qa": {
      const pairs = raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [q, ...rest] = l.split("=>");
        return { q: (q ?? "").trim(), a: rest.join("=>").trim() };
      });
      payload = { pairs };
      issues = gate.validateQa(pairs, ctx);
      break;
    }
    case "title":
      payload = { text: raw };
      issues = gate.validateTitle(raw, ctx);
      break;
    case "highlights":
      payload = { text: raw };
      issues = gate.validateItemHighlights(raw, ctx);
      break;
    case "backend": {
      const visible = [
        (latest("title")?.text as string) ?? "",
        ...(((latest("bullets")?.items as string[]) ?? [])),
        (latest("description")?.text as string) ?? "",
      ].join(" ");
      payload = { text: raw };
      issues = gate.validateBackendKeywords(raw, visible, ctx);
      break;
    }
    case "description":
      payload = { text: raw };
      issues = gate.validateDescription(raw, ((latest("bullets")?.items as string[]) ?? []), ctx);
      break;
    default:
      return;
  }

  const dbType = section === "backend" ? "backend_keywords" : section === "highlights" ? "item_highlights" : section;
  const prev = versions.filter((v) => v.type === dbType);
  await db.insert(schema.contentVersions).values({
    id: id(),
    productId,
    type: dbType as "title" | "bullets" | "item_highlights" | "description" | "backend_keywords" | "qa",
    version: (prev[0]?.version ?? 0) + 1,
    payload,
    status: "draft",
    validation: {
      passed: !issues.some((i) => i.severity === "error"),
      issues,
      checkedAt: new Date().toISOString(),
    },
    generatedBy: "manual",
  });
  revalidatePath(`/produkte/${productId}`);
}

// ── Berichte-Upload (D48): geführt, getaggt mit Periode ─────────────────────

export async function uploadReport(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const reportType = String(formData.get("reportType") ?? "");
  const file = formData.get("file") as File | null;
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  if (!brandId || !file) return;

  const db = await getDb();
  let parsed: unknown = null, parseStatus = "ok", parseError: string | null = null;
  try {
    if (reportType === "business") {
      const { parseBusinessReport } = await import("@/lib/reports/business");
      parsed = parseBusinessReport(await file.text());
    } else if (reportType === "ads") {
      const { parseAdsReport } = await import("@/lib/reports/ads");
      parsed = parseAdsReport(await file.text());
    } else if (reportType === "searchterm") {
      const { parseSearchTermReport } = await import("@/lib/reports/searchterm");
      parsed = parseSearchTermReport(await file.text());
    } else if (reportType === "sqp") {
      const { parseSqpReport } = await import("@/lib/reports/sqp");
      parsed = parseSqpReport(await file.text());
    } else {
      throw new Error(`Unbekannter Berichtstyp "${reportType}".`);
    }
  } catch (e) {
    parseStatus = "error";
    parseError = e instanceof Error ? e.message : String(e);
  }

  await db.insert(schema.reportUploads).values({
    id: id(),
    brandId,
    reportType,
    fileName: file.name,
    periodStart: periodStart ? new Date(periodStart) : null,
    periodEnd: periodEnd ? new Date(periodEnd) : null,
    parsed,
    parseStatus,
    parseError,
  });
  revalidatePath(`/marke/${brandId}`, "layout");
}
