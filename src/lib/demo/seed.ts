/**
 * Demo & Zurücksetzen (D65): Wipe aller Marken-Daten (Nutzer-Konten und
 * Rechenwerk-Einstellungen bleiben) + Seed einer Dummy-Marke mit Monatsdaten
 * ab 01.01.2026. WICHTIG: Die Demo-Daten werden als CSV erzeugt und durch
 * die ECHTEN Parser geschickt — was im Tool steht, ist exakt das, was auch
 * reale Uploads erzeugen würden (kein zweiter Datenpfad).
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { parseBusinessReport } from "@/lib/reports/business";
import { parseAdsReport } from "@/lib/reports/ads";
import { parseSearchTermReport } from "@/lib/reports/searchterm";
import { parseSqpReport } from "@/lib/reports/sqp";
import { parseCerebroCsv, computeSovAudit } from "@/lib/sov/audit";
import { deriveKeywordTiers } from "@/lib/sov/tiering";
import { computeMargin } from "@/lib/margin/calc";
import { validateTitle, validateBullets } from "@/lib/validation/gate";
import type { ValidationIssue, ValidationReport } from "@/db/schema";

const report = (issues: ValidationIssue[]): ValidationReport => ({
  passed: !issues.some((i) => i.severity === "error"),
  issues,
  checkedAt: new Date().toISOString(),
});

type Db = Awaited<ReturnType<typeof getDb>>;
const id = () => randomUUID();
const de = (n: number, digits = 2) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** Alles Marken-bezogene leeren — explizit je Tabelle (keine FK-PRAGMA-Annahme). */
export async function wipeAllBrandData(db: Db): Promise<void> {
  await db.delete(schema.keywords);
  await db.delete(schema.contentVersions);
  await db.delete(schema.reviewInsights);
  await db.delete(schema.listingSnapshots);
  await db.delete(schema.actions);
  await db.delete(schema.reportUploads);
  await db.delete(schema.flatfileTemplates);
  await db.delete(schema.productGroups);
  await db.delete(schema.products);
  await db.delete(schema.brands);
  await db.delete(schema.clients);
}

// ── Demo-Story 2026: Wachstum mit steigender Werbeabhängigkeit + Buybox-Delle im April ──

const PRODUCTS = [
  { asin: "B0DEMO1L01", sku: "AV-1L-EDST", name: "AquaVita Trinkflasche 1L Edelstahl", share: 0.52, price: 24.9 },
  { asin: "B0DEMO05L2", sku: "AV-05L-EDST", name: "AquaVita Trinkflasche 0,5L Edelstahl", share: 0.31, price: 19.9 },
  { asin: "B0DEMOTB03", sku: "AV-TB-400", name: "AquaVita Thermobecher 400ml", share: 0.17, price: 22.9 },
];

const MONTHS: Array<{
  start: string; end: string;
  sessions: number; revenue: number; orders: number; buybox: number;
  spend: number; ppcSales: number; ppcOrders: number; clicks: number; impressions: number;
}> = [
  { start: "2026-01-01", end: "2026-01-31", sessions: 14200, revenue: 18400, orders: 780, buybox: 93.1, spend: 1150, ppcSales: 4620, ppcOrders: 205, clicks: 3850, impressions: 322000 },
  { start: "2026-02-01", end: "2026-02-28", sessions: 15100, revenue: 19900, orders: 830, buybox: 92.6, spend: 1240, ppcSales: 4980, ppcOrders: 222, clicks: 4090, impressions: 341000 },
  { start: "2026-03-01", end: "2026-03-31", sessions: 16800, revenue: 20600, orders: 852, buybox: 92.2, spend: 1420, ppcSales: 5260, ppcOrders: 238, clicks: 4480, impressions: 371000 },
  { start: "2026-04-01", end: "2026-04-30", sessions: 17900, revenue: 23800, orders: 985, buybox: 84.3, spend: 1660, ppcSales: 6110, ppcOrders: 271, clicks: 4990, impressions: 402000 },
  { start: "2026-05-01", end: "2026-05-31", sessions: 19300, revenue: 27100, orders: 1105, buybox: 91.8, spend: 1880, ppcSales: 7050, ppcOrders: 312, clicks: 5480, impressions: 438000 },
  { start: "2026-06-01", end: "2026-06-30", sessions: 20800, revenue: 31200, orders: 1260, buybox: 92.4, spend: 2250, ppcSales: 8280, ppcOrders: 365, clicks: 6010, impressions: 476000 },
];

