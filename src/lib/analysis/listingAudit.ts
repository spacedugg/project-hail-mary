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

/**
 * Wirksamer Mess-Stand je Sektion (D110, Nutzer-Vorgabe): Die Analyse misst
 * FREIGEGEBENE Texte — sonst das importierte Original-Listing (IST). Entwürfe
 * zählen NICHT (deren Gate-Prüfung läuft im Optimizer); erst die Freigabe
 * macht einen neuen Text zum Mess-Gegenstand. Jede Sektion weist ihre
 * Quelle aus — keine stille Misch-Basis.
 */
export type SektionsQuelle = { basis: "freigegeben" | "original" | "fehlt"; version?: number };

export function wirksamesListing(
  versions: Array<{ type: string; status: string; version: number; payload: unknown }>,
  original: { title?: string | null; bullets?: string[] | null; description?: string | null } | null,
): { snapshot: ListingSnapshot; quellen: Record<keyof ListingSnapshot, SektionsQuelle> } {
  const freigegeben = (t: string) => versions.find((v) => v.type === t && v.status === "approved");
  const pick = <T,>(t: string, feld: string, orig: T | null | undefined, leer: T): { wert: T; quelle: SektionsQuelle } => {
    const v = freigegeben(t);
    const wert = (v?.payload as Record<string, unknown> | undefined)?.[feld] as T | undefined;
    if (v && wert && (!Array.isArray(wert) || wert.length > 0)) return { wert, quelle: { basis: "freigegeben", version: v.version } };
    if (orig && (!Array.isArray(orig) || orig.length > 0)) return { wert: orig, quelle: { basis: "original" } };
    return { wert: leer, quelle: { basis: "fehlt" } };
  };

  const title = pick<string>("title", "text", original?.title, "");
  const bullets = pick<string[]>("bullets", "items", original?.bullets, []);
  const description = pick<string>("description", "text", original?.description, "");
  const backend = pick<string>("backend_keywords", "text", null, ""); // Backend ist nie im Original sichtbar

  return {
    snapshot: { title: title.wert, bullets: bullets.wert, description: description.wert, backendKeywords: backend.wert },
    quellen: { title: title.quelle, bullets: bullets.quelle, description: description.quelle, backendKeywords: backend.quelle },
  };
}

export type AnalysisDimension = {
  key: string;
  label: string;
  score: number; // 0–100 — nur aussagekräftig wenn measured
  /** false = kein Inhalt vorhanden → NICHT bewertbar (kein Fassaden-Score, D70) */
  measured: boolean;
  evidence: "deterministic" | "llm" | "manual";
  findings: string[]; // kundentaugliche Sätze
  issues: ValidationIssue[];
};

