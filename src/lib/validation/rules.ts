/**
 * Zentrale, versionierte Regel-Konstanten — Single Source of Truth für
 * Generierung UND Validierung (Leitprinzip 3: "LLM generiert, Code erzwingt").
 * Werte kommen aus knowledge/content/*.md (dort mit Quellen & Konfliktauflösung).
 */

export const RULES = {
  title: {
    // Spec-Update 07/2026: Amazon beschränkt Titel auf 75 Zeichen.
    // Ziel 70–75 — Budget bestmöglich ausnutzen. Kategorie-Override via Wissens-Layer.
    maxChars: 75,
    targetMinChars: 70,
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
