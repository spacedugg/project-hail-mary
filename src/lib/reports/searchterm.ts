/**
 * Search-Term-Report-Parser + N-Gram-Analyse.
 * Portiert nach den reporting-main-Golden-Werten (knowledge/sources §4):
 * - versteht 2 Formate: klassischer SP-Suchbegriffsbericht (deutsche Zahlen)
 *   UND „Bericht erstellen"-Template (deutsche Header „Suchbegriff/Gesamtkosten/
 *   Käufe/Verkäufe", aber US-Dezimalpunkte) — Zahlformat wird pro Datei erkannt
 * - Raten IMMER aus Rohwerten; wastedSpend = Terme mit Spend > 0 und 0 Orders,
 *   ASIN-Ziele separat ausgewiesen (eigener Handlungs-Impact)
 * - N-Gram: zusammenhängende 1/2/3-Wort-Wurzeln, ASINs ausgeschlossen,
 *   KEIN Stemming, Stopwörter bleiben (literale Wurzeln für Keyword-Aktionen),
 *   De-Dup innerhalb eines Terms, Aggregat-Raten aus Summen
 */

import { parseCsvLine, makeNumParser } from "./business";

export type SearchTermRow = {
  term: string;
  isAsin: boolean;
  matchType: "exact" | "phrase" | "broad" | "other";
  campaign: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  units: number;
};

export type SearchTermTotals = {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  units: number;
  termCount: number;
  convertingTerms: number;
  zeroOrderTerms: number; // Spend > 0, Orders = 0 (inkl. ASIN-Ziele)
  wastedSpend: number; // Summe Spend der Null-Order-Terme
  asinWastedSpend: number; // davon ASIN-Ziele (separater Handlungs-Impact)
};

export function isAsinTerm(term: string): boolean {
  return /^b0[a-z0-9]{8}$/i.test(term.trim());
}

function mapMatchType(raw: string): SearchTermRow["matchType"] {
  const t = raw.toLowerCase().trim();
  if (t.includes("exact") || t.includes("genau")) return "exact";
  if (t.includes("phrase")) return "phrase";
  if (t.includes("broad") || t.includes("weit")) return "broad";
  return "other";
}

export function parseSearchTermReport(text: string): { rows: SearchTermRow[]; totals: SearchTermTotals } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Report zu kurz — Header + Datenzeilen erwartet.");
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());

  // Zwei-Pass-Suche: exakter Header vor Teilstring — „Käufe" (Template) darf
  // nicht auf „Verkäufe" matchen.
  const find = (...needles: string[]) => {
    for (const n of needles) {
      const exact = header.findIndex((h) => h === n);
      if (exact >= 0) return exact;
    }
    for (const n of needles) {
      // „käufe" darf im Teilstring-Pass nicht auf „verkäufe" matchen
      const i = header.findIndex((h) => h.includes(n) && !(n === "käufe" && h.includes("verkäufe")));
      if (i >= 0) return i;
    }
    return -1;
  };
  const termIdx = find("suchbegriff eines kunden", "customer search term", "suchbegriff");
  if (termIdx === -1) throw new Error('Keine Suchbegriff-Spalte gefunden — ist das der Search-Term-Report (oder das „Bericht erstellen"-Template)?');
  const matchIdx = find("übereinstimmungstyp", "match type");
  const campIdx = find("kampagnenname", "campaign name", "kampagne");
  const imprIdx = find("impressionen", "impressions");
  const clickIdx = find("klicks", "clicks");
  const spendIdx = find("gesamtkosten", "ausgaben", "spend", "kosten", "cost");
  const salesIdx = find("verkäufe", "sales", "umsätze", "umsatz");
  const ordersIdx = find("bestellungen", "orders", "käufe");
  const unitsIdx = find("verkaufte einheiten", "einheiten", "units");
  if (spendIdx === -1 || salesIdx === -1)
    throw new Error("Pflicht-Spalten fehlen (Kosten / Verkäufe).");

  const dataLines = lines.slice(1).map((l) => parseCsvLine(l, sep));
  const num = makeNumParser(dataLines.slice(0, 20).map((c) => `${c[spendIdx] ?? ""} ${c[salesIdx] ?? ""}`));

  const rows: SearchTermRow[] = dataLines
    .filter((c) => (c[termIdx] ?? "").trim())
    .map((c) => {
      const term = (c[termIdx] ?? "").trim().toLowerCase();
      return {
        term,
        isAsin: isAsinTerm(term),
        matchType: mapMatchType(matchIdx >= 0 ? (c[matchIdx] ?? "") : ""),
        campaign: campIdx >= 0 ? (c[campIdx] ?? "").trim() : "",
        impressions: imprIdx >= 0 ? Math.round(num(c[imprIdx])) : 0,
        clicks: clickIdx >= 0 ? Math.round(num(c[clickIdx])) : 0,
        spend: num(c[spendIdx]),
        sales: num(c[salesIdx]),
        orders: ordersIdx >= 0 ? Math.round(num(c[ordersIdx])) : 0,
        units: unitsIdx >= 0 ? Math.round(num(c[unitsIdx])) : 0,
      };
    });
  if (rows.length === 0) throw new Error("Keine Suchbegriff-Zeilen gefunden.");

  const sum = (f: (r: SearchTermRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const zeroOrder = rows.filter((r) => r.spend > 0 && r.orders === 0);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    rows: [...rows].sort((a, b) => b.spend - a.spend),
    totals: {
      impressions: sum((r) => r.impressions),
      clicks: sum((r) => r.clicks),
      spend: round2(sum((r) => r.spend)),
      sales: round2(sum((r) => r.sales)),
      orders: sum((r) => r.orders),
      units: sum((r) => r.units),
      termCount: rows.length,
      convertingTerms: rows.filter((r) => r.orders > 0).length,
      zeroOrderTerms: zeroOrder.length,
      wastedSpend: round2(zeroOrder.reduce((s, r) => s + r.spend, 0)),
      asinWastedSpend: round2(zeroOrder.filter((r) => r.isAsin).reduce((s, r) => s + r.spend, 0)),
    },
  };
}

