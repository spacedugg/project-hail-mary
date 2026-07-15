"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, desc, and } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { generateSection, type ListingSection, type RecipeInputs } from "@/lib/recipes/listing";
import type { ProductFacts } from "@/db/schema";

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
  const asin = String(formData.get("asin") ?? "").trim() || null;
  const brandName = String(formData.get("brandName") ?? "").trim();
  if (!name) return;
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
    // Marken-/Herstellername des Auftrags wandert in die Produkt-Wahrheit
    name: brandName ? `${brandName} — ${name}` : name,
    asin,
  });
  redirect(`/produkte/${productId}`);
}

export async function createProduct(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const asin = String(formData.get("asin") ?? "").trim() || null;
  if (!brandId || !name) return;
  const db = await getDb();
  const productId = id();
  await db.insert(schema.products).values({ id: productId, brandId, name, asin });
  redirect(`/produkte/${productId}`);
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
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  await db.delete(schema.keywords).where(and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "manual")));
  // v0-Tiering nach Reihenfolge: 1–3 primary, 4–13 secondary, 14–18 tertiary, Rest backend
  const rows = lines.map((line, i) => {
    const [kw, vol] = line.split(/[;\t]/).map((s) => s?.trim());
    const tier = i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend";
    return {
      id: id(),
      productId,
      keyword: kw,
      searchVolume: vol ? parseInt(vol.replace(/\D/g, ""), 10) || null : null,
      tier: tier as "primary" | "secondary" | "tertiary" | "backend",
      source: "manual",
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
    redirect(`/einstellungen?fehler=${encodeURIComponent("Zum Löschen bitte exakt LÖSCHEN eintippen.")}`);
  }
  const db = await getDb();
  const { wipeAllBrandData } = await import("@/lib/demo/seed");
  await wipeAllBrandData(db);
  revalidatePath("/", "layout");
  redirect(`/einstellungen?ok=${encodeURIComponent("Alle Marken und Daten gelöscht — Konten und Rechenwerk blieben erhalten.")}`);
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

  const existing = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
  const manual = new Set(existing.filter((k) => k.source === "manual").map((k) => k.keyword.toLowerCase().trim()));

  await db.delete(schema.keywords).where(and(eq(schema.keywords.productId, productId), eq(schema.keywords.source, "cerebro")));
  const rows = tiered
    .filter((k) => !manual.has(k.keyword.toLowerCase().trim()))
    .map((k) => ({
      id: id(),
      productId,
      keyword: k.keyword,
      searchVolume: k.searchVolume,
      tier: k.tier,
      source: "cerebro",
    }));
  if (rows.length) await db.insert(schema.keywords).values(rows);
  revalidatePath(`/produkte/${productId}`);
}

export async function generateContent(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const section = String(formData.get("section") ?? "") as ListingSection;
  const db = await getDb();

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });
  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });

  const byTier = (t: string) => kws.filter((k) => k.tier === t).map((k) => k.keyword);

  // Freigegebene/neueste Sektionen als Kontext (temoa-os-Ablauf)
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, productId),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latest = (t: string) => versions.find((v) => v.type === t)?.payload as Record<string, unknown> | undefined;

  const inputs: RecipeInputs = {
    brand: brand?.name ?? "",
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
    approved: {
      title: latest("title")?.text as string | undefined,
      bullets: latest("bullets")?.items as string[] | undefined,
    },
  };

  // Fehler (API, Zeitbudget, kaputtes JSON) als Banner, nie als Fehlerseite (D81)
  let result: Awaited<ReturnType<typeof generateSection>>;
  try {
    result = await generateSection(section, inputs);
  } catch (e) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`Text-Generierung (${section}): ${e instanceof Error ? e.message : String(e)}`)}`);
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

// ── SOV: Cerebro-CSV-Upload → Audit (portiertes Formelwerk) ──────────────────

export async function uploadCerebro(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file") as File | null;
  const price = parseFloat(String(formData.get("price") ?? "")) || undefined;
  if (!productId || !file) return;

  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;

  const { parseCerebroCsv, computeSovAudit } = await import("@/lib/sov/audit");
  let parseStatus = "ok", parseError: string | null = null, audit = null;
  try {
    const rows = parseCerebroCsv(await file.text(), product.asin);
    audit = computeSovAudit(rows, { price, mainAsin: product.asin });
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
    parsed: audit ? { productId, audit } : null,
    parseStatus,
    parseError,
  });
  revalidatePath(`/produkte/${productId}`);
}

// ── Review-Insights via Apify (Neubau der defekten temoa-os-Variante) ────────

/**
 * Bewertungs-Analyse in ZWEI bewussten Schritten (D71):
 * 1. Scrape — Reviews der eigenen ASIN (+ optionale Wettbewerber) holen und
 *    mit sichtbarer Datenbasis speichern (Reviews je Sterne-Zahl, je ASIN).
 * 2. Analyse — KI wertet den gespeicherten Scrape aus (Pain Points,
 *    Kaufauslöser, O-Töne) → eigenes Findings-Dashboard.
 */
export async function scrapeReviewsAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const competitorAsins = String(formData.get("competitorAsins") ?? "")
    .split(/[\s,;]+/).filter(Boolean);
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const asins = [product.asin, ...competitorAsins].filter(Boolean) as string[];

  // Redundanz-Guard (D81): identische ASIN-Menge, jünger als 24 h → kein
  // Doppel-Scrape derselben Daten; neue ASINs oder Wartezeit schalten frei.
  const lastScrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, productId),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });
  const norm = (a: string[]) => [...new Set(a.map((x) => x.trim().toUpperCase()))].sort().join(",");
  if (
    lastScrape &&
    lastScrape.source === "apify" &&
    norm(lastScrape.asins) === norm(asins) &&
    Date.now() - lastScrape.createdAt.getTime() < 24 * 60 * 60 * 1000
  ) {
    redirect(`/produkte/${productId}?hinweis=${encodeURIComponent("Diese ASINs wurden in den letzten 24 h bereits gescraped — Datenbasis unten. Für mehr Daten Wettbewerber-ASINs dazugeben; neue Reviews gibt es ab morgen.")}#reviews`);
  }

  const { scrapeReviews } = await import("@/lib/reviews/apify");
  const { scrapeProduct } = await import("@/lib/scrape/apifyProduct");

  // Echte Amazon-Gesamtzahlen parallel zum Review-Scrape holen (D74): die
  // Stichprobe (je Klasse gedeckelt) muss neben der Wahrheit stehen.
  const totalsPromise = product.asin
    ? scrapeProduct(product.asin, product.marketplace, { timeoutSec: 50 }).catch(() => null)
    : Promise.resolve(null);

  let reviews: Array<{ asin: string; rating: number; title: string; body: string }> = [];
  let notes: string[] = [];
  let source: "apify" | "mock" = "apify";
  try {
    ({ reviews, notes } = await scrapeReviews(asins, { domain: product.marketplace }));
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
      redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`Review-Scrape: ${msg}`)}#reviews`);
    }
  }
  if (reviews.length === 0) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent("Review-Scrape: 0 Reviews gefunden — ASIN prüfen (neues Produkt ohne Bewertungen?).")}#reviews`);
  }

  const starCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const perAsin: Record<string, number> = {};
  for (const r of reviews) {
    const star = String(Math.min(5, Math.max(1, Math.round(r.rating))));
    starCounts[star] += 1;
    perAsin[r.asin] = (perAsin[r.asin] ?? 0) + 1;
  }

  // Wahrheit neben die Stichprobe stellen (D74): Live-Zahlen; wenn der Lauf
  // scheitert, Fallback auf den letzten Listing-Import (mit dessen Datum).
  let amazonTotals: { reviewsTotal: number | null; ratingAvg: number | null; dist: Record<string, number> | null; asOf: string } | null = null;
  const live = source === "apify" ? await totalsPromise : null;
  if (live && (live.reviewsTotal !== null || live.ratingAvg !== null)) {
    amazonTotals = { reviewsTotal: live.reviewsTotal, ratingAvg: live.ratingAvg, dist: live.ratingDist, asOf: new Date().toISOString() };
  } else if (source === "apify") {
    const snap = await db.query.listingSnapshots.findFirst({
      where: eq(schema.listingSnapshots.productId, productId),
      orderBy: desc(schema.listingSnapshots.createdAt),
    });
    if (snap && (snap.reviewsTotal !== null || snap.ratingAvg !== null)) {
      amazonTotals = { reviewsTotal: snap.reviewsTotal, ratingAvg: snap.ratingAvg, dist: snap.ratingDist, asOf: snap.createdAt.toISOString() };
    } else {
      notes = [...notes, "Amazon-Gesamtzahlen (Bewertungen gesamt, Ø) konnten nicht geladen werden — Anzeige zeigt nur die Stichprobe."];
    }
  }

  await db.insert(schema.reviewScrapes).values({ id: id(), productId, source, asins, reviews, starCounts, perAsin, notes, amazonTotals });
  revalidatePath(`/produkte/${productId}`);
}

