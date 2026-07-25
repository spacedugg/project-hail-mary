import { analyzeListing } from "@/lib/analysis/listingAudit";
import type { ListingSnapshot } from "@/lib/analysis/listingAudit";
import type { ProductFacts, ReviewInsightsPayload } from "@/db/schema";
import type { SovAudit } from "@/lib/sov/audit";

/**
 * Live-Qualitäts-Score (Bauplan v3.6).
 *
 * Der Plan hat „Content-Accuracy" (reiner Deckungsgrad) präzisiert: Die
 * ENTSCHEIDENDE Kennzahl ist die vorhandene Qualitäts-Messung, dauerhaft auf
 * den LIVE-Stand angewendet. Retail-Readiness = Live-Score über Schwelle.
 *
 * Kernprinzip aus dem Plan: „fortlaufend MESSEN, nicht fortlaufend analysieren."
 * Die Datenbasis (Keywords, Pain Points, USPs) bleibt EINGEFROREN bis zur
 * bewussten Neu-Analyse. Gemessen wird nur der frisch gecrawlte Live-Stand
 * gegen diese unveränderte Messlatte — deterministisch, ohne KI-Kosten. Ein
 * Score-Einbruch entsteht also dann, wenn Amazon den Live-Content verschlechtert
 * (Bild raus, Text überschrieben), nicht durch eine neue Analyse.
 *
 * Bewusst NICHT dasselbe wie die Accuracy:
 *   Accuracy   = „ist unsere Arbeit angekommen?" (Deckung Soll ↔ Live)
 *   Live-Score = „ist das, was live steht, gut?" (Qualität des Live-Stands)
 * Beide werden gezeigt — sie beantworten zwei verschiedene Fragen.
 */

/** Die eingefrorene Messlatte: das, was seit der letzten Analyse feststeht. */
export type Messlatte = {
  facts: ProductFacts;
  primaryKeywords: string[];
  sovAudit: SovAudit | null;
  reviewInsights: ReviewInsightsPayload | null;
};

export type LiveScore = {
  /** 0–100, null wenn nichts messbar (kein Live-Stand). */
  score: number | null;
  /** Ab hier gilt Retail-Readiness. */
  schwelle: number;
  ueberSchwelle: boolean;
  /** Zeitpunkt des zugrunde liegenden Crawls. */
  gemessenAm: Date | null;
  /** Je Dimension der Live-Wert — für die Aufschlüsselung. */
  dimensionen: Array<{ key: string; label: string; score: number; measured: boolean }>;
};

export const RETAIL_READY_SCHWELLE = 80;

/**
 * Score des LIVE-Stands. `snapshot` ist der gecrawlte Ist-Zustand, `messlatte`
 * ist die eingefrorene Analyse-Basis. Kein Snapshot ⇒ nicht messbar (kein
 * Fassaden-Score, D70).
 */
export function liveScore(snapshot: ListingSnapshot | null, messlatte: Messlatte, gemessenAm: Date | null): LiveScore {
  if (!snapshot) {
    return { score: null, schwelle: RETAIL_READY_SCHWELLE, ueberSchwelle: false, gemessenAm: null, dimensionen: [] };
  }
  const analyse = analyzeListing({
    snapshot,
    facts: messlatte.facts,
    primaryKeywords: messlatte.primaryKeywords,
    sovAudit: messlatte.sovAudit,
    reviewInsights: messlatte.reviewInsights,
  });
  return {
    score: analyse.overall,
    schwelle: RETAIL_READY_SCHWELLE,
    ueberSchwelle: analyse.overall !== null && analyse.overall >= RETAIL_READY_SCHWELLE,
    gemessenAm,
    dimensionen: analyse.dimensions.map((d) => ({ key: d.key, label: d.label, score: d.score, measured: d.measured })),
  };
}

/**
 * Score-Delta über die Zeit: der frühere Score gegen den aktuellen. Ein
 * Einbruch ist das Alarmsignal — Amazon hat den Live-Content geändert.
 */
export function scoreDelta(vorher: number | null, jetzt: number | null): { delta: number | null; einbruch: boolean } {
  if (vorher === null || jetzt === null) return { delta: null, einbruch: false };
  const delta = jetzt - vorher;
  return { delta, einbruch: delta <= -10 };
}
