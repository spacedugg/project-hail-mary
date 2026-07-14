/**
 * Search-Query-Performance-Parser (Brand Analytics „Suchanfragenleistung").
 * Portiert nach reporting-main-Golden-Werten (§4 SQP-Parser/-Metrics) +
 * temoa-tools-beta §4.2 (Spaltennamen, Meta-Zeile):
 * - Zeile 1 ist METADATEN (Marke=["…"], Berichtszeitraum/Woche), Zeile 2 Header
 * - parseNumber: ""/"-" → null; „41.18"→41,18; „16,95 €"→16,95; „5,02 %"→5,02;
 *   „1.234,56"→1234,56 — nie NaN
 * - Metriken je Query: CTR/CVR Marke vs. Markt aus Rohwerten;
 *   lostPurchases = max(0, Markt-CVR × eigene Klicks − eigene Käufe);
 *   revenuePotential = lostPurchases × Preis; null (nicht NaN) bei 0-Nennern
 * - Report-Ebene: Raten aus SUMMEN, nie Zeilen-Mittelwerte
 */

import { parseCsvLine } from "./business";

export type SqpRow = {
  query: string;
  volume: number;
  imprTotal: number;
  imprBrand: number;
  imprShare: number | null; // %
  clicksTotal: number;
  clicksBrand: number;
  clickShare: number | null; // %
  cartAddsTotal: number;
  cartAddsBrand: number;
  purchasesTotal: number;
  purchasesBrand: number;
  price: number | null; // Median-Kaufpreis (Marke, Fallback Markt)
  // abgeleitet (aus Rohwerten):
  brandCtr: number | null; // %
  marketCtr: number | null;
  brandCvr: number | null; // Käufe/Klicks, %
  marketCvr: number | null;
  cvrDeltaPp: number | null;
  lostPurchases: number;
  revenuePotential: number; // €
};

export type SqpReport = {
  meta: { brand: string | null; period: string | null };
  rows: SqpRow[];
  totals: {
    volume: number;
    imprBrand: number;
    clicksBrand: number;
    purchasesBrand: number;
    brandCtr: number | null;
    marketCtr: number | null;
    brandCvr: number | null; // aus Summen
    marketCvr: number | null;
    brandRevenue: number; // geschätzt: Käufe × Preis
    totalPotential: number; // Summe revenuePotential
    rowCount: number;
  };
};