function businessCsv(m: (typeof MONTHS)[number]): string {
  const header = "(Untergeordnete) ASIN;Titel;Sitzungen – Gesamt;Seitenaufrufe – Gesamt;Prozentsatz Einkaufswagen;Bestellte Einheiten;Bestellposten gesamt;Umsätze – Bestellte Artikel";
  const rows = PRODUCTS.map((p) => {
    const sessions = Math.round(m.sessions * p.share);
    const orders = Math.round(m.orders * p.share);
    const units = Math.round(orders * 1.06);
    const revenue = m.revenue * p.share;
    return `${p.asin};${p.name};"${de(sessions, 0)}";"${de(sessions * 1.45, 0)}";"${de(m.buybox, 1)}";${units};${orders};"${de(revenue)}"`;
  });
  return [header, ...rows].join("\n");
}

function adsCsv(m: (typeof MONTHS)[number]): string {
  const header = "Kampagnenname;Kampagnen-ID;Typ;Status;Portfolio;Impressionen;Klicks;Ausgaben;Verkäufe;Bestellungen";
  const split = [
    { name: "AV-DE-1L-Exact", id: "9001", typ: "SP", portfolio: "ACoS Ziel 15%", anteil: 0.44 },
    { name: "AV-DE-Broad-Katalog", id: "9002", typ: "SP", portfolio: "ACoS Ziel 20%", anteil: 0.3 },
    { name: "AV-DE-Brand-Video", id: "9003", typ: "SB2", portfolio: "Max Conversion", anteil: 0.18 },
    { name: "AV-DE-Display-Retarget", id: "9004", typ: "SD", portfolio: "", anteil: 0.08 },
  ];
  const rows = split.map((c, i) => {
    const spend = m.spend * c.anteil;
    // Retargeting läuft leer — liefert die No-Sale-Handlung in der Demo
    const sales = i === 3 ? 0 : m.ppcSales * (c.anteil / 0.92);
    const orders = i === 3 ? 0 : Math.round(m.ppcOrders * (c.anteil / 0.92));
    return `${c.name};${c.id};${c.typ};aktiviert;${c.portfolio};"${de(m.impressions * c.anteil, 0)}";${Math.round(m.clicks * c.anteil)};"${de(spend)} €";"${de(sales)} €";${orders}`;
  });
  return [header, ...rows].join("\n");
}

const SEARCHTERM_CSV = [
  "Kampagnenname;Übereinstimmungstyp;Suchbegriff eines Kunden;Impressionen;Klicks;Ausgaben;7 Tage, Verkäufe gesamt;7 Tage, Bestellungen gesamt;7 Tage, verkaufte Einheiten gesamt",
  'AV-DE-1L-Exact;EXACT;edelstahl trinkflasche 1l;"98.000";1.480;"612,40";"2.890,00";128;134',
  'AV-DE-Broad-Katalog;BROAD;trinkflasche edelstahl auslaufsicher;"71.000";1.050;"438,10";"1.980,50";88;92',
  'AV-DE-Broad-Katalog;BROAD;trinkflasche kohlensäure geeignet;"44.000";640;"262,00";"1.140,00";51;53',
  'AV-DE-Broad-Katalog;BROAD;thermobecher to go;"31.000";420;"171,90";"640,00";29;30',
  'AV-DE-Broad-Katalog;BROAD;glasflasche mit hülle;"18.000";260;"118,40";"0,00";0;0',
  'AV-DE-Broad-Katalog;BROAD;plastikflasche sport billig;"12.500";175;"73,20";"0,00";0;0',
  'AV-DE-Broad-Katalog;-;b0kkurenz1;"6.200";88;"41,70";"0,00";0;0',
  'AV-DE-1L-Exact;EXACT;trinkflasche kinder;"9.800";150;"48,90";"210,00";9;9',
].join("\n");

