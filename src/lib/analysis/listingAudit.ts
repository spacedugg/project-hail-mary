import { validateTitle, validateBullets, validateDescription, validateBackendKeywords } from "@/lib/validation/gate";
import { normalizeToken } from "@/lib/text/bytes";
import type { ProductFacts, ReviewInsightsPayload, ValidationIssue } from "@/db/schema";
import type { SovAudit } from "@/lib/sov/audit";

/**
 * Listing-Analyse — engine-gestützt mit ausgewiesenen Evidenz-Klassen (R4/D31):
 * Text-Dimensionen deterministisch (Gate + Keyword-Abdeckung + Pain-Point-Abgleich),
 * SOV aus dem Formelwerk. Keine Fassaden-Scores: was nicht messbar ist, wird
 * nicht erfunden (Bilder/A+ folgen in der Bild-Phase als LLM-Rubrik).
 */

export type ListingSnapshot = {
  title: string;
  bullets: string[];
  description: string;
  backendKeywords: string;
};

export type AnalysisDimension = {
  key: string;
  label: string;
  score: number; // 0–100
  evidence: "deterministic" | "llm" | "manual";
  findings: string[]; // kundentaugliche Sätze
  issues: ValidationIssue[];
};

export type ListingAnalysis = {
  overall: number;
  dimensions: AnalysisDimension[];
  sov: null | {
    brandSOV: number;
    topCompetitor: { asin: string; sov: number } | null;
    top10Coverage: number;
    quickWinCount: number;
    corridor: { low: number; high: number };
    topGaps: Array<{ keyword: string; sv: number; mainRank: number; bestCompRank: number; fullRevGap: number; lever: string }>;
  };
  recommendations: string[]; // priorisiert, kundentauglich
};

const tokenSet = (s: string) => new Set(s.split(/[\s\-–—/,]+/).map(normalizeToken).filter((t) => t.length >= 3));

function containsPhrase(hay: string, phrase: string): boolean {
  const h = tokenSet(hay);
  const words = phrase.split(/\s+/).map(normalizeToken).filter((t) => t.length >= 3);
  if (words.length === 0) return false;
  return words.every((w) => h.has(w));
}

function scoreFromIssues(issues: ValidationIssue[], base = 100): number {
  const s = base - issues.filter((i) => i.severity === "error").length * 30 - issues.filter((i) => i.severity === "warning").length * 8;
  return Math.max(0, Math.min(100, s));
}

