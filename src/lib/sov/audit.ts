/**
 * SOV-Audit — Portierung des temoa-os-Formelwerks (Quelle: Temoa-Tools-Beta
 * source/script.js, vollständig extrahiert in knowledge/sources/temoa-tools-beta-
 * vollextraktion.md §2). Regel D35: Bei Kommentar/Code-Widersprüchen gilt der CODE.
 * Merge-kompatibel zu temoa-os (D39) — ersetzt dort später die bestehende Version.
 */

export type CerebroRow = {
  keyword: string;
  sv: number; // Search Volume (monatlich)
  mainRank: number; // 0 = nicht gerankt
  ks: number; // Keyword Sales (WÖCHENTLICH!)
  cpr: number; // 999 = Sentinel "kein Wert"
  compRanks: Record<string, number>; // ASIN → Rank (0 = unranked)
};

export type SovKeyword = CerebroRow & {
  cluster: string;
  relevanceWeight: number;
  weightedVis: number;
  kwSOV: number; // %
  bestCompRank: number;
  cprClass: "Low" | "Medium" | "High";
  opportunityType: "Strong Position" | "Defend" | "Quick Win" | "Strategic Gap" | "Monitor";
  kwRevPool: number;
  fullRevGap: number;
  corridors: { low: number; base: number; high: number };
  oppScore: number;
  priority: "High" | "Medium" | "Low";
  lever: string;
};

export type SovAudit = {
  mainAsin: string | null;
  price: number | null;
  keywordCount: number;
  brandSOV: number; // %
  topCompetitor: { asin: string; sov: number } | null;
  top10Coverage: number; // % der Keywords mit mainRank 1–10
  quickWins: SovKeyword[]; // Top 10 nach oppScore
  strategicGaps: SovKeyword[];
  topDemandGaps: SovKeyword[]; // QW+SG kombiniert, Top 10
  invisibleKeywords: string[]; // hohes SV, unranked — Backend-Prio 1
  totalCorridor: { low: number; high: number };
  totalFullGap: number;
  keywords: SovKeyword[];
};

const WEEKLY_TO_MONTHLY = 4.36;

/** Rank-Weight-Kurve vw(rank) — script.js:1424 */
function vw(rank: number): number {
  if (rank <= 0) return 0;
  if (rank === 1) return 1.0;
  if (rank === 2) return 0.65;
  if (rank === 3) return 0.45;
  if (rank <= 5) return 0.3;
  if (rank <= 10) return 0.15;
  if (rank <= 20) return 0.06;
  if (rank <= 50) return 0.015;
  if (rank <= 100) return 0.005;
  return 0.001;
}

/** SERP-1-Umsatzverteilung rankShare(rank) — „Temoa methodology", script.js:1438 */
function rankShare(rank: number): number {
  if (rank <= 0) return 0;
  if (rank === 1) return 0.3;
  if (rank === 2) return 0.21;
  if (rank === 3) return 0.125;
  if (rank === 4) return 0.09;
  if (rank === 5) return 0.075;
  if (rank <= 10) return 0.02;
  if (rank <= 20) return 0.007;
  if (rank <= 50) return 0.001;
  if (rank <= 100) return 0.0005;
  return 0.0001;
}

/** Keyword-Cluster — Regex-Kaskade, erste Übereinstimmung gewinnt (script.js:1452) */
export function clusterKeyword(kw: string): string {
  const k = kw.toLowerCase();
  if (/\b(brand|marke|konkurrenz|competitor|alternative|vs\.?)\b/.test(k)) return "Brand Alternatives";
  if (/\b(problem|lösung|solution|schmerz|hilfe|gegen|anti)\b/.test(k)) return "Problem / Solution";
  if (/\b(wie|how|was ist|what is|anleitung|guide|tutorial|ratgeber|tipp|verwenden|anwenden|einnehmen)\b/.test(k)) return "Usage Intent";
  if (/\b(günstig|cheap|angebot|deal|sale|billig|preis|rabatt|discount|kaufen|bestellen)\b/.test(k)) return "Discovery Terms";
  if (/[äöüß]/.test(k) || /\b(der|die|das|ein|eine|für|zum|zur|mit|beim|gegen)\b/.test(k)) return "German Category";
  if (k.trim().split(/\s+/).length >= 4) return "Longtail";
  return "Core Category";
}