export async function analyzeReviewsAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const scrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, productId),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });
  if (!scrape) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent("Erst Reviews scrapen (Schritt 1), dann analysieren.")}#reviews`);
  }

  // Derselbe Scrape wird nie doppelt analysiert (D79) — direkt zum Dashboard.
  // Altbestand ohne scrapeId: Analyse nach dem Scrape gilt als dessen Analyse.
  const existing = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, productId),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  if (existing && (existing.scrapeId === scrape!.id || (!existing.scrapeId && existing.createdAt > scrape!.createdAt))) {
    redirect(`/produkte/${productId}/reviews`);
  }

  const { extractInsights } = await import("@/lib/reviews/apify");
  const dataBasis = scrape!.source === "apify" ? "apify_scrape" : "none";
  try {
    const res = await extractInsights(
      scrape!.reviews,
      scrape!.asins.map((a) => `amazon.${product.marketplace}/dp/${a}`),
      dataBasis,
    );
    await db.insert(schema.reviewInsights).values({
      id: id(), productId, scrapeId: scrape!.id, dataBasis, confidence: res.confidence, payload: res.payload,
    });
  } catch (e) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`Review-Analyse: ${e instanceof Error ? e.message : String(e)}`)}#reviews`);
  }
  revalidatePath(`/produkte/${productId}`);
  redirect(`/produkte/${productId}/reviews`);
}