export function analyzeListing(input: {
  snapshot: ListingSnapshot;
  facts: ProductFacts;
  primaryKeywords: string[];
  sovAudit?: SovAudit | null;
  reviewInsights?: ReviewInsightsPayload | null;
}): ListingAnalysis {
  const { snapshot, facts, primaryKeywords, sovAudit, reviewInsights } = input;
  const dims: AnalysisDimension[] = [];
  const recs: string[] = [];
  const allText = [snapshot.title, ...snapshot.bullets, snapshot.description].join(" ");
  const ctx = { facts, primaryKeywords, competitorBrands: [] };

  // 1 · Titel (deterministisch)
  {
    const issues = validateTitle(snapshot.title, ctx);
    const findings = issues.map((i) => i.message);
    dims.push({ key: "title", label: "Titel", score: scoreFromIssues(issues), evidence: "deterministic", findings, issues });
  }
  // 2 · Bullets (deterministisch)
  {
    const issues = validateBullets(snapshot.bullets, ctx);
    dims.push({ key: "bullets", label: "Bullet Points", score: scoreFromIssues(issues), evidence: "deterministic", findings: issues.map((i) => i.message), issues });
  }
  // 3 · Beschreibung
  {
    const issues = validateDescription(snapshot.description, snapshot.bullets, ctx);
    dims.push({ key: "description", label: "Beschreibung", score: scoreFromIssues(issues), evidence: "deterministic", findings: issues.map((i) => i.message), issues });
  }
  // 4 · Backend
  {
    const issues = validateBackendKeywords(snapshot.backendKeywords, allText, ctx);
    dims.push({ key: "backend", label: "Backend-Keywords", score: scoreFromIssues(issues), evidence: "deterministic", findings: issues.map((i) => i.message), issues });
  }

  // 5 · SEO-Abdeckung: Quick-Wins & Revenue-Gap-Keywords im sichtbaren Text? (deterministisch)
  if (sovAudit && sovAudit.topDemandGaps.length > 0) {
    const gaps = sovAudit.topDemandGaps;
    const covered = gaps.filter((g) => containsPhrase(allText, g.keyword));
    const pct = Math.round((covered.length / gaps.length) * 100);
    const missing = gaps.filter((g) => !containsPhrase(allText, g.keyword)).slice(0, 5);
    const findings = [
      `${covered.length} von ${gaps.length} Top-Umsatzlücken-Keywords sind im Listing abgedeckt (${pct} %).`,
      ...missing.map((m) => `Fehlt im Text: „${m.keyword}" (SV ${m.sv}, Lücke ~${Math.round(m.fullRevGap)} €/Mo. → ${m.lever})`),
    ];
    dims.push({ key: "seo-coverage", label: "Keyword-Abdeckung (Profit-Hebel)", score: pct, evidence: "deterministic", findings, issues: [] });
    if (missing.length) recs.push(`Die ${missing.length} wichtigsten Umsatzlücken-Keywords in Titel/Bullets einarbeiten (größter Hebel: „${missing[0].keyword}").`);
  }

  // 6 · Voice-of-Customer-Abgleich: adressieren die Bullets die Top-Pain-Points? (deterministisch, heuristisch)
  if (reviewInsights && reviewInsights.painPoints.length > 0) {
    const top = reviewInsights.painPoints.slice(0, 5);
    const bulletsText = snapshot.bullets.join(" ");
    const addressed = top.filter((p) => containsPhrase(bulletsText, p.label));
    const pct = Math.round((addressed.length / top.length) * 100);
    const missing = top.filter((p) => !containsPhrase(bulletsText, p.label));
    const findings = [
      `${addressed.length} von ${top.length} Top-Pain-Points werden in den Bullets adressiert.`,
      ...missing.map((p) => `Nicht adressiert: „${p.label}"${p.frequencyPct ? ` (${p.frequencyPct} % der kritischen Stimmen)` : ""}`),
    ];
    dims.push({ key: "voc", label: "Kundenstimmen-Abgleich", score: pct, evidence: "deterministic", findings, issues: [] });
    if (missing[0]) recs.push(`Häufigsten Kunden-Einwand („${missing[0].label}") prominent in Bullet 1–2 entkräften.`);
  }

  // Empfehlungen aus Gate-Fehlern
  for (const d of dims) {
    const errs = d.issues.filter((i) => i.severity === "error");
    if (errs.length) recs.push(`${d.label}: ${errs.length} harte Regelverstöße beheben (${errs[0].message}${errs.length > 1 ? " …" : ""}).`);
  }

  const overall = Math.round(dims.reduce((s, d) => s + d.score, 0) / Math.max(1, dims.length));

  return {
    overall,
    dimensions: dims,
    sov: sovAudit
      ? {
          brandSOV: sovAudit.brandSOV,
          topCompetitor: sovAudit.topCompetitor,
          top10Coverage: sovAudit.top10Coverage,
          quickWinCount: sovAudit.quickWins.length,
          corridor: sovAudit.totalCorridor,
          topGaps: sovAudit.topDemandGaps.slice(0, 5).map((g) => ({
            keyword: g.keyword, sv: g.sv, mainRank: g.mainRank, bestCompRank: g.bestCompRank,
            fullRevGap: Math.round(g.fullRevGap), lever: g.lever,
          })),
        }
      : null,
    recommendations: recs.slice(0, 8),
  };
}
