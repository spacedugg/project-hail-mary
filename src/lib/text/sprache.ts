import type { ContentSprache, Marketplace } from "@/db/schema";

/**
 * Mehrsprachigkeit & Lokalisierung (D128): Content-Sprache je Produkt,
 * unabhängig vom Marktplatz. Grundprinzip: lokalisieren, nicht übersetzen.
 *
 * Die Sprach-Erkennung ist eine HEURISTIK über die GESAMTE Textmenge
 * (einzelne Keywords sind sprachlich mehrdeutig — „Camping" ist deutsch,
 * englisch und französisch). Sie urteilt nur, wenn sie sicher ist; bei
 * schwachem Signal bleibt sie ehrlich passiv („unbekannt") — Gates blocken
 * NUR bei sicherem Widerspruch, nie bei Unsicherheit.
 */

export type { ContentSprache };

export const SPRACH_NAMEN: Record<ContentSprache, string> = {
  de: "Deutsch",
  en: "Englisch",
  fr: "Französisch",
  it: "Italienisch",
  es: "Spanisch",
};

/** Welche Sprache spricht ein Marktplatz? (nl hat keine Content-Sprache im Tool → null) */
export function marktplatzSprache(mp: Marketplace): ContentSprache | null {
  switch (mp) {
    case "de": return "de";
    case "uk": return "en";
    case "us": return "en";
    case "fr": return "fr";
    case "it": return "it";
    case "es": return "es";
    default: return null;
  }
}

/** Auf welchem Marktplatz wird für eine Content-Sprache gescrapt/analysiert? */
export function marktplatzFuerSprache(sprache: ContentSprache): Marketplace {
  switch (sprache) {
    case "de": return "de";
    case "en": return "uk";
    case "fr": return "fr";
    case "it": return "it";
    case "es": return "es";
  }
}

/** Echte Amazon-Domain je Marktplatz (amazon.uk existiert nicht — co.uk). */
export function amazonDomain(mp: Marketplace): string {
  switch (mp) {
    case "uk": return "co.uk";
    case "us": return "com";
    default: return mp;
  }
}

/**
 * Sprach-Pinning für Produktseiten-URLs (D191, Nutzer-Befund 23.07.):
 * Amazon liefert je nach Client-Signal die MASCHINENÜBERSETZTE Sprachansicht
 * (amazon.de → englische Ansicht mit Artefakten wie „furry nose" für
 * „Fellnase"). Der ?language=-Parameter pinnt die Original-Sprache des
 * Marktplatzes — ohne ihn auditiert das Tool eine Übersetzung statt des Listings.
 */
export function amazonSprachParam(mp: Marketplace): string | null {
  switch (mp) {
    case "de": return "de_DE";
    case "uk": return "en_GB";
    case "us": return "en_US";
    case "fr": return "fr_FR";
    case "it": return "it_IT";
    case "es": return "es_ES";
    default: return null;
  }
}

// ── Heuristik: Signal-Wörter (Funktionswörter, die in Keyword-Listen und
// Fließtext vorkommen) + charakteristische Zeichen + typische Endungen ──

const SIGNALE: Record<ContentSprache, { woerter: Set<string>; zeichen: RegExp; endungen: RegExp }> = {
  de: {
    woerter: new Set(["der", "die", "das", "und", "mit", "für", "aus", "von", "ohne", "gegen", "zum", "zur", "bei", "nicht", "klein", "groß", "gross", "set", "stück", "damen", "herren", "kinder"]),
    zeichen: /[äöüß]/g,
    endungen: /(ung|keit|heit|chen|lich|isch|schaft)\b|sch/g,
  },
  en: {
    woerter: new Set(["the", "with", "for", "and", "of", "to", "without", "small", "large", "set", "pack", "men", "women", "kids", "stainless", "steel", "bottle", "black", "white"]),
    zeichen: /\b(th|wh)/g,
    endungen: /(ing|ness|ship|able|less)\b/g,
  },
  fr: {
    woerter: new Set(["le", "la", "les", "de", "des", "du", "pour", "avec", "sans", "et", "en", "petit", "grand", "acier", "inoxydable", "bouteille", "enfant", "homme", "femme", "noir", "blanc"]),
    zeichen: /[éèêëàâçœù]/g,
    endungen: /(tion|ment|eur|euse|aise|able)\b/g,
  },
  it: {
    woerter: new Set(["il", "lo", "la", "le", "di", "da", "per", "con", "senza", "e", "ed", "piccolo", "grande", "acciaio", "inossidabile", "bottiglia", "bambini", "uomo", "donna", "nero", "bianco"]),
    zeichen: /[àèéìòù]/g,
    endungen: /(zione|mente|ezza|aggio|oso|osa)\b/g,
  },
  es: {
    woerter: new Set(["el", "los", "la", "las", "de", "del", "para", "con", "sin", "y", "pequeño", "grande", "acero", "inoxidable", "botella", "niños", "hombre", "mujer", "negro", "blanco"]),
    zeichen: /[ñ¿¡]|(?:ción)/g,
    endungen: /(ción|miento|idad|able|oso|osa)\b/g,
  },
};

/**
 * Erkennt die Sprache einer Textmenge (z. B. alle Keywords einer Basis oder
 * alle Review-Texte). Liefert nur dann eine Sprache, wenn das Signal klar ist:
 * Top-Score ≥ 3 UND mindestens 1,5× so stark wie der Zweitplatzierte.
 */
export function erkenneSprache(texte: string[]): { sprache: ContentSprache | null; scores: Record<ContentSprache, number> } {
  const gesamt = texte.join(" ").toLowerCase();
  const woerter = gesamt.split(/[^a-zäöüßéèêëàâçœùìòñ¿¡']+/).filter(Boolean);
  const scores = {} as Record<ContentSprache, number>;
  for (const sprache of Object.keys(SIGNALE) as ContentSprache[]) {
    const s = SIGNALE[sprache];
    const wortTreffer = woerter.filter((w) => s.woerter.has(w)).length;
    const zeichenTreffer = (gesamt.match(s.zeichen) ?? []).length;
    const endungsTreffer = (gesamt.match(s.endungen) ?? []).length;
    scores[sprache] = wortTreffer * 2 + zeichenTreffer + endungsTreffer * 0.5;
  }
  const sortiert = (Object.entries(scores) as Array<[ContentSprache, number]>).sort((a, b) => b[1] - a[1]);
  const [erste, zweite] = sortiert;
  const sicher = erste[1] >= 3 && erste[1] >= (zweite?.[1] ?? 0) * 1.5;
  return { sprache: sicher ? erste[0] : null, scores };
}
