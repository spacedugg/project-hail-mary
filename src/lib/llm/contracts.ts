import { RULES } from "@/lib/validation/rules";

/** Sektions-Schlüssel — bewusst hier dupliert statt aus listing.ts importiert (kein Import-Zyklus über die Kontrakt-Grenze). */
export type KontraktSektion = "title" | "bullets" | "highlights" | "backend" | "description" | "qa";

/**
 * Daten-Kontrakte an der LLM-Grenze (D183): Jede Sektion hat ein Schema mit
 * Pflichtfeldern, Typen und Anzahlen. Was das Schema nicht erfüllt, wird an
 * der GRENZE abgewiesen (→ Korrektur-Versuch mit konkreter Fehlermeldung) —
 * nie stillschweigend weitergereicht, nie „String(parsed.x ?? '') und hoffen".
 * Bewusst ohne externe Schema-Lib: die sechs Kontrakte sind klein, die
 * Fehlermeldungen sollen deutsch und LLM-tauglich präzise sein.
 */

export type KontraktVerstoss = { feld: string; problem: string };

function istNichtLeererString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function pruefeRationale(parsed: Record<string, unknown>, verstoesse: KontraktVerstoss[]): void {
  if (!Array.isArray(parsed.rationale) || parsed.rationale.length === 0) {
    verstoesse.push({ feld: "rationale", problem: "fehlt oder ist leer — Begründungs-Pflicht: Array aus {part, source}." });
    return;
  }
  for (const [i, r] of (parsed.rationale as unknown[]).entries()) {
    const o = r as { part?: unknown; source?: unknown };
    if (!o || !istNichtLeererString(o.part) || !istNichtLeererString(o.source))
      verstoesse.push({ feld: `rationale[${i}]`, problem: "braucht nicht-leere Strings part UND source." });
  }
}

/**
 * Prüft das geparste LLM-JSON gegen den Sektions-Kontrakt.
 * Leeres Ergebnis = Kontrakt erfüllt. Jeder Eintrag ist eine präzise,
 * ans LLM zurückspielbare Abweisung.
 */
export function pruefeKontrakt(section: KontraktSektion, parsed: Record<string, unknown>): KontraktVerstoss[] {
  const verstoesse: KontraktVerstoss[] = [];

  switch (section) {
    case "title":
      if (!istNichtLeererString(parsed.title))
        verstoesse.push({ feld: "title", problem: "muss ein nicht-leerer String sein." });
      break;
    case "highlights":
      if (!istNichtLeererString(parsed.highlights))
        verstoesse.push({ feld: "highlights", problem: "muss ein nicht-leerer String sein." });
      break;
    case "backend":
      if (!istNichtLeererString(parsed.backend))
        verstoesse.push({ feld: "backend", problem: "muss ein nicht-leerer String sein (Leerzeichen-getrennte Einzelwörter)." });
      break;
    case "description":
      if (!istNichtLeererString(parsed.description))
        verstoesse.push({ feld: "description", problem: "muss ein nicht-leerer String sein." });
      break;
    case "bullets": {
      if (!Array.isArray(parsed.bullets)) {
        verstoesse.push({ feld: "bullets", problem: `muss ein Array aus genau ${RULES.bullets.count} Strings sein.` });
        break;
      }
      if (parsed.bullets.length !== RULES.bullets.count)
        verstoesse.push({ feld: "bullets", problem: `enthält ${parsed.bullets.length} statt genau ${RULES.bullets.count} Einträge.` });
      for (const [i, b] of (parsed.bullets as unknown[]).entries())
        if (!istNichtLeererString(b))
          verstoesse.push({ feld: `bullets[${i}]`, problem: "muss ein nicht-leerer String sein." });
      break;
    }
    case "qa": {
      if (!Array.isArray(parsed.pairs)) {
        verstoesse.push({ feld: "pairs", problem: `muss ein Array aus genau ${RULES.qa.pairs} Objekten {q, a} sein.` });
        break;
      }
      if (parsed.pairs.length !== RULES.qa.pairs)
        verstoesse.push({ feld: "pairs", problem: `enthält ${parsed.pairs.length} statt genau ${RULES.qa.pairs} Paare.` });
      for (const [i, p] of (parsed.pairs as unknown[]).entries()) {
        const o = p as { q?: unknown; a?: unknown };
        if (!o || !istNichtLeererString(o.q) || !istNichtLeererString(o.a))
          verstoesse.push({ feld: `pairs[${i}]`, problem: "braucht nicht-leere Strings q UND a." });
      }
      break;
    }
  }

  pruefeRationale(parsed, verstoesse);
  return verstoesse;
}

/** Kontrakt-Verstöße als Korrektur-Text fürs LLM (eine Zeile pro Abweisung). */
export function kontraktVerstoesseAlsText(verstoesse: KontraktVerstoss[]): string {
  return verstoesse.map((v) => `Feld „${v.feld}": ${v.problem}`).join("\n");
}
