/**
 * Zentrale, versionierte Regel-Konstanten — Single Source of Truth für
 * Generierung UND Validierung (Leitprinzip 3: "LLM generiert, Code erzwingt").
 * Werte kommen aus knowledge/content/*.md (dort mit Quellen & Konfliktauflösung).
 */

export const RULES = {
  title: {
    // Spec-Update 07/2026: Amazon beschränkt Titel auf 75 Zeichen.
    // PFLICHTBAND 60–75 (Nutzer 28.07., D240): unter 60 = Fehler (verschenkter
    // Platz). Von 68 auf 60 gesenkt, weil abgeleitete Varianten-Titel beim
    // Token-Tausch eines kürzeren Achsenwerts (z. B. „Acai" statt „Peach x Black
    // Tea") legitim unter 68 fallen — ein reiner Kopier-Titel kann das Budget
    // nicht deterministisch nachfüllen. Kategorie-Override via Wissens-Layer.
    maxChars: 75,
    targetMinChars: 60,
    maxKeywordOccurrence: 1,
  },
  /**
   * Ausschöpfungs-Prinzip (Nutzer 07/2026): jedes Budget bestmöglich nutzen —
   * maximale Datengrundlage für den Algorithmus. Unterausnutzung = WARNUNG (kein Muss).
   */
  bullets: {
    count: 5,
    /**
     * Ausschöpfungs-Ziel in BYTES, hartes Max in ZEICHEN (D287, Nutzer-Vorgabe
     * 04.08.2026: max. 255 Zeichen pro Bullet — vorher 500).
     *
     * Das Ziel muss mit der Obergrenze zusammenpassen: Bei 255 Zeichen deutschem
     * Text mit Umlauten sind ~265–275 Bytes möglich. Ein Ziel von 300 Bytes
     * (Stand 500-Zeichen-Ära) wäre unter dem neuen Deckel UNERREICHBAR — jedes
     * regelkonforme Bullet trüge dauerhaft die Warnung „Budget nicht ausgenutzt",
     * und das Modell würde beim Nachbessern in den Hard-Max laufen. 220 Bytes
     * (≈ 210–220 Zeichen) fordern rund 86 % des Budgets und lassen dem Satzbau
     * Luft bis zur Grenze.
     */
    utilizationMinBytes: 220, // darunter: "Budget nicht ausgenutzt"
    hardMaxChars: 255,
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
