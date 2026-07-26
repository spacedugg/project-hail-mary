import { resolveRecipe } from "@/lib/llm/registry";
import { parseLlmJson } from "@/lib/llm/json";

/**
 * Bild-Audit (D211) — 4-Faktoren-Einschätzung der BESTEHENDEN Listing-Bilder.
 *
 * Zweck: vor der Optimierung sichtbar machen, welche Bilder in welchem Faktor am
 * schwächsten sind und WARUM (je Bild Score 0–5 + „was wir sehen / warum / wie
 * besser"). Läuft als automatischer Schritt beim Listing-Import (kein Extra-Knopf,
 * keine eigene UI) — es kommen einfach mehr Analyse-Daten heraus.
 *
 * Abgrenzung (D210/D211): KEINE separate Eye-catcher-Analyse. Die vier Faktoren
 * stammen aus `knowledge/bilder/bild-prinzipien.md` (Achse C):
 *   design           — Komposition, Hierarchie, Ausrichtung, Farb-Kohärenz, nicht überladen
 *   perceivedValue   — wirkt hochwertig/Premium (Grafik, Typo, Material-Anmutung)
 *   messageStrength  — starke, belegte Kaufargumente/USPs klar transportiert
 *   messageClarity   — eine Kernaussage je Bild, lesbar auch als Handy-Thumbnail
 *
 * Architektur wie bildAuslese: „LLM liefert Bausteine, Code erzwingt." Ohne
 * API-Key → null (ehrlich „nicht bewertet"), NIE ein Mock (erfundene Noten wären
 * Gift für die Priorisierung).
 */

export const AUDIT_DIMENSIONEN = ["design", "perceivedValue", "messageStrength", "messageClarity"] as const;
export type AuditDimension = (typeof AUDIT_DIMENSIONEN)[number];

export const AUDIT_LABELS: Record<AuditDimension, string> = {
  design: "Design & Bildqualität",
  perceivedValue: "Wahrgenommene Wertigkeit",
  messageStrength: "Botschafts-Stärke",
  messageClarity: "Botschafts-Klarheit",
};

const AUDIT_KRITERIUM: Record<AuditDimension, string> = {
  design: "Komposition, visuelle Hierarchie, Ausrichtung, konsistentes Farbschema, Studio-Licht; nicht überladen (Elemente konkurrieren nicht um Aufmerksamkeit). Tiefe/Überlagerung von Elementen zahlt positiv ein.",
  perceivedValue: "Wirkt das Bild hochwertig/Premium — Grafik-Qualität, Typografie, Material-Anmutung? Stärkt es Vertrauen und Zahlungsbereitschaft?",
  messageStrength: "Sind starke, belegte Kaufargumente/USPs klar transportiert?",
  messageClarity: "Eine klare Kernaussage je Bild, gut lesbar auch als kleines Handy-Thumbnail (Schriftgröße, Kontrast, Gruppierung).",
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

/** Struktur erzwingen: gültige Slots, Scores geklemmt (0–5), alle vier Faktoren vorhanden, Dedup, sortiert. */
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

const SYSTEM =
  "Du bist Senior-Amazon-Bild-Art-Director und bewertest Listing-Bilder ehrlich und kundentauglich. " +
  "Du bewertest NUR anhand des sichtbaren Bildes — nichts erfinden. Antworte AUSSCHLIESSLICH mit validem JSON.";

const MAX_BILDER = 9;

function buildPrompt(anzahl: number, sprache: string, ausleseText?: string): string {
  const dims = AUDIT_DIMENSIONEN.map((d) => `"${d}" (${AUDIT_LABELS[d]}): ${AUDIT_KRITERIUM[d]}`).join("\n");
  return `AUFGABE: Bewerte die ${anzahl} Listing-Bilder oben (Antwort-Sprache "${sprache}").
${ausleseText ? `\nKONTEXT — was auf den Bildern erkannt wurde:\n${ausleseText.slice(0, 4000)}\n` : ""}
Je Bild und je Faktor: score (0–5, ehrlich, eine Nachkommastelle), wasWirSehen (1 Satz Beobachtung), warum (1 Satz: warum das für den Verkauf zählt), wieBesser (1 Satz konkreter Fix).
Bewerte diese vier Faktoren:
${dims}

Trenne bewusst Handwerk/Anmutung (design, perceivedValue) von Botschaft (messageStrength, messageClarity).
JSON-Schema:
{"bilder":[{"slot":1,"faktoren":{"design":{"score":3,"wasWirSehen":"...","warum":"...","wieBesser":"..."},"perceivedValue":{...},"messageStrength":{...},"messageClarity":{...}}}]}`;
}

export async function auditBilder(imageUrls: string[], sprache = "de", ausleseText?: string): Promise<BildAuditErgebnis | null> {
  const urls = imageUrls.filter((u) => u.startsWith("https://")).slice(0, MAX_BILDER);
  if (urls.length === 0) return null;
  const { provider, model } = resolveRecipe("listing.bild-audit");
  if (provider.name !== "anthropic" || !process.env.ANTHROPIC_API_KEY) return null; // kein Mock — ehrlich „nicht bewertet"

  type Block = { type: string; [k: string]: unknown };
  const content: Block[] = urls.flatMap((url, i) => [
    { type: "text", text: `BILD ${i + 1}${i === 0 ? " (HAUPTBILD)" : ""}:` },
    { type: "image", source: { type: "url", url } },
  ]);
  content.push({ type: "text", text: buildPrompt(urls.length, sprache, ausleseText) });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Bild-Audit: Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return normalisiereBildAudit(parseLlmJson(text), urls.length);
}