// ── N-Gram-Wurzeln ───────────────────────────────────────────────────────────

export type NgramRoot = {
  root: string;
  frequency: number; // in wie vielen Termen enthalten
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  ctr: number | null; // %
  cpc: number | null; // €
  cvr: number | null; // %
  acos: number | null; // %
};

export function ngramRoots(rows: SearchTermRow[], n: 1 | 2 | 3): NgramRoot[] {
  const agg = new Map<string, { freq: number; impressions: number; clicks: number; spend: number; sales: number; orders: number }>();
  for (const row of rows) {
    if (row.isAsin) continue;
    const words = row.term.split(/\s+/).filter(Boolean);
    if (words.length < n) continue;
    const roots = new Set<string>();
    for (let i = 0; i + n <= words.length; i++) roots.add(words.slice(i, i + n).join(" "));
    for (const root of roots) {
      const a = agg.get(root) ?? { freq: 0, impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
      a.freq += 1;
      a.impressions += row.impressions;
      a.clicks += row.clicks;
      a.spend += row.spend;
      a.sales += row.sales;
      a.orders += row.orders;
      agg.set(root, a);
    }
  }
  const pct = (num_: number, den: number, digits = 1) =>
    den > 0 ? Math.round((num_ / den) * 100 * 10 ** digits) / 10 ** digits : null;
  return [...agg.entries()]
    .map(([root, a]) => ({
      root,
      frequency: a.freq,
      impressions: a.impressions,
      clicks: a.clicks,
      spend: Math.round(a.spend * 100) / 100,
      sales: Math.round(a.sales * 100) / 100,
      orders: a.orders,
      ctr: pct(a.clicks, a.impressions, 2),
      cpc: a.clicks > 0 ? Math.round((a.spend / a.clicks) * 100) / 100 : null,
      cvr: pct(a.orders, a.clicks),
      acos: pct(a.spend, a.sales),
    }))
    .sort((a, b) => b.spend - a.spend);
}

/** Top-Converting-Wurzeln: nur Orders > 0, nach Sales. */
export function topConverting(roots: NgramRoot[], limit = 7): NgramRoot[] {
  return roots.filter((r) => r.orders > 0).sort((a, b) => b.sales - a.sales).slice(0, limit);
}

/** Negativ-Kandidaten: Spend > 0 ohne einen einzigen Kauf, nach Spend. */
export function negativeCandidates(roots: NgramRoot[], limit = 7): NgramRoot[] {
  return roots.filter((r) => r.spend > 0 && r.orders === 0).sort((a, b) => b.spend - a.spend).slice(0, limit);
}