/** Relevanz: Score je Cluster (script.js:1463) → Gewicht (1465) */
export function relevanceWeight(cluster: string): number {
  const score: Record<string, number> = {
    "Core Category": 5, "German Category": 4, "Problem / Solution": 3,
    "Usage Intent": 3, Longtail: 3, "Brand Alternatives": 2, "Discovery Terms": 2,
  };
  const w: Record<number, number> = { 5: 1.0, 4: 0.8, 3: 0.6, 2: 0.4, 1: 0.0 };
  return w[score[cluster] ?? 3] ?? 0.6;
}

/** CPR-Klasse: relatives Perzentil im CSV-Set (script.js:1471) */
function classifyCpr(cpr: number, sorted: number[]): "Low" | "Medium" | "High" {
  if (sorted.length === 0) return "Medium"; // keine Daten → blockiert nichts
  if (cpr >= 999) return "High";
  const pct = sorted.filter((c) => c <= cpr).length / sorted.length;
  return pct <= 0.33 ? "Low" : pct <= 0.66 ? "Medium" : "High";
}

/** Opportunity-Typen — Reihenfolge = Priorität (script.js:1482) */
function classifyOpportunity(mainRank: number, bestCompRank: number, ks: number): SovKeyword["opportunityType"] {
  const ranked = mainRank > 0;
  if (ranked && mainRank <= 10 && (bestCompRank === 0 || bestCompRank >= mainRank)) return "Strong Position";
  if (ranked && mainRank <= 10 && bestCompRank > 0 && bestCompRank < mainRank) return "Defend";
  if (ranked && mainRank >= 8 && mainRank <= 25 && bestCompRank > 0 && bestCompRank <= 10 && ks > 0) return "Quick Win";
  if ((!ranked || mainRank > 25) && bestCompRank > 0 && bestCompRank <= 20 && ks > 0) return "Strategic Gap";
  return "Monitor";
}

/** Empfohlener Hebel — erste Regel gewinnt (script.js:1498) */
function lever(d: { cprClass: string; opportunityType: string; mainRank: number; bestCompRank: number }): string {
  if (d.cprClass === "High" && d.opportunityType === "Strategic Gap") return "Content-Aufbau vor Budget-Einsatz";
  if (d.mainRank >= 8 && d.mainRank <= 25 && d.bestCompRank >= 1 && d.bestCompRank <= 5)
    return "SEO Titel/Bullets/Backend + selektive PPC";
  if ((d.mainRank > 25 || d.mainRank === 0) && d.bestCompRank >= 1 && d.bestCompRank <= 10)
    return "Content-Aufbau, Ranking-Tests, dann PPC";
  if (d.mainRank >= 1 && d.mainRank <= 10 && d.bestCompRank > 0 && d.bestCompRank < d.mainRank)
    return "Hauptbild, CTR, CVR, Preis, Bewertungen";
  if (d.mainRank >= 8 && d.mainRank <= 25) return "SEO + selektive PPC + Visual/CVR";
  return "Beobachten, Datenlage verbessern";
}

