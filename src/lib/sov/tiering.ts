/**
 * Keyword-Tiering aus dem SOV-Audit — ersetzt das v0-Tiering nach
 * Eingabe-Reihenfolge durch eine Daten-Herleitung aus der Cerebro-CSV.
 *
 * Herleitung (deterministisch):
 * - „Brand Alternatives"-Cluster fliegt raus: fremde Markennamen sind in
 *   Titel/Bullets/Backend verboten (Amazon-Policy, knowledge/content/backend-keywords.md)
 * - Rangfolge = Suchvolumen × Cluster-Relevanzgewicht (Nachfrage × Relevanz),
 *   Gleichstand entscheidet der Opportunity-Score
 * - Tier-Schnitte wie im Content-Wissen verankert: 1–3 primary → Titel,
 *   4–13 secondary → Bullets/Highlights, 14–18 tertiary → Beschreibung,
 *   Rest → Backend (inkl. „unsichtbarer" High-SV-Keywords ohne Ranking)
 */

import { clusterKeyword, relevanceWeight, type SovAudit } from "./audit";

export type TieredKeyword = {
  keyword: string;
  searchVolume: number;
  tier: "primary" | "secondary" | "tertiary" | "backend";
};

export type TieringResult = {
  tiered: TieredKeyword[];
  excludedBrandTerms: string[]; // ausgeschlossen wegen Fremdmarken-Verdacht
};

/**
 * `extra` (D91): Keywords OHNE Ranking (die das SOV-Formelwerk zu Recht
 * ausklammert) gehören trotzdem in die Keyword-BASIS — sie werden mit
 * demselben Score (SV × Cluster-Relevanzgewicht) einsortiert. So kann ein
 * Kopf-Keyword wie „krabbelmatte" primary werden, auch wenn (noch) keine
 * der ASINs darauf rankt.
 */
export function deriveKeywordTiers(
  audit: SovAudit,
  extra: Array<{ keyword: string; sv: number }> = [],
): TieringResult {
  const excluded = audit.keywords.filter((k) => k.cluster === "Brand Alternatives");
  const bekannt = new Set(audit.keywords.map((k) => k.keyword.toLowerCase()));

  const extraCandidates = extra
    .filter((e) => !bekannt.has(e.keyword.toLowerCase()))
    .map((e) => {
      const cluster = clusterKeyword(e.keyword);
      return { keyword: e.keyword, sv: e.sv, cluster, score: e.sv * relevanceWeight(cluster), oppScore: 0 };
    })
    .filter((e) => e.cluster !== "Brand Alternatives");

  const candidates = [
    ...audit.keywords
      .filter((k) => k.cluster !== "Brand Alternatives")
      .map((k) => ({ keyword: k.keyword, sv: k.sv, score: k.sv * k.relevanceWeight, oppScore: k.oppScore })),
    ...extraCandidates,
  ].sort((a, b) => b.score - a.score || b.oppScore - a.oppScore);

  const tierAt = (i: number): TieredKeyword["tier"] =>
    i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend";

  return {
    tiered: candidates.map((k, i) => ({ keyword: k.keyword, searchVolume: k.sv, tier: tierAt(i) })),
    excludedBrandTerms: excluded.map((k) => k.keyword),
  };
}