/** ""/"-" → null; deutsche UND US-Notation je Zelle erkannt; nie NaN. */
export function parseSqpNumber(s: string | undefined): number | null {
  if (s === undefined) return null;
  let t = s.replace(/[€%\s ]/g, "").replace(/"/g, "");
  if (t === "" || t === "-" || t === "–") return null;
  const hasDot = t.includes("."), hasComma = t.includes(",");
  if (hasDot && hasComma) {
    // letztes Trennzeichen ist das Dezimalzeichen („1.234,56" / „1,234.56")
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (hasComma) {
    t = t.replace(",", ".");
  } // nur Punkt: dot-decimal (SQP-Export, temoa-tools-beta §4.2)
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

const pct = (num: number, den: number, digits = 2) =>
  den > 0 ? Math.round((num / den) * 100 * 10 ** digits) / 10 ** digits : null;

export function parseSqpReport(text: string): SqpReport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 3) throw new Error("Report zu kurz — Meta-Zeile + Header + Datenzeilen erwartet.");

  // Zeile 1 = Metadaten („Marke=["HaA"],Berichtszeitraum=["Monatlich"]…");
  // CSV-escapte Anführungszeichen ("") vor dem Regex-Zugriff entschärfen
  const metaLine = lines[0].replace(/""/g, '"');
  const brand = metaLine.match(/Marke=\["([^"]+)"\]/)?.[1] ?? null;
  const period =
    metaLine.match(/Woche\s*(\d+)/)?.[0] ??
    (metaLine.match(/Monat auswählen=\["([^"]+)"\]/)?.[1] && metaLine.match(/Jahr auswählen=\["([^"]+)"\]/)?.[1]
      ? `${metaLine.match(/Monat auswählen=\["([^"]+)"\]/)![1]} ${metaLine.match(/Jahr auswählen=\["([^"]+)"\]/)![1]}`
      : null);
  const headerLineIdx = /suchabfrage|suchanfrage|search query/i.test(metaLine) ? 0 : 1;

  const sep = (lines[headerLineIdx].match(/;/g)?.length ?? 0) > (lines[headerLineIdx].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = parseCsvLine(lines[headerLineIdx], sep).map((h) => h.toLowerCase().replace(/["\s]+/g, " ").trim());
  const find = (...needles: string[]) => {
    for (const n of needles) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  // Kategorie-Präfixe variieren („Eindrücke:"/„Impressionen:", mit/ohne Doppelpunkt)
  const qIdx = find("suchabfrage", "suchanfrage", "search query");
  if (qIdx === -1) throw new Error('Keine Suchanfrage-Spalte gefunden — ist das der SQP-Export (Markenanalysen → Suchanfragenleistung)?');
  const volIdx = find("volumen", "search query volume");
  const imprTotalIdx = find("eindrücke: gesamt", "impressionen: gesamt", "impressions: total");
  const imprBrandIdx = find("eindrücke: markenanzahl", "impressionen: markenanzahl", "impressions: brand count");
  const imprShareIdx = find("eindrücke: markenanteil", "impressionen: markenanteil", "impressions: brand share");
  const clicksTotalIdx = find("klicks: gesamt", "clicks: total");
  const clicksBrandIdx = find("klicks: markenanzahl", "clicks: brand count");
  const clickShareIdx = find("klicks: markenanteil", "clicks: brand share");
  const cartTotalIdx = find("einkaufswagen: gesamt", "cart adds: total");
  const cartBrandIdx = find("einkaufswagen: markenanzahl", "cart adds: brand count");
  const purchTotalIdx = find("käufe: gesamt", "purchases: total");
  const purchBrandIdx = find("käufe: markenanzahl", "purchases: brand count");
  const priceBrandIdx = find("käufe: markenpreis", "purchases: brand price");
  const priceTotalIdx = find("käufe: preis", "purchases: price", "klicks: preis", "clicks: price");
  if (imprTotalIdx === -1 || clicksTotalIdx === -1 || purchTotalIdx === -1)
    throw new Error("Pflicht-Spalten fehlen (Eindrücke/Klicks/Käufe: Gesamtanzahl).");

  const n0 = (c: string[] | undefined, i: number) => (i >= 0 && c ? (parseSqpNumber(c[i]) ?? 0) : 0);

  const rows: SqpRow[] = lines
    .slice(headerLineIdx + 1)
    .map((l) => parseCsvLine(l, sep))
    .filter((c) => (c[qIdx] ?? "").trim())
    .map((c) => {
      const clicksBrand = n0(c, clicksBrandIdx);
      const purchasesBrand = n0(c, purchBrandIdx);
      const clicksTotal = n0(c, clicksTotalIdx);
      const purchasesTotal = n0(c, purchTotalIdx);
      const imprBrand = n0(c, imprBrandIdx);
      const imprTotal = n0(c, imprTotalIdx);
      const price = priceBrandIdx >= 0 ? (parseSqpNumber(c[priceBrandIdx]) ?? parseSqpNumber(c[priceTotalIdx])) : parseSqpNumber(c[priceTotalIdx]);
      const marketCvr = pct(purchasesTotal, clicksTotal);
      const lost = marketCvr !== null ? Math.max(0, (marketCvr / 100) * clicksBrand - purchasesBrand) : 0;
      return {
        query: (c[qIdx] ?? "").trim(),
        volume: n0(c, volIdx),
        imprTotal,
        imprBrand,
        imprShare: imprShareIdx >= 0 ? parseSqpNumber(c[imprShareIdx]) : pct(imprBrand, imprTotal),
        clicksTotal,
        clicksBrand,
        clickShare: clickShareIdx >= 0 ? parseSqpNumber(c[clickShareIdx]) : pct(clicksBrand, clicksTotal),
        cartAddsTotal: n0(c, cartTotalIdx),
        cartAddsBrand: n0(c, cartBrandIdx),
        purchasesTotal,
        purchasesBrand,
        price,
        brandCtr: pct(clicksBrand, imprBrand),
        marketCtr: pct(clicksTotal, imprTotal),
        brandCvr: pct(purchasesBrand, clicksBrand),
        marketCvr,
        cvrDeltaPp:
          pct(purchasesBrand, clicksBrand) !== null && marketCvr !== null
            ? Math.round(((pct(purchasesBrand, clicksBrand)! - marketCvr)) * 100) / 100
            : null,
        lostPurchases: Math.round(lost * 100) / 100,
        revenuePotential: price !== null ? Math.round(lost * price * 100) / 100 : 0,
      };
    });
  if (rows.length === 0) throw new Error("Keine Datenzeilen gefunden.");

  const sum = (f: (r: SqpRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const imprBrand = sum((r) => r.imprBrand);
  const clicksBrand = sum((r) => r.clicksBrand);
  const purchasesBrand = sum((r) => r.purchasesBrand);

  return {
    meta: { brand, period },
    rows: [...rows].sort((a, b) => b.revenuePotential - a.revenuePotential),
    totals: {
      volume: sum((r) => r.volume),
      imprBrand,
      clicksBrand,
      purchasesBrand,
      brandCtr: pct(clicksBrand, imprBrand),
      marketCtr: pct(sum((r) => r.clicksTotal), sum((r) => r.imprTotal)),
      brandCvr: pct(purchasesBrand, clicksBrand),
      marketCvr: pct(sum((r) => r.purchasesTotal), sum((r) => r.clicksTotal)),
      brandRevenue: Math.round(sum((r) => (r.price !== null ? r.purchasesBrand * r.price : 0)) * 100) / 100,
      totalPotential: Math.round(sum((r) => r.revenuePotential) * 100) / 100,
      rowCount: rows.length,
    },
  };
}