export type ListingAnalysis = {
  /** null = noch nichts messbar (kein Inhalt) — Anzeige zeigt Leerzustand statt Zahl */
  overall: number | null;
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

/**
 * Themen-Abgleich für Pain-Points (D117): Ein Pain-Point-Label ist ein ganzer
 * Beschwerde-Satz („Magnete zu schwach — halten Lampe nicht sicher …"). Gute
 * Bullets kontern den Einwand mit POSITIVER Sprache statt ihn wörtlich zu
 * wiederholen — containsPhrase (JEDES Wort muss vorkommen) lieferte deshalb
 * praktisch immer 0/5. Stattdessen: Inhaltswörter (ohne Funktionswörter)
 * wortstamm- UND komposita-bewusst matchen („Lampe" trifft „Arbeitslampe",
 * „Batteriefach" trifft „Batterien"). Rückgabe: die getroffenen Themenwörter.
 */
const FUNKTIONSWOERTER = new Set([
  "nicht", "kein", "ohn", "sehr", "aber", "dass", "sich", "sind", "ist", "wird",
  "werd", "hat", "hab", "fur", "auf", "aus", "mit", "von", "und", "bei", "beim",
  "wenn", "weil", "noch", "nur", "auch", "schon", "mehr", "als", "wie", "man",
  "durch", "gegen", "uber", "unter", "nach", "vor", "sonst", "dann",
]);

function themenTreffer(hay: string, phrase: string): { treffer: string[]; themen: number } {
  const bulletStems = [...tokenSet(hay)];
  const woerter = phrase.split(/[\s\-–—/,()]+/).filter((w) => w.length >= 3);
  const themen = woerter
    .map((w) => ({ wort: w, stamm: normalizeToken(w) }))
    .filter((t) => t.stamm.length >= 3 && !FUNKTIONSWOERTER.has(t.stamm));
  const treffer = themen
    .filter(({ stamm }) =>
      bulletStems.some(
        (b) =>
          b === stamm ||
          (stamm.length >= 4 && b.includes(stamm)) ||
          (b.length >= 4 && stamm.includes(b)),
      ),
    )
    .map((t) => t.wort);
  return { treffer, themen: themen.length };
}

/** Adressiert = mindestens 2 Themenwörter getroffen (bei sehr kurzen Labels reicht 1). */
function adressiert(hay: string, phrase: string): { ok: boolean; treffer: string[] } {
  const { treffer, themen } = themenTreffer(hay, phrase);
  return { ok: themen <= 2 ? treffer.length >= 1 : treffer.length >= 2, treffer };
}

/**
 * Live-Deckungsgrad (D126): Wie viel unseres freigegebenen SOLL-Texts steckt
 * im LIVE-Stand (letzter Import)? Kunden ändern Texte beim Einstellen manchmal
 * leicht ab — ab 85 % gilt „live" (grün), darunter „weicht ab" (orange).
 * Wortstamm-basiert und komposita-bewusst, wie der Themen-Abgleich.
 */
export function deckungsgrad(soll: string, ist: string): number {
  const sollStaemme = [...tokenSet(soll)];
  if (sollStaemme.length === 0) return 0;
  const istStaemme = tokenSet(ist);
  const daPruefer = [...istStaemme];
  const getroffen = sollStaemme.filter((s) =>
    daPruefer.some((t) => t === s || (s.length >= 4 && t.includes(s)) || (t.length >= 4 && s.includes(t))),
  ).length;
  return Math.round((getroffen / sollStaemme.length) * 100);
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

  // Fehlender Inhalt ist NICHT bewertbar — nie ein Fassaden-Score (D70)
  const missing = (key: string, label: string, was: string) =>
    dims.push({ key, label, score: 0, measured: false, evidence: "deterministic", findings: [`Noch kein ${was} vorhanden — Original-Listing laden oder Content erstellen.`], issues: [] });

  // 1 · Titel (deterministisch)
  if (!snapshot.title.trim()) missing("title", "Titel", "Titel");
  else {
    const issues = validateTitle(snapshot.title, ctx);
    dims.push({ key: "title", label: "Titel", score: scoreFromIssues(issues), measured: true, evidence: "deterministic", findings: issues.map((i) => i.message), issues });
  }
  // 2 · Bullets (deterministisch)
  if (snapshot.bullets.filter((b) => b.trim()).length === 0) missing("bullets", "Bullet Points", "Bullet-Set");
  else {
    const issues = validateBullets(snapshot.bullets, ctx);
    dims.push({ key: "bullets", label: "Bullet Points", score: scoreFromIssues(issues), measured: true, evidence: "deterministic", findings: issues.map((i) => i.message), issues });
  }
  // 3 · Beschreibung
  if (!snapshot.description.trim()) missing("description", "Beschreibung", "Beschreibung");
  else {
    const issues = validateDescription(snapshot.description, snapshot.bullets, ctx);
    dims.push({ key: "description", label: "Beschreibung", score: scoreFromIssues(issues), measured: true, evidence: "deterministic", findings: issues.map((i) => i.message), issues });
  }
  // 4 · Backend
  if (!snapshot.backendKeywords.trim()) missing("backend", "Backend-Keywords", "Backend-Keyword-Feld");
  else {
    const issues = validateBackendKeywords(snapshot.backendKeywords, allText, ctx);
    dims.push({ key: "backend", label: "Backend-Keywords", score: scoreFromIssues(issues), measured: true, evidence: "deterministic", findings: issues.map((i) => i.message), issues });
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
    dims.push({ key: "seo-coverage", label: "Keyword-Abdeckung (Profit-Hebel)", score: pct, measured: true, evidence: "deterministic", findings, issues: [] });
    if (missing.length) recs.push(`Die ${missing.length} wichtigsten Umsatzlücken-Keywords in Titel/Bullets einarbeiten (größter Hebel: „${missing[0].keyword}").`);
  }

  // 6 · Voice-of-Customer-Abgleich: adressieren die Bullets die Top-Pain-Points? (deterministisch, heuristisch)
  if (reviewInsights && reviewInsights.painPoints.length > 0) {
    const top = reviewInsights.painPoints.slice(0, 5);
    const bulletsText = snapshot.bullets.join(" ");
    const geprueft = top.map((p) => ({ p, ...adressiert(bulletsText, p.label) }));
    const addressed = geprueft.filter((g) => g.ok);
    const pct = Math.round((addressed.length / top.length) * 100);
    const missing = geprueft.filter((g) => !g.ok).map((g) => g.p);
    const findings = [
      `${addressed.length} von ${top.length} Top-Pain-Points werden in den Bullets adressiert.`,
      ...addressed.map((g) => `Adressiert: „${g.p.label}" — Themen-Treffer in den Bullets: ${g.treffer.join(", ")}`),
      ...missing.map((p) => `Nicht adressiert: „${p.label}"${p.frequencyPct ? ` (${p.frequencyPct} % der kritischen Stimmen)` : ""}`),
      "Der Abgleich ist wortstamm-basiert (Thema muss in den Bullets vorkommen) — ob ein Einwand inhaltlich entkräftet ist, bewertet der Tiefen-Audit.",
    ];
    // Umbenannt (Nutzer 21.07.): Es geht nicht nur um „Kundenstimmen", sondern
    // darum, ob die Top-Pain-Points im Content adressiert sind → Quality Score.
    dims.push({ key: "voc", label: "Quality Score (Pain-Point-Abdeckung)", score: pct, measured: true, evidence: "deterministic", findings, issues: [] });
    if (missing[0]) recs.push(`Häufigsten Kunden-Einwand („${missing[0].label}") prominent in Bullet 1–2 entkräften.`);
  }

  // Empfehlungen aus Gate-Fehlern
  for (const d of dims) {
    const errs = d.issues.filter((i) => i.severity === "error");
    if (errs.length) recs.push(`${d.label}: ${errs.length} harte Regelverstöße beheben (${errs[0].message}${errs.length > 1 ? " …" : ""}).`);
  }

  const measuredDims = dims.filter((d) => d.measured);
  const overall = measuredDims.length
    ? Math.round(measuredDims.reduce((s, d) => s + d.score, 0) / measuredDims.length)
    : null;

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