// ── CSV-Parsing (Cerebro) ────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const parseNum = (s: string | undefined): number => {
  if (!s) return 0;
  const n = parseFloat(s.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** parseRank: "", "-", "0", NaN, ≤0 → 0 = NICHT gerankt (script.js:1411) */
const parseRank = (s: string | undefined): number => {
  const n = parseNum(s);
  return n > 0 ? Math.round(n) : 0;
};

/**
 * Wettbewerber-ASINs aus dem Keyword-Export (D268, Nutzer-Vorgabe 31.07.).
 *
 * Wer eine Cerebro-CSV hochlädt, hat die Vergleichsprodukte dort schon gewählt —
 * sie stehen als eigene Rang-Spalten in der Kopfzeile. Sie danach für den
 * Review-Scrape NOCH EINMAL von Hand eintragen zu müssen, ist ein
 * überflüssiger Zwischenschritt: es sind dieselben Produkte.
 *
 * Bedingung „mindestens ein echter Rang": Eine ASIN-Spalte, die durchgehend „-"
 * enthält, war im Export nur formal dabei — sie zu scrapen würde Zeitbudget für
 * ein Produkt verbrennen, mit dem gar nicht verglichen wurde.
 *
 * Sortiert nach Anzahl gerankter Keywords: der Wettbewerber, der auf den
 * meisten Suchbegriffen auftaucht, ist der relevanteste — das entscheidet, wer
 * bei einer Obergrenze überlebt.
 */
export function wettbewerberAsinsAusRows(rows: CerebroRow[]): string[] {
  const treffer = new Map<string, number>();
  for (const r of rows) {
    for (const [asin, rank] of Object.entries(r.compRanks)) {
      if (rank > 0) treffer.set(asin, (treffer.get(asin) ?? 0) + 1);
    }
  }
  return [...treffer.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([asin]) => asin);
}

export function parseCerebroCsv(
  text: string,
  mainAsin?: string | null,
  opts: { keepUnranked?: boolean } = {},
): CerebroRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const find = (needle: string) => header.findIndex((h) => h.toLowerCase().includes(needle));

  const kwIdx = find("keyword phrase");
  if (kwIdx === -1) throw new Error('Spalte "Keyword Phrase" nicht gefunden — ist das eine Cerebro-CSV?');
  const svIdx = find("search volume");
  const rankIdx = find("position (rank)");
  const ksIdx = find("keyword sales");
  const cprIdx = find("cpr");

  const asinCols = header
    .map((h, i) => ({ h: h.toUpperCase(), i }))
    .filter(({ h }) => /^B[A-Z0-9]{9}$/.test(h));
  const main = mainAsin?.toUpperCase();

  const rows: CerebroRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const keyword = (cols[kwIdx] ?? "").trim();
    const sv = parseNum(cols[svIdx]);
    if (!keyword) continue;
    // SV 0/„-" heißt nur: Helium 10 kennt kein Volumen — die Zeile ist trotzdem
    // ein echtes Keyword (Real-Export B0CLY13LNW: 56 von 266 Zeilen betroffen).
    // Für die Keyword-BASIS behalten (keepUnranked); nur der SOV-Pfad ist
    // Volumen-gewichtet und braucht sv > 0.
    if (sv <= 0 && !opts.keepUnranked) continue;

    const compRanks: Record<string, number> = {};
    let mainRank = rankIdx >= 0 ? parseRank(cols[rankIdx]) : 0;
    for (const { h, i } of asinCols) {
      const r = parseRank(cols[i]);
      if (main && h === main) mainRank = r;
      else compRanks[h] = r;
    }
    const anyRank = mainRank > 0 || Object.values(compRanks).some((r) => r > 0);
    // Zeilenfilter Pass 1 (SOV braucht Ränge) — für die reine KEYWORD-BASIS
    // sind gerade unrankende Keywords interessant (keepUnranked, D89)
    if (!anyRank && !opts.keepUnranked) continue;

    rows.push({
      keyword, sv, mainRank,
      ks: parseNum(cols[ksIdx]),
      cpr: cprIdx >= 0 ? parseNum(cols[cprIdx]) || 999 : 999,
      compRanks,
    });
  }
  return rows;
}

// ── Audit-Berechnung ─────────────────────────────────────────────────────────

