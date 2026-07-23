import { charLength } from "./bytes";

/**
 * Deterministische Fixer (D184): Was Code selbst korrigieren kann, korrigiert
 * Code — VOR jedem Regenerier-Versuch, ohne LLM-Roundtrip, reproduzierbar.
 * Bewusst nur verlustfreie/verlustarme Korrekturen: nichts, was Bedeutung
 * erfinden könnte.
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

/**
 * Titel deterministisch aufs Amazon-Limit kürzen (D184/D192, Live-Befund
 * 23.07.: 3× 77 Zeichen trotz Korrektur-Auftrag — LLMs können nicht
 * zuverlässig Zeichen zählen, Code schon). Gekürzt wird verlustarm von
 * hinten: erst ganze Komma-/Gedankenstrich-Segmente, dann einzelne Wörter.
 * Ein Kandidat gilt nur, wenn er im Pflichtband [min, max] liegt UND
 * `istZulaessig` besteht (z. B. Hauptkeyword-Abdeckung). Zu KURZE Titel
 * fixt Code bewusst nicht — Inhalt erfinden ist verboten (Fakten-Sperre).
 */
export function fixeTitelLaenge(
  titel: string,
  opts: { max: number; min: number; istZulaessig?: (kandidat: string) => boolean },
): string {
  const zulaessig = (s: string) =>
    charLength(s) <= opts.max && charLength(s) >= opts.min && (opts.istZulaessig?.(s) ?? true);
  const abschneiden = (s: string, idx: number) => s.slice(0, idx).trim().replace(/[,;:·|–—-]+\s*$/, "").trim();

  const t = fixeWhitespace(titel);
  if (charLength(t) <= opts.max) return t;

  // Stufe 1: letzte Segmente entfernen (", " / " – " / " — " / " - ")
  let kandidat = t;
  while (charLength(kandidat) > opts.max) {
    const idx = Math.max(
      kandidat.lastIndexOf(", "),
      kandidat.lastIndexOf(" – "),
      kandidat.lastIndexOf(" — "),
      kandidat.lastIndexOf(" - "),
    );
    if (idx <= 0) break;
    kandidat = abschneiden(kandidat, idx);
  }
  if (zulaessig(kandidat)) return kandidat;

  // Stufe 2: einzelne Wörter von hinten (feiner, überspringt das Band seltener)
  kandidat = t;
  while (charLength(kandidat) > opts.max) {
    const idx = kandidat.lastIndexOf(" ");
    if (idx <= 0) break;
    kandidat = abschneiden(kandidat, idx);
  }
  if (zulaessig(kandidat)) return kandidat;

  // Nicht verlustarm kürzbar (z. B. Kürzung fiele unters Pflichtband oder
  // verlöre das Hauptkeyword) → unverändert zurück, das Gate erzwingt dann
  // die Regenerierung mit konkretem Auftrag.
  return t;
}
