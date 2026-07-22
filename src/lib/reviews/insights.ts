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

/** Insight-Karten (D131/D132) beim LESEN absichern — validiert geschrieben, trotzdem render-sicher. */
function karten(v: unknown): ReviewInsightsPayload["insightCards"] {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const titel = String(c.titel ?? "").trim();
      const beschreibung = String(c.beschreibung ?? "").trim();
      if (!titel) return null;
      const beleg = arr(c.belegAspekte)
        .map((b) => {
          const a = (b ?? {}) as Record<string, unknown>;
          const label = String(a.label ?? "").trim();
          if (!label) return null;
          const typ = a.typ === "painPoint" ? ("painPoint" as const) : ("buyingTrigger" as const);
          return { label, typ, mentionCount: num(a.mentionCount) };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
      const rel = num(c.relevanz);
      return {
        titel,
        beschreibung,
        relevanz: rel !== null ? Math.min(5, Math.max(1, Math.round(rel))) : 3,
        quellen: strings(c.quellen),
        bildIdeen: strings(c.bildIdeen).slice(0, 3),
        belegAspekte: beleg,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  return out.length ? out : undefined;
}

/** Kompletter Lese-Schutz fürs Dashboard: auch sources/stats absichern. */
export function normalisierePayload(raw: unknown): ReviewInsightsPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const stats = (o.stats ?? {}) as Record<string, unknown>;
  const kernThese = String(o.kernThese ?? "").trim();
  return {
    sources: strings(o.sources),
    stats: { reviewsTotal: num(stats.reviewsTotal) ?? 0, ratingAvg: num(stats.ratingAvg) },
    ...normalisiereInsights(o),
    // Verdichtungs-Felder (D131/D143) NICHT verlieren — Lese-Reparatur inklusive
    qualitaetsNotizen: strings(o.qualitaetsNotizen).length ? strings(o.qualitaetsNotizen) : undefined,
    insightCards: karten(o.insightCards),
    kernThese: kernThese || null,
    verworfeneKarten: num(o.verworfeneKarten) ?? undefined,
    entfernteBildIdeen: Array.isArray(o.entfernteBildIdeen)
      ? o.entfernteBildIdeen
          .map((x) => {
            const e = (x ?? {}) as Record<string, unknown>;
            const idee = String(e.idee ?? "").trim();
            return idee ? { idee, grund: String(e.grund ?? "").trim() } : null;
          })
          .filter((e): e is NonNullable<typeof e> => e !== null)
      : undefined,
  };
}