/**
 * Tiefen-Audit (D76): umfassende 8-Dimensionen-Analyse nach temoa-audit-Spec.
 * Pflicht-Datenbasis: Listing-Inhalt (Import oder eigene Versionen) UND eine
 * Bewertungs-Analyse dieses Produkts (optional inkl. Wettbewerber-ASINs) —
 * USPs & Zielgruppe werden aus echten Daten HERGELEITET, nie getippt.
 */
export async function runDeepAuditAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;
  const back = (msg: string) => redirect(`/produkte/${productId}/analyse?fehler=${encodeURIComponent(msg)}`);

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
  const description = (latest("description")?.text as string) || snapshot?.description || "";
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
  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
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
      redirect(`/produkte/${productId}/analyse?hinweis=${encodeURIComponent("Die Datenbasis ist seit dem letzten Tiefen-Audit unverändert — das Ergebnis unten ist aktuell. Neu bewerten wird nach neuem Import, Scrape, Analyse oder Content wieder frei.")}`);
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
    back(`Tiefen-Audit: ${e instanceof Error ? e.message : String(e)}`);
  }
  revalidatePath(`/produkte/${productId}/analyse`);
  revalidatePath(`/produkte/${productId}`);
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
    const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, product.id) });
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

export async function importListingFromAmazon(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product?.asin) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent("Produkt hat keine ASIN — Import nicht möglich.")}`);
  }

  // Redundanz-Guard (D81): erfolgreicher Import jünger als 24 h → kein Doppel-Import
  const lastSnap = await db.query.listingSnapshots.findFirst({
    where: eq(schema.listingSnapshots.productId, productId),
    orderBy: desc(schema.listingSnapshots.createdAt),
  });
  if (lastSnap && lastSnap.source === "apify" && Date.now() - lastSnap.createdAt.getTime() < 24 * 60 * 60 * 1000) {
    redirect(`/produkte/${productId}?hinweis=${encodeURIComponent("Das Listing wurde in den letzten 24 h bereits geladen (Stand unten). Amazon-Änderungen sind frühestens morgen sinnvoll neu zu ziehen.")}`);
  }

  // Fehler landen als Banner an der Seite, nie als Server-Fehlerseite (D78)
  const { scrapeProduct } = await import("@/lib/scrape/apifyProduct");
  let snap: Awaited<ReturnType<typeof scrapeProduct>>;
  try {
    snap = await scrapeProduct(product!.asin!, product!.marketplace, { timeoutSec: 50 });
  } catch (e) {
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`Listing-Import: ${e instanceof Error ? e.message : String(e)}`)}`);
  }
  await db.insert(schema.listingSnapshots).values({
    id: id(), productId, source: "apify",
    title: snap!.title, bullets: snap!.bullets, description: snap!.description,
    imageUrls: snap!.imageUrls,
    reviewsTotal: snap!.reviewsTotal, ratingAvg: snap!.ratingAvg, ratingDist: snap!.ratingDist,
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
    redirect(`/produkte/${productId}?fehler=${encodeURIComponent(`CSV-Import: ${e instanceof Error ? e.message : String(e)}`)}`);
  }
  await db.insert(schema.listingSnapshots).values({
    id: id(), productId, source: "h10_csv",
    title: snap!.title, bullets: snap!.bullets, description: snap!.description,
    imageUrls: snap!.imageUrls, raw: snap!.raw,
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
  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) });
  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, productId),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latest = (t: string) => versions.find((v) => v.type === t)?.payload as Record<string, unknown> | undefined;
  const ctx = {
    facts: product.facts,
    primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
    competitorBrands: [],
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
