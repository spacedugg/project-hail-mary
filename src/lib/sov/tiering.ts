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

import type { SovAudit } from "./audit";

export type TieredKeyword = {
  keyword: string;
  searchVolume: number;
  tier: "primary" | "secondary" | "tertiary" | "backend";
};

export type TieringResult = {
  tiered: TieredKeyword[];
  excludedBrandTerms: string[]; // ausgeschlossen wegen Fremdmarken-Verdacht
};

export function deriveKeywordTiers(audit: SovAudit): TieringResult {
  const excluded = audit.keywords.filter((k) => k.cluster === "Brand Alternatives");
  const candidates = audit.keywords
    .filter((k) => k.cluster !== "Brand Alternatives")
    .map((k) => ({ ...k, score: k.sv * k.relevanceWeight }))
    .sort((a, b) => b.score - a.score || b.oppScore - a.oppScore);

  const tierAt = (i: number): TieredKeyword["tier"] =>
    i < 3 ? "primary" : i < 13 ? "secondary" : i < 18 ? "tertiary" : "backend";

  return {
    tiered: candidates.map((k, i) => ({ keyword: k.keyword, searchVolume: k.sv, tier: tierAt(i) })),
    excludedBrandTerms: excluded.map((k) => k.keyword),
  };
}
