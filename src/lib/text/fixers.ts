/**
 * Deterministische Fixer (D184): Was Code selbst korrigieren kann, korrigiert
 * Code — VOR jedem Regenerier-Versuch, ohne LLM-Roundtrip, reproduzierbar.
 * Bewusst nur verlustfreie Korrekturen: nichts, was Bedeutung ändern könnte.
 */

/** Mehrfach-Leerzeichen, Leerraum vor Satzzeichen und Randleerraum entfernen. */
export function fixeWhitespace(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/ ([.,;:!?])/g, "$1")
    .trim();
}

/** Fixer für Listen-Payloads (Bullets). */
export function fixeWhitespaceListe(items: string[]): string[] {
  return items.map(fixeWhitespace);
}
