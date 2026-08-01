import type { ReviewInsightsPayload, AspektHerkunft, AspektUebertragbarkeit } from "@/db/schema";

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

/**
 * Herkunfts-Zählung (eigene/fremde Fundstellen, D196) render-sicher übernehmen.
 * MUSS die Verdichtung überleben (D206) — sonst greift bei der Text-Generierung
 * nie der strategische Herkunfts/Übertragbarkeits-Block (contextBlock).
 */
function normHerkunft(v: unknown): AspektHerkunft | undefined {
  if (!v || typeof v !== "object") return undefined;
  const h = v as Record<string, unknown>;
  const eigene = num(h.eigene);
  const fremde = num(h.fremde);
  if (eigene === null && fremde === null) return undefined;
  const jeAsin: Record<string, number> = {};
  if (h.jeAsin && typeof h.jeAsin === "object")
    for (const [k, val] of Object.entries(h.jeAsin as Record<string, unknown>)) {
      const n = num(val);
      if (n !== null) jeAsin[k] = n;
    }
  return { eigene: eigene ?? 0, fremde: fremde ?? 0, jeAsin };
}

/** Übertragbarkeits-Urteil (ja/nein/unbekannt) render-sicher übernehmen (D206). */
function normUebertragbarkeit(v: unknown): AspektUebertragbarkeit | undefined {
  if (!v || typeof v !== "object") return undefined;
  const u = v as Record<string, unknown>;
  const urteil = u.urteil === "ja" || u.urteil === "nein" || u.urteil === "unbekannt" ? u.urteil : null;
  if (!urteil) return undefined;
  return { urteil, grund: String(u.grund ?? "").trim() };
}

function findings(v: unknown): Kern["painPoints"] {
  return arr(v)
    .map((x) => {
      const f = (x ?? {}) as Record<string, unknown>;
      const label = String(f.label ?? f.title ?? "").trim();
      if (!label) return null;
      const herkunft = normHerkunft(f.herkunft);
      const uebertragbarkeit = normUebertragbarkeit(f.uebertragbarkeit);
      return {
        label,
        frequencyPct: num(f.frequencyPct ?? f.frequency_pct),
        mentionCount: num(f.mentionCount ?? f.mention_count),
        // bis zu 15 Fundstellen je Aspekt (D170) — Basis des echten Zählwerts
        quotes: strings(f.quotes).slice(0, 15),
        // Herkunft + Übertragbarkeit durch die Verdichtung retten (D206)
        ...(herkunft ? { herkunft } : {}),
        ...(uebertragbarkeit ? { uebertragbarkeit } : {}),
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
          // D275: Herkunft/Übertragbarkeit beim Lesen NICHT verlieren — sonst
          // wäre die Aufschlüsselung nach dem ersten Reload wieder weg.
          const herkunft = normHerkunft(a.herkunft);
          const uebertragbarkeit = normUebertragbarkeit(a.uebertragbarkeit);
          return {
            label,
            typ,
            mentionCount: num(a.mentionCount),
            ...(herkunft ? { herkunft } : {}),
            ...(uebertragbarkeit ? { uebertragbarkeit } : {}),
          };
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
    // Zuständigkeits-Gate (D266) — beim Lesen NICHT verlieren, sonst wäre das
    // Produkt-Feedback nach dem ersten Reload weg.
    produktFeedback: Array.isArray(o.produktFeedback)
      ? o.produktFeedback
          .map((x) => {
            const f = (x ?? {}) as Record<string, unknown>;
            const label = String(f.label ?? "").trim();
            return label
              ? { label, typ: f.typ === "buyingTrigger" ? ("buyingTrigger" as const) : ("painPoint" as const), mentionCount: num(f.mentionCount) }
              : null;
          })
          .filter((f): f is NonNullable<typeof f> => f !== null)
      : undefined,
    ausgeschlossenAmazon: strings(o.ausgeschlossenAmazon).length ? strings(o.ausgeschlossenAmazon) : undefined,
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

/**
 * Anzeige-Deckel für Roh-Findings (D273, Nutzer-Vorgabe 01.08.2026).
 *
 * „Nicht mehr als 10 negative oder 10 positive Bewertungs-Findings auflisten,
 * weil das irgendwann viel zu viel wird und ich gar nicht mehr weiß: Was ist
 * jetzt wirklich wichtig? Vielleicht auf acht beschränken und dann natürlich
 * die WICHTIGSTEN acht nehmen."
 *
 * Wichtig = am häufigsten in Reviews mit verifizierter Fundstelle belegt
 * (`mentionCount`, D170 — ein echter Zählwert, keine LLM-Schätzung). Findings
 * ohne Zählwert landen hinten, aber nicht im Nichts: bei gleichem Rang bleibt
 * die ursprüngliche Reihenfolge erhalten (stabile Sortierung).
 *
 * Der Code entscheidet, nicht das LLM (D184): Die Analyse darf ruhig mehr
 * Themen finden — gespeichert bleibt alles, angezeigt wird die Spitze.
 */
export const FINDINGS_ANZEIGE_MAX = 8;

export function wichtigsteFindings<T extends { mentionCount: number | null }>(
  liste: T[],
  max: number = FINDINGS_ANZEIGE_MAX,
): T[] {
  return [...liste]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (b.f.mentionCount ?? -1) - (a.f.mentionCount ?? -1) || a.i - b.i)
    .slice(0, Math.max(0, max))
    .map((x) => x.f);
}
