import { resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";
import { bildContentBlocks, visionCall, visionUrls } from "./bildVision";

/**
 * Bild-Audit (D211) — 4-Faktoren-Einschätzung der BESTEHENDEN Listing-Bilder.
 *
 * Zweck: vor der Optimierung sichtbar machen, welche Bilder in welchem Faktor am
 * schwächsten sind und WARUM (je Bild Score 0–5 + „was wir sehen / warum / wie
 * besser"). Läuft als automatischer Schritt beim Listing-Import (kein Extra-Knopf,
 * keine eigene UI) — es kommen einfach mehr Analyse-Daten heraus.
 *
 * Abgrenzung (D210/D211): KEINE separate Eye-catcher-Analyse. Drei Faktoren
 * (D217, Nutzer 27.07. — „Wahrgenommene Wertigkeit" entfernt, war nicht umsetzbar):
 *   design   — Handwerk/Bildqualität: Komposition, Hierarchie, Schärfe/Licht, nicht überladen
 *   message  — Botschaft: sind die richtigen, belegten Kaufargumente/USPs stark präsent
 *   clarity  — Klarheit: eine klare Kernaussage, lesbar auch als Handy-Thumbnail
 * Botschaft und Klarheit bleiben getrennt, weil sie zu unterschiedlichen Fixes führen
 * (fehlendes Argument ergänzen vs. Text lesbarer machen).
 *
 * Architektur wie bildAuslese: „LLM liefert Bausteine, Code erzwingt." Ohne
 * API-Key → null (ehrlich „nicht bewertet"), NIE ein Mock (erfundene Noten wären
 * Gift für die Priorisierung).
 */

export const AUDIT_DIMENSIONEN = ["design", "message", "clarity"] as const;
export type AuditDimension = (typeof AUDIT_DIMENSIONEN)[number];

export const AUDIT_LABELS: Record<AuditDimension, string> = {
  design: "Design",
  message: "Botschaft",
  clarity: "Klarheit",
};

// Aufmerksam, aber fair bewerten (D242, Nutzer-Befund 28.07.): Ohne Anker urteilt
// das Modell milde und clustert alles bei 4. Darum je Faktor benannte Schwächen,
// die die Note MERKLICH drücken — proportional, KEIN starres Minimum, kein Beleg-Zwang.
const AUDIT_KRITERIUM: Record<AuditDimension, string> = {
  design:
    "Handwerk & Verkaufswirkung: Unterstützt das Bild den Verkauf? Merklich DRÜCKEN (proportional, kein Automatik-Minimum): " +
    "schwacher Kontrast Produkt↔Hintergrund / Produkt hebt sich nicht ab; Produkt schlecht erkennbar; kein Lifestyle/keine " +
    "Emotion, wo es helfen würde; keine gezeigten Features/Nutzen; im GESAMTEN Set kein Mensch UND keine echten Nahaufnahmen; " +
    "generischer/veralteter Look. Einfarbiger Hintergrund ist OK — DANN muss das Produkt aber top erkennbar, scharf und " +
    "kontrastreich stehen. Durchgängige CI ist Grundlage, kein Extra-Pluspunkt. 4–5 für klar verkaufsfähige, starke Bilder.",
  message:
    "Botschaft: transportiert das Bild ein konkretes, belegtes Kaufargument/USP (passend zu den Listing-Texten)? " +
    "Rein dekorativ ohne Argument oder nur Marken-/Produktname drückt die Note. 4–5 nur bei klar transportiertem, belegtem Nutzen.",
  clarity:
    "Klarheit & Lesbarkeit: eine klare Kernaussage, auch als kleines Handy-Thumbnail lesbar. Zu geringer Text-Kontrast " +
    "(z. B. Schwarz auf Dunkelgrün, Weiß auf Hell) oder zu kleine Schrift drückt die Note deutlich; überladen / mehrere " +
    "konkurrierende Aussagen ebenso.",
};

export type BildFaktor = {
  /** 0–5, eine Nachkommastelle; null = vom Modell nicht bewertet (nicht geraten). */
  score: number | null;
  wasWirSehen: string;
  warum: string;
  wieBesser: string;
};
export type BildAudit = { slot: number; faktoren: Record<AuditDimension, BildFaktor> };
export type BildAuditErgebnis = { bilder: BildAudit[] };

const LEER_FAKTOR: BildFaktor = { score: null, wasWirSehen: "", warum: "", wieBesser: "" };

function normFaktor(raw: unknown): BildFaktor {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const s = Number(o.score);
  return {
    score: Number.isFinite(s) ? Math.max(0, Math.min(5, Math.round(s * 10) / 10)) : null,
    wasWirSehen: str(o.wasWirSehen, 400),
    warum: str(o.warum, 400),
    wieBesser: str(o.wieBesser, 400),
  };
}

/** Struktur erzwingen: gültige Slots, Scores geklemmt (0–5), alle drei Faktoren vorhanden, Dedup, sortiert. */
export function normalisiereBildAudit(raw: unknown, anzahlBilder: number): BildAuditErgebnis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const bilder = (Array.isArray(o.bilder) ? o.bilder : [])
    .map((x) => {
      const b = (x ?? {}) as Record<string, unknown>;
      const slot = Math.round(Number(b.slot));
      if (!Number.isFinite(slot) || slot < 1 || slot > anzahlBilder) return null;
      const roh = (b.faktoren ?? {}) as Record<string, unknown>;
      const faktoren = Object.fromEntries(
        AUDIT_DIMENSIONEN.map((d) => [d, d in roh ? normFaktor(roh[d]) : LEER_FAKTOR]),
      ) as Record<AuditDimension, BildFaktor>;
      return { slot, faktoren };
    })
    .filter((b): b is BildAudit => b !== null)
    .filter((b, i, arr) => arr.findIndex((x) => x.slot === b.slot) === i)
    .sort((a, b) => a.slot - b.slot);
  return { bilder };
}