const SQP_CSV = [
  '"Marke=[""AquaVita""],Berichtszeitraum=[""Monatlich""],Jahr auswählen=[""2026""],Monat auswählen=[""Juni""]"',
  '"Suchabfrage","Volumen der Suchabfrage","Eindrücke: Gesamtanzahl","Eindrücke: Markenanzahl","Eindrücke: Markenanteil %","Klicks: Gesamtanzahl","Klicks: Klickrate %","Klicks: Markenanzahl","Klicks: Markenanteil %","In den Einkaufswagen: Gesamtanzahl","In den Einkaufswagen: Markenanzahl","Käufe: Gesamtanzahl","Käufe: Markenanzahl","Käufe: Preis (Median)","Käufe: Markenpreis (Median)"',
  '"edelstahl trinkflasche","20400","46800","6100","13.03","4210","9.00","710","16.86","1690","210","1080","112","23.50","24.90"',
  '"trinkflasche 1l","11200","27100","2480","9.15","2370","8.75","355","14.98","930","112","585","58","21.90","24.90"',
  '"thermosflasche edelstahl","9100","22000","1050","4.77","1980","9.00","162","8.18","790","47","488","26","24.00","24.90"',
  '"thermobecher","7400","17800","1990","11.18","1580","8.88","295","18.67","630","96","395","69","21.50","22.90"',
  '"trinkflasche kohlensäure","6900","16600","1900","11.45","1470","8.86","275","18.71","590","90","368","64","23.00","24.90"',
].join("\n");

const CEREBRO_CSV = [
  "Keyword Phrase,Search Volume,Position (Rank),Keyword Sales,CPR,B0DEMO1L01,B0KONKURR1,B0KONKURR2",
  "edelstahl trinkflasche,20400,9,410,66,9,3,15",
  "trinkflasche 1l,11200,14,205,49,14,6,22",
  "thermosflasche edelstahl,9100,0,170,54,0,4,11",
  "trinkflasche kohlensäure geeignet,6900,7,132,41,7,18,25",
  "trinkflasche edelstahl auslaufsicher,5600,5,118,38,5,12,9",
  "trinkflasche spülmaschinenfest,4300,17,84,34,17,8,14",
  "trinkflasche sport,3800,26,66,31,26,10,7",
  "isolierflasche 1 liter,2900,11,58,27,11,5,19",
  "wasserflasche edelstahl,2400,8,47,24,8,16,6",
  "trinkflasche büro,1900,21,36,21,21,13,10",
  "trinkflasche kinder schule,1600,0,31,19,0,7,4",
  "flasche ohne plastik,1300,6,26,17,6,9,12",
  "konkurrenzmarke alternative,1100,0,22,16,0,2,3",
  "trinkflasche 750ml,1000,15,20,18,15,11,8",
].join("\n");

