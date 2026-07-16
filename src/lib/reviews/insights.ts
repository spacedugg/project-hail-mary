import type { ReviewInsightsPayload } from "@/db/schema";

/**
 * Insights-Normalisierung (D103, „LLM generiert, Code erzwingt"):
 * Die LLM-Antwort wird NIE ungeprüft gespeichert oder gerendert. Diese
 * Funktion erzwingt die Payload-Struktur — fehlende Arrays werden leer,
 * snake_case-Varianten (pain_points …) werden akzeptiert, kaputte Einträge
 * (ohne Label) fliegen raus, Zahlen werden koerziert. Läuft beim SCHREIBEN
 * (extractInsights) und beim LESEN (Findings-Dashboard, repariert auch
 * bereits gespeicherte kaputte Zeilen) — ein kaputter Payload darf nie
 * wieder die Seite crashen.
 */

type Kern = Pick<ReviewInsightsPayload, "painPoints" | "buyingTriggers" | "languageToBorrow" | "languageToAvoid">;

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const strings = (v: unknown): string[] =>
  arr(v).map((s) => String(s ?? "").trim()).filter(Boolean);

function findings(v: unknown): Kern["painPoints"] {
  return arr(v)
    .map((x) => {
      const f = (x ?? {}) as Record<string, unknown>;
      const label = String(f.label ?? f.title ?? "").trim();
      if (!label) return null;
      return {
        label,
        frequencyPct: num(f.frequencyPct ?? f.frequency_pct),
        mentionCount: num(f.mentionCount ?? f.mention_count),
        quotes: strings(f.quotes).slice(0, 3),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
}

export function normalisiereInsights(raw: unknown): Kern {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    painPoints: findings(o.painPoints ?? o.pain_points),
    buyingTriggers: findings(o.buyingTriggers ?? o.buying_triggers),
    languageToBorrow: strings(o.languageToBorrow ?? o.language_to_borrow ?? o.language_to_borrow_from_real_reviews),
    languageToAvoid: strings(o.languageToAvoid ?? o.language_to_avoid),
  };
}

/** Kompletter Lese-Schutz fürs Dashboard: auch sources/stats absichern. */
export function normalisierePayload(raw: unknown): ReviewInsightsPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const stats = (o.stats ?? {}) as Record<string, unknown>;
  return {
    sources: strings(o.sources),
    stats: { reviewsTotal: num(stats.reviewsTotal) ?? 0, ratingAvg: num(stats.ratingAvg) },
    ...normalisiereInsights(o),
  };
}