/** Das schwächste Bild je Faktor — für die Priorisierung vor der Optimierung. */
export function schwaechstesBildProFaktor(audit: BildAuditErgebnis): Partial<Record<AuditDimension, { slot: number; score: number }>> {
  const out: Partial<Record<AuditDimension, { slot: number; score: number }>> = {};
  for (const d of AUDIT_DIMENSIONEN) {
    let min: { slot: number; score: number } | null = null;
    for (const b of audit.bilder) {
      const s = b.faktoren[d].score;
      if (s === null) continue;
      if (!min || s < min.score) min = { slot: b.slot, score: s };
    }
    if (min) out[d] = min;
  }
  return out;
}

function buildPrompt(anzahl: number, sprache: string, ausleseText?: string): string {
  const dims = AUDIT_DIMENSIONEN.map((d) => `"${d}" (${AUDIT_LABELS[d]}): ${AUDIT_KRITERIUM[d]}`).join("\n");
  return `AUFGABE: Bewerte die ${anzahl} Listing-Bilder oben aufmerksam und fair (Antwort-Sprache "${sprache}").
${ausleseText ? `\nKONTEXT — was auf den Bildern erkannt wurde:\n${ausleseText.slice(0, 4000)}\n` : ""}
Die meisten Amazon-Bilder sind solide Mittelklasse (um 3) — vergib 4 nicht reflexartig. Score-Anker (0–5):
0–1 = grober Mangel · 2 = deutlich schwach · 3 = solide, aber unauffällig/verbesserungswürdig · 4 = stark, klar verkaufsfördernd · 5 = herausragend.
Sichtbare Schwächen (schwacher Kontrast, Produkt schlecht erkennbar, kein Lifestyle/Feature wo nötig, unlesbarer Text) MÜSSEN sich in der Note niederschlagen — proportional dazu, wie stark sie den Verkauf beeinträchtigen. Kein starres Minimum, keine Rechtfertigungspflicht.

Je Bild und je Faktor: score (0–5, eine Nachkommastelle), wasWirSehen (1 Satz Beobachtung), warum (1 Satz: warum das für den Verkauf zählt), wieBesser (1 Satz konkreter Fix).
Bewerte diese drei Faktoren:
${dims}

Trenne bewusst: design = Handwerk/Verkaufswirkung, message = welche belegten Kaufargumente da sind, clarity = wie klar/lesbar es rüberkommt.
JSON-Schema:
{"bilder":[{"slot":1,"faktoren":{"design":{"score":3,"wasWirSehen":"...","warum":"...","wieBesser":"..."},"message":{...},"clarity":{...}}}]}`;
}

export async function auditBilder(imageUrls: string[], sprache = "de", ausleseText?: string): Promise<BildAuditErgebnis | null> {
  const urls = visionUrls(imageUrls);
  if (urls.length === 0) return null;
  const { provider, model } = resolveRecipe("listing.bild-audit");
  if (provider.name !== "anthropic" || !process.env.ANTHROPIC_API_KEY) return null; // kein Mock — ehrlich „nicht bewertet"

  // Identischer Bild-Prefix wie die Auslese → wird aus dem Cache gelesen statt neu übertragen.
  const text = await visionCall({ model, blocks: bildContentBlocks(urls), aufgabe: buildPrompt(urls.length, sprache, ausleseText) });
  return normalisiereBildAudit(parseLlmJson(text), urls.length);
}
