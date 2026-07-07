/**
 * Zentrale, versionierte Regel-Konstanten — Single Source of Truth für
 * Generierung UND Validierung (Leitprinzip 3: "LLM generiert, Code erzwingt").
 * Werte kommen aus knowledge/content/*.md (dort mit Quellen & Konfliktauflösung).
 */

export const RULES = {
  title: {
    maxChars: 200, // Kategorie-Override später via Wissens-Layer
    minCharsWarn: 120,
    mobileWindowChars: 80, // Hauptkeyword + Kernaussage müssen hier hinein
    maxKeywordOccurrence: 1,
  },
  bullets: {
    count: 5,
    targetMinBytes: 200,
    targetMaxBytes: 300,
    hardMaxChars: 500,
    maxSentences: 2,
    maxEmoji: 1,
  },
  backendKeywords: {
    maxBytes: 249,
  },
  description: {
    maxBytes: 1999,
  },
  /** Werbe-/Verbotsphrasen (Blog 06/07, sales-room-Presets) — lowercase-Vergleich. */
  bannedPhrases: [
    "bestseller",
    "sale",
    "angebot des tages",
    "nr. 1",
    "nummer 1",
    "top-qualität",
    "100% beste",
    "geld-zurück-garantie",
    "kostenloser versand",
    "gratis versand",
  ],
  /** Compliance-riskante Claims (marketplaceadpros Banned-Claims + DE-Äquivalente). */
  bannedClaims: [
    "fda approved",
    "fda-zugelassen",
    "klinisch bewiesen",
    "antibakteriell",
    "heilt",
    "wunderheilung",
    "umweltfreundlich", // unbelegt riskant (Green Claims); belegte Formulierung erlaubt
  ],
} as const;

export type RuleSet = typeof RULES;
