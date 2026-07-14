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

  const result = await generateSection(section, inputs);

  const dbType = section === "backend" ? "backend_keywords" : section === "highlights" ? "item_highlights" : section;
  const prev = versions.filter((v) => v.type === dbType);
  await db.insert(schema.contentVersions).values({
    id: id(),
    productId,
    type: dbType as "title" | "bullets" | "item_highlights" | "description" | "backend_keywords" | "qa",
    version: (prev[0]?.version ?? 0) + 1,
    payload: result.payload,
    status: "draft",
    validation: {
      passed: !result.issues.some((i) => i.severity === "error"),
      issues: result.issues,
      checkedAt: new Date().toISOString(),
    },
    generatedBy: `${result.provider}:${result.model}`,
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

export async function runReviewInsights(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const competitorAsins = String(formData.get("competitorAsins") ?? "")
    .split(/[\s,;]+/).filter(Boolean);
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return;

  const { scrapeReviews, extractInsights } = await import("@/lib/reviews/apify");
  const asins = [product.asin, ...competitorAsins].filter(Boolean) as string[];

  let payload, confidence = "low", dataBasis = "apify_scrape", errorMsg: string | null = null;
  try {
    const reviews = await scrapeReviews(asins, { domain: product.marketplace });
    const res = await extractInsights(reviews, asins.map((a) => `amazon.${product.marketplace}/dp/${a}`), dataBasis);
    payload = res.payload;
    confidence = res.confidence;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
    // Ohne APIFY_API_KEY: Mock-Insights, klar gekennzeichnet (Dev-Modus)
    if (errorMsg.includes("APIFY_API_KEY")) {
      const res = await extractInsights([], ["mock"], "none");
      payload = res.payload;
      dataBasis = "none";
      errorMsg = null;
    }
  }
  if (payload) {
    await db.insert(schema.reviewInsights).values({
      id: id(), productId, dataBasis, confidence, payload,
    });
  }
  revalidatePath(`/produkte/${productId}`);
  if (errorMsg) throw new Error(errorMsg);
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
  const adsTotals = (adsUpload?.parsed as { totals?: import("@/lib/reports/ads").AdsTotals })?.totals ?? null;
  if (adsTotals && adsTotals.noSaleSpend > 0) {
    fresh.push({
      id: id(), brandId, productId: null, scope: "brand",
      category: "ppc",
      title: `${adsTotals.noSaleCount} Kampagnen mit Spend ohne Verkäufe prüfen (pausieren/negativieren)`,
      source: "ads-bericht", upliftEur: Math.round(adsTotals.noSaleSpend), status: "open",
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
  if (!product?.asin) throw new Error("Produkt hat keine ASIN — Import nicht möglich.");

  const { scrapeProduct } = await import("@/lib/scrape/apifyProduct");
  const snap = await scrapeProduct(product.asin, product.marketplace);
  await db.insert(schema.listingSnapshots).values({
    id: id(), productId, source: "apify",
    title: snap.title, bullets: snap.bullets, description: snap.description,
    imageUrls: snap.imageUrls, raw: snap.raw,
  });
  revalidatePath(`/produkte/${productId}`);
}

export async function uploadListingCsv(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const file = formData.get("file") as File | null;
  if (!productId || !file) return;
  const db = await getDb();
  const { parseListingCsv } = await import("@/lib/scrape/apifyProduct");
  const snap = parseListingCsv(await file.text());
  await db.insert(schema.listingSnapshots).values({
    id: id(), productId, source: "h10_csv",
    title: snap.title, bullets: snap.bullets, description: snap.description,
    imageUrls: snap.imageUrls, raw: snap.raw,
  });
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
    } else {
      throw new Error(`Berichtstyp "${reportType}" folgt — aktuell: Business Report & Ads-Bericht (SQP/Search-Term in Arbeit).`);
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