export function computeSovAudit(
  rows: CerebroRow[],
  opts: { price?: number; mainAsin?: string | null } = {},
): SovAudit {
  // Ehrliche Daten (D165): OHNE echten Preis KEINE €-Werte — der frühere
  // 45-€-Default war ein Fassaden-Wert. price=null ⇒ alle €-Felder bleiben 0.
  const price = opts.price && opts.price > 0 ? opts.price : null;
  const cprBase = rows.map((r) => r.cpr).filter((c) => c > 0 && c < 999).sort((a, b) => a - b);

  let sumOwnVis = 0, sumAllVis = 0;
  const compVisTotals: Record<string, number> = {};

  const enriched = rows.map((r) => {
    const cluster = clusterKeyword(r.keyword);
    const relW = relevanceWeight(cluster);
    const weightedVis = r.sv * vw(r.mainRank) * relW;

    let compVisSum = 0, bestCompRank = 0, bestVw = -1;
    for (const [asin, rank] of Object.entries(r.compRanks)) {
      const cv = r.sv * vw(rank) * relW;
      compVisSum += cv;
      compVisTotals[asin] = (compVisTotals[asin] ?? 0) + cv;
      if (vw(rank) > bestVw && rank > 0) { bestVw = vw(rank); bestCompRank = rank; }
    }
    sumOwnVis += weightedVis;
    sumAllVis += weightedVis + compVisSum;

    const denom = weightedVis + compVisSum;
    const kwSOV = denom > 0 ? Math.round((weightedVis / denom) * 1000) / 10 : 0;

    const ksMonthly = r.ks * WEEKLY_TO_MONTHLY;
    const kwRevPool = price ? ksMonthly * price : 0;
    const fullRevGap = Math.max(0, kwRevPool * rankShare(bestCompRank) - kwRevPool * rankShare(r.mainRank));

    const opportunityType = classifyOpportunity(r.mainRank, bestCompRank, r.ks);
    const corridors =
      opportunityType === "Monitor"
        ? { low: 0, base: 0, high: 0 }
        : { low: Math.round(fullRevGap * 0.2), base: Math.round(fullRevGap * 0.6), high: Math.round(fullRevGap * 0.95) };
    const cprClass = classifyCpr(r.cpr, cprBase);

    return { ...r, cluster, relevanceWeight: relW, weightedVis, kwSOV, bestCompRank, cprClass, opportunityType, kwRevPool, fullRevGap, corridors };
  });

  // oppScore: (fullRevGap/maxGap)×0.45 + (ks/maxKS)×0.25 + (sv/maxSV)×0.15 + cprEase×0.15
  const maxGap = Math.max(1, ...enriched.map((k) => k.fullRevGap));
  const maxKs = Math.max(1, ...enriched.map((k) => k.ks));
  const maxSv = Math.max(1, ...enriched.map((k) => k.sv));
  const cprEase = { Low: 1.0, Medium: 0.6, High: 0.2 } as const;

  const keywords: SovKeyword[] = enriched.map((k) => {
    const oppScore =
      (k.fullRevGap / maxGap) * 0.45 + (k.ks / maxKs) * 0.25 + (k.sv / maxSv) * 0.15 + cprEase[k.cprClass] * 0.15;
    const priority: SovKeyword["priority"] = oppScore >= 0.6 ? "High" : oppScore >= 0.35 ? "Medium" : "Low";
    return { ...k, oppScore: Math.round(oppScore * 1000) / 1000, priority, lever: lever(k) };
  });

  const byScore = (a: SovKeyword, b: SovKeyword) => b.oppScore - a.oppScore;
  const quickWins = keywords.filter((k) => k.opportunityType === "Quick Win").sort(byScore).slice(0, 10);
  const strategicGaps = keywords.filter((k) => k.opportunityType === "Strategic Gap").sort(byScore).slice(0, 10);
  const topDemandGaps = [...quickWins, ...strategicGaps].sort(byScore).slice(0, 10);

  const medianSv = [...keywords].sort((a, b) => a.sv - b.sv)[Math.floor(keywords.length / 2)]?.sv ?? 0;
  const invisibleKeywords = keywords
    .filter((k) => k.mainRank === 0 && k.sv >= medianSv)
    .sort((a, b) => b.sv - a.sv)
    .slice(0, 20)
    .map((k) => k.keyword);

  const topComp = Object.entries(compVisTotals).sort((a, b) => b[1] - a[1])[0];

  return {
    mainAsin: opts.mainAsin ?? null,
    price,
    keywordCount: keywords.length,
    brandSOV: sumAllVis > 0 ? Math.round((sumOwnVis / sumAllVis) * 1000) / 10 : 0,
    topCompetitor: topComp ? { asin: topComp[0], sov: Math.round((topComp[1] / Math.max(1, sumAllVis)) * 1000) / 10 } : null,
    top10Coverage: keywords.length
      ? Math.round((keywords.filter((k) => k.mainRank >= 1 && k.mainRank <= 10).length / keywords.length) * 1000) / 10
      : 0,
    quickWins,
    strategicGaps,
    topDemandGaps,
    invisibleKeywords,
    totalCorridor: {
      low: topDemandGaps.reduce((s, k) => s + k.corridors.low, 0),
      high: topDemandGaps.reduce((s, k) => s + k.corridors.high, 0),
    },
    totalFullGap: Math.round(topDemandGaps.reduce((s, k) => s + k.fullRevGap, 0)),
    keywords,
  };
}
