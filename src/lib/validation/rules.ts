/**
 * Zentrale, versionierte Regel-Konstanten — Single Source of Truth für
 * Generierung UND Validierung (Leitprinzip 3: "LLM generiert, Code erzwingt").
 * Werte kommen aus knowledge/content/*.md (dort mit Quellen & Konfliktauflösung).
 */

export const RULES = {
  title: {
    // Spec-Update 07/2026: Amazon beschränkt Titel auf 75 Zeichen.
    // PFLICHTBAND 68–75 (Nutzer 23.07., D192): unter 68 = Fehler (verschenkter
    // Platz), 68–69 als Puffer, damit der deterministische Kürzungs-Fixer und
    // die Generierung nicht an 1–2 Zeichen scheitern. Kategorie-Override via Wissens-Layer.
    maxChars: 75,
    targetMinChars: 68,
    maxKeywordOccurrence: 1,
  },
  /**
   * Ausschöpfungs-Prinzip (Nutzer 07/2026): jedes Budget bestmöglich nutzen —
   * maximale Datengrundlage für den Algorithmus. Unterausnutzung = WARNUNG (kein Muss).
   */
  bullets: {
    count: 5,
    utilizationMinBytes: 300, // darunter: "Budget nicht ausgenutzt"
    hardMaxChars: 500,
    maxSentences: 3, // bei ausgeschöpften Bullets realistisch (vorher 2)
    maxEmoji: 1,
  },
  itemHighlights: {
    maxChars: 125, // neue Amazon-Sektion (Nutzer 07/2026)
    targetMinChars: 115,
  },
  backendKeywords: {
    maxBytes: 249,
    utilizationMinBytes: 220,
  },
  description: {
    maxBytes: 1999,
    utilizationMinBytes: 1700,
  },
  qa: {
    pairs: 5,
    questionMaxChars: 110,
    answerMaxChars: 230,
    answerUtilizationMinChars: 180,
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
