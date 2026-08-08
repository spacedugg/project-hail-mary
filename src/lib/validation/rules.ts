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
     * Bullets rechnen in ZEICHEN INKLUSIVE LEERZEICHEN — Ober- UND Untergrenze
     * (D287, Nutzer-Vorgabe 04.08.2026: „255 Zeichen inklusive Leerzeichen …
     * Es geht bei den Bullet Points nicht um Bytes, sondern Zeichen").
     *
     * Vorher stand das Ausschöpfungs-Ziel in Bytes und die Obergrenze in Zeichen:
     * zwei Maßeinheiten für dasselbe Feld. Das ist nicht nur unsauber, es ist
     * unvergleichbar — Umlaute zählen in Bytes doppelt, ein Text mit vielen
     * Umlauten galt also als „ausgenutzter" als derselbe Inhalt ohne. Beide
     * Grenzen zählen jetzt Graphem-Zeichen (`charLength`, Leerzeichen zählen mit).
     *
     * Bytes bleiben dort, wo Amazon wirklich Bytes zählt: Backend-Keywords
     * (249 B) und Beschreibung.
     */
    utilizationMinChars: 230, // darunter: "Budget nicht ausgenutzt" (Warnung)
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
