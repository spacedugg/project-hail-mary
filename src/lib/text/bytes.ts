/**
 * Byte-genaue Textmaße (kanonisch: TextEncoder, NICHT String.length).
 * Deutsche Umlaute/ß = 2 Bytes — die seo-os-Fehlerlektion (SALVAGE §2).
 */

const encoder = new TextEncoder();

export function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/** Grapheme-bewusste Zeichenzählung (Amazon zählt Zeichen beim Titel). */
export function charLength(s: string): number {
  return [...new Intl.Segmenter("de", { granularity: "grapheme" }).segment(s)].length;
}

/** Wortweise auf ein Byte-Limit trimmen (temoa-os enforceByteLimit-Muster). */
export function trimToBytesByWord(s: string, maxBytes: number): string {
  if (byteLength(s) <= maxBytes) return s;
  const words = s.split(/\s+/);
  let out = "";
  for (const w of words) {
    const candidate = out ? `${out} ${w}` : w;
    if (byteLength(candidate) > maxBytes) break;
    out = candidate;
  }
  return out;
}

/** Am Satzende auf ein Byte-Limit trimmen (Beschreibung, temoa-os-Muster). */
export function trimToBytesBySentence(s: string, maxBytes: number): string {
  if (byteLength(s) <= maxBytes) return s;
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s];
  let out = "";
  for (const sentence of sentences) {
    const candidate = out + sentence;
    if (byteLength(candidate) > maxBytes) break;
    out = candidate;
  }
  return out.trim() || trimToBytesByWord(s, maxBytes);
}

/** Einfacher deutscher Wortstamm-Vergleich für Dedup-Checks (bewusst konservativ). */
export function normalizeToken(w: string): string {
  return w
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(en|er|es|e|s|n)$/, "");
}