export async function seedDemoBrand(db: Db): Promise<{ brandId: string }> {
  const clientId = id();
  await db.insert(schema.clients).values({ id: clientId, name: "Demo Kunde GmbH", slug: "demo-kunde" });
  const brandId = id();
  await db.insert(schema.brands).values({ id: brandId, clientId, name: "AquaVita (Demo)" });

  // Produkte mit Produkt-Wahrheit
  const productIds: string[] = [];
  for (const p of PRODUCTS) {
    const pid = id();
    productIds.push(pid);
    await db.insert(schema.products).values({
      id: pid,
      brandId,
      asin: p.asin,
      marketplace: "de",
      name: p.name,
      price: Math.round(p.price * 100),
      facts: {
        productType: p.name.includes("Thermobecher") ? "Thermobecher" : "Trinkflasche",
        materials: ["Edelstahl 18/8", "Silikon-Dichtung (BPA-frei)"],
        dimensions: p.name.includes("1L") ? "1000 ml" : p.name.includes("0,5L") ? "500 ml" : "400 ml",
        usps: ["100 % auslaufsicher auch bei Kohlensäure", "24 h kalt / 12 h warm isoliert", "spülmaschinenfest"],
        targetAudience: "Sport, Büro und Outdoor",
        certifications: ["LFGB-geprüft"],
      },
    });
  }

  // Monats-Berichte Jan–Jun 2026 durch die ECHTEN Parser
  for (const m of MONTHS) {
    await db.insert(schema.reportUploads).values({
      id: id(), brandId, reportType: "business",
      fileName: `demo-business-${m.start.slice(0, 7)}.csv`,
      periodStart: new Date(m.start), periodEnd: new Date(m.end),
      parsed: parseBusinessReport(businessCsv(m)), parseStatus: "ok", parseError: null,
    });
    await db.insert(schema.reportUploads).values({
      id: id(), brandId, reportType: "ads",
      fileName: `demo-ads-${m.start.slice(0, 7)}.csv`,
      periodStart: new Date(m.start), periodEnd: new Date(m.end),
      parsed: parseAdsReport(adsCsv(m)), parseStatus: "ok", parseError: null,
    });
  }
  await db.insert(schema.reportUploads).values({
    id: id(), brandId, reportType: "searchterm",
    fileName: "demo-searchterm-2026-06.csv",
    periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"),
    parsed: parseSearchTermReport(SEARCHTERM_CSV), parseStatus: "ok", parseError: null,
  });
  await db.insert(schema.reportUploads).values({
    id: id(), brandId, reportType: "sqp",
    fileName: "demo-sqp-2026-06.csv",
    periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"),
    parsed: parseSqpReport(SQP_CSV), parseStatus: "ok", parseError: null,
  });

  // SOV-Audit fürs Hauptprodukt + Keyword-Tiering daraus
  const audit = computeSovAudit(parseCerebroCsv(CEREBRO_CSV, PRODUCTS[0].asin), { price: PRODUCTS[0].price, mainAsin: PRODUCTS[0].asin });
  await db.insert(schema.reportUploads).values({
    id: id(), brandId, reportType: "cerebro",
    fileName: "demo-cerebro-1l.csv", marketplace: "de",
    parsed: { productId: productIds[0], audit }, parseStatus: "ok", parseError: null,
  });
  const { tiered } = deriveKeywordTiers(audit);
  if (tiered.length) {
    await db.insert(schema.keywords).values(
      tiered.map((k) => ({ id: id(), productId: productIds[0], keyword: k.keyword, searchVolume: k.searchVolume, tier: k.tier, source: "cerebro" })),
    );
  }

  // Gate-validierter Content fürs Hauptprodukt (Titel freigegeben)
  const title = "AquaVita Edelstahl Trinkflasche 1L auslaufsicher – Kohlensäure geeignet, 24h";
  const bullets = [
    "100 % AUSLAUFSICHER: Der Schraubdeckel mit BPA-freier Silikon-Dichtung hält auch Kohlensäure sicher — getestet für Tasche, Rucksack und Auto.",
    "24H KALT / 12H WARM: Die doppelwandige Vakuum-Isolierung aus Edelstahl 18/8 hält Getränke den ganzen Arbeitstag auf Temperatur.",
    "SPÜLMASCHINENFEST: Flasche und Deckel dürfen in die Maschine — kein mühsames Bürsten, keine Restgerüche, jeden Tag frischer Geschmack.",
    "FÜR SPORT, BÜRO & OUTDOOR: 1 Liter Volumen deckt Training, Meetings und Touren ab; die Dosieröffnung verhindert Verschütten beim Trinken.",
    "LFGB-GEPRÜFT & PLASTIKFREI TRINKEN: Lebensmittelechter Edelstahl ohne Beschichtung — geschmacksneutral, langlebig, verantwortungsvoll.",
  ];
  await db.insert(schema.contentVersions).values({
    id: id(), productId: productIds[0], type: "title", version: 1, status: "approved",
    payload: { text: title, rationale: [{ part: "auslaufsicher – Kohlensäure geeignet", source: "USP #1 aus der Produkt-Wahrheit", verified: true }] },
    validation: report(validateTitle(title, { primaryKeywords: ["edelstahl trinkflasche", "trinkflasche 1l"] })),
    generatedBy: "seed:demo",
  });
  await db.insert(schema.contentVersions).values({
    id: id(), productId: productIds[0], type: "bullets", version: 1, status: "draft",
    payload: { items: bullets },
    validation: report(validateBullets(bullets, { facts: { usps: ["100 % auslaufsicher auch bei Kohlensäure", "24 h kalt / 12 h warm isoliert", "spülmaschinenfest"] } })),
    generatedBy: "seed:demo",
  });

  // Margen-Kalkulation fürs Hauptprodukt → Break-even-ACoS speist die Ampel
  const marginInputs = {
    purchasePrice: 4.1, packagingCost: 0.55, logisticsCost: 0.62, qualityInspection: 0.1,
    fbaShippingFee: 3.95, sellingPriceGross: PRODUCTS[0].price, orderQty: 500, vatRate: 0.19,
    category: "Alles andere", customsRate: 0.03, returnRate: 0.06, disposalShare: 0.2,
    dims: { l: 11, w: 11, h: 30 }, weightG: 620,
  };
  await db
    .update(schema.products)
    .set({ marginCalc: { inputs: marginInputs, results: computeMargin(marginInputs) } })
    .where(eq(schema.products.id, productIds[0]));

  return { brandId };
}
