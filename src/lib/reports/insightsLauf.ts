import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { amazonDomain } from "@/lib/text/sprache";
import { normalisierePayload } from "@/lib/reviews/insights";
import { analyzeListing, wirksamesListing } from "@/lib/analysis/listingAudit";
import { snapshotBildBelege } from "@/lib/analysis/bildAuslese";
import { baueInsightsReport, pruefeInsightsReport, type InsightsReportPayload } from "@/lib/reports/insightsDokument";

/**
 * Erzeugung des Insights-Dokuments (D267) — sammelt die vorhandenen
 * Analyse-Zeilen, projiziert sie deterministisch und friert das Ergebnis ein.
 *
 * Kein LLM. Scheitert das Gate, entsteht KEIN Report: ein halbes Dokument beim
 * Kunden wäre schlimmer als keines (D182).
 */

export type LaufErgebnis =
  | { ok: true; token: string; version: number; payload: InsightsReportPayload }
  | { ok: false; grund: string; verstoesse?: string[] };

const neuerToken = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");

export async function erzeugeInsightsReport(productId: string): Promise<LaufErgebnis> {
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, productId) });
  if (!product) return { ok: false, grund: "Produkt nicht gefunden." };

  const [driverLauf, insightRow, snapshot, scrape, versionen, kws, vorhandene] = await Promise.all([
    db.query.conversionDrivers.findFirst({
      where: eq(schema.conversionDrivers.productId, productId),
      orderBy: desc(schema.conversionDrivers.createdAt),
    }),
    db.query.reviewInsights.findFirst({
      where: eq(schema.reviewInsights.productId, productId),
      orderBy: desc(schema.reviewInsights.createdAt),
    }),
    db.query.listingSnapshots.findFirst({
      where: eq(schema.listingSnapshots.productId, productId),
      orderBy: desc(schema.listingSnapshots.createdAt),
    }),
    db.query.reviewScrapes.findFirst({
      where: eq(schema.reviewScrapes.productId, productId),
      orderBy: desc(schema.reviewScrapes.createdAt),
    }),
    db.query.contentVersions.findMany({ where: eq(schema.contentVersions.productId, productId) }),
    db.query.keywords.findMany({ where: eq(schema.keywords.productId, productId) }),
    db.query.insightsReports.findMany({
      where: eq(schema.insightsReports.productId, productId),
      orderBy: desc(schema.insightsReports.version),
    }),
  ]);

  if (!driverLauf) {
    return {
      ok: false,
      grund:
        "Das Insights-Dokument braucht den Conversion-Driver-Lauf — es ist eine Projektion davon, keine eigene Analyse. Bitte den Analyse-Lauf durchlaufen lassen.",
    };
  }

  const insights = insightRow ? normalisierePayload(insightRow.payload) : null;

  // Dieselbe Mess-Basis wie die Listing-Kontrolle im Tool (D110): freigegebene
  // Texte, sonst das importierte Original — nie Entwürfe.
  const { snapshot: wirksam } = wirksamesListing(versionen, snapshot ?? null);
  const analysis = snapshot
    ? analyzeListing({
        snapshot: wirksam,
        facts: product.facts,
        primaryKeywords: kws.filter((k) => k.tier === "primary" && !k.ausgeschlossen).map((k) => k.keyword),
        sovAudit: null, // SOV-€-Zahlen bleiben aus dem Kundendokument (Nutzer-Entscheidung)
        reviewInsights: insightRow?.payload ?? null,
        bildBelege: snapshotBildBelege(snapshot),
      })
    : null;

  const normAsin = (a: string) => a.trim().toUpperCase();
  const wettbewerberAsins = (scrape?.asins ?? [])
    .map(normAsin)
    .filter((a) => !product.asin || a !== normAsin(product.asin)).length;

  // Bild-Noten + „wie besser" je Slot — damit werden aus Bildlücken fertige
  // Handlungsempfehlungen statt allgemeiner Ideen (verwertet bilderText.faktoren).
  const bilder = (snapshot?.bilderText ?? []).map((b) => ({
    slot: b.slot,
    design: b.faktoren?.design?.score ?? null,
    botschaft: b.faktoren?.message?.score ?? null,
    klarheit: b.faktoren?.clarity?.score ?? null,
    wieBesser: b.faktoren?.message?.wieBesser || b.faktoren?.clarity?.wieBesser || undefined,
  }));

  const payload = baueInsightsReport({
    produktName: product.name,
    asin: product.asin ?? null,
    marktplatz: `amazon.${amazonDomain(product.marketplace)}`,
    stand: driverLauf.createdAt,
    driver: driverLauf.payload,
    insights,
    analysis,
    /**
     * USPs fürs Kunden-Dokument (D277). Quelle ist die gepflegte Produkt-Wahrheit
     * (`facts.usps`) — dort landen auch die vom Tiefen-Audit abgeleiteten USPs
     * (actions.ts füllt `facts.usps` aus `deepAudit.derived.usps`, wenn leer).
     * Damit gibt es EINE Quelle statt zweier konkurrierender Listen.
     */
    usps: product.facts.usps ?? [],
    amazonTotals: scrape?.amazonTotals
      ? { reviewsTotal: scrape.amazonTotals.reviewsTotal, ratingAvg: scrape.amazonTotals.ratingAvg }
      : snapshot
        ? { reviewsTotal: snapshot.reviewsTotal, ratingAvg: snapshot.ratingAvg }
        : null,
    wettbewerberAsins,
    bilder,
    keywordsMitVolumen: kws.filter((k) => !k.ausgeschlossen && (k.searchVolume ?? 0) > 0).length,
  });

  const gate = pruefeInsightsReport(payload);
  if (!gate.ok) {
    return {
      ok: false,
      grund: "Das Dokument hat das Auslieferungs-Gate nicht passiert — es wurde NICHT gespeichert.",
      verstoesse: gate.verstoesse,
    };
  }

  const version = (vorhandene[0]?.version ?? 0) + 1;
  const token = neuerToken();
  await db.insert(schema.insightsReports).values({
    id: crypto.randomUUID(),
    productId,
    token,
    payload,
    version,
    createdAt: new Date(),
  });

  return { ok: true, token, version, payload };
}

/** Lesen für die öffentliche Seite — abgelaufene Links werden ehrlich abgewiesen. */
export async function ladeInsightsReport(
  tokenWert: string,
): Promise<{ ok: true; payload: InsightsReportPayload; version: number } | { ok: false; grund: string }> {
  const db = await getDb();
  const row = await db.query.insightsReports.findFirst({ where: eq(schema.insightsReports.token, tokenWert) });
  if (!row) return { ok: false, grund: "Dieser Link ist ungültig." };
  if (row.expiresAt && row.expiresAt.getTime() < Date.now())
    return { ok: false, grund: `Dieser Link ist am ${row.expiresAt.toLocaleDateString("de-DE")} abgelaufen.` };
  return { ok: true, payload: row.payload, version: row.version };
}
