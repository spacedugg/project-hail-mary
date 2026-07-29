import type { RecipeInputs } from "@/lib/recipes/listing";

/**
 * Datenfluss-Register (CLAUDE.md/D180, Nutzer 23.07.: „für all diese
 * Datenpunkte muss genau klar sein, was mit denen passiert, wie Analysen
 * stattfinden, was Outcomes sind und wie diese weiterverwendet oder
 * angezeigt werden“). Für JEDEN Datenpunkt im Tool ist hier die Kette
 * deklariert: Quelle → Speicher → Analysen (mit Code-Ort) → Verwendung →
 * Anzeige. Maschinell erzwungen (register.test.ts): jedes deklarierte Modul
 * existiert, kein Datenpunkt ohne vollständige Kette, jeder Content-Input
 * (RecipeInputs) hat eine deklarierte Herkunft. Angezeigt auf der
 * Rechenwerk-Seite („Daten & Formeln“) — dieselbe Datenstruktur, kein Duplikat.
 */

export type DatenpunktAnalyse = {
  name: string;
  /** Code-Ort relativ zum Repo — Existenz wird im Test erzwungen. */
  modul: string;
  outcome: string;
};

export type Datenpunkt = {
  id: string;
  name: string;
  /** Wie der Datenpunkt ins Tool kommt (Eingabefeld, Upload, Scrape, automatisch). */
  quelle: string;
  /** Wo er gespeichert liegt (DB-Tabelle/Feld). */
  speicher: string;
  analysen: DatenpunktAnalyse[];
  /** Wo die Outcomes weiterverwendet werden. */
  verwendung: string[];
  /** Wo sie im Tool sichtbar sind. */
  anzeige: string[];
};

export const DATENFLUSS: Datenpunkt[] = [
  {
    id: "listing-import",
    name: "ASIN & Listing-Import",
    quelle: "Pflichtfeld ASIN beim Anlegen; Import läuft als erste Etappe des Ein-Klick-Laufs (D172)",
    speicher: "listing_snapshots",
    analysen: [
      { name: "Listing-Scrape", modul: "src/lib/scrape/apifyProduct.ts", outcome: "Titel, Bullets, Beschreibung, Attribute, Bilder-URLs, Preis (IST-Zustand)" },
      { name: "Fakten-Extraktion", modul: "src/lib/analysis/factsFromListing.ts", outcome: "Produkt-Wahrheit (Materialien, Maße, Specs, USPs)" },
      { name: "Listing-Kontrolle", modul: "src/lib/analysis/listingAudit.ts", outcome: "Sektions-Scores, Keyword-Abdeckung, Maßnahmen" },
      { name: "Marken-Ableitung", modul: "src/lib/text/marken.ts", outcome: "Eigenmarken-Kandidat aus dem Original-Titel (D149, Fallback)" },
      { name: "A+-Bild-Auslese (Upload, optional)", modul: "src/lib/analysis/bildAuslese.ts", outcome: "hochgeladene A+-Bilder werden EINMAL per Vision ausgelesen → extrahierter Text nach aplusContent; die Bild-Bytes werden verworfen, nie gespeichert (ephemer, D220)" },
    ],
    verwendung: [
      "Content-Prompts (Listing-IST: verbessern, nicht kopieren)",
      "Zahlen-Herkunfts-Quellen des Gates (D114)",
      "Conversion-Blocker-Abgleich (Kunden-Thema vs. Listing-Antwort, D167)",
      "aplusContent → Content-Beleg-Quellen + Feature-Ranking (D220)",
    ],
    anzeige: ["Reiter „Amazon Listing“ (Scores + Maßnahmen)", "Kopfkarte (Titel, Hauptbild, Stand-Datum)"],
  },
  {
    id: "bilder",
    name: "Galeriebilder",
    quelle: "Automatisch beim Listing-Import — kein Extra-Schritt (D158)",
    speicher: "listing_snapshots (bilder_text, bild_befunde)",
    analysen: [
      { name: "Bildanalyse (Vision)", modul: "src/lib/analysis/bildAuslese.ts", outcome: "Text-im-Bild WORTWÖRTLICH, ein objektiver Inhalts-Satz, gezeigte Claims je Bild" },
    ],
    verwendung: [
      "Feature-Ranking (verbatim-verifizierbare Quelle „Bilder“, D133)",
      "Verdichtungs-Beleg-Texte und Bild-Ideen-Wahrheitsfilter",
      "Conversion-Blocker (beantwortet ein Bild das Kunden-Thema?)",
    ],
    anzeige: ["Status-Zeile „Bildanalyse: N Bilder erfasst“ (D165 — Details fließen nur in den Informationspool)"],
  },
  {
    id: "keywords",
    name: "Keywords (Cerebro-Export oder manuell)",
    quelle: "Start-Maske: Upload oder manuelle Eingabe, mit Prüf-Schritt für Aussortiertes (D172)",
    speicher: "keywords",
    analysen: [
      { name: "Relevanz-Filter", modul: "src/lib/keywords/relevanz.ts", outcome: "aktiv/aussortiert je Keyword mit Grund; Fremdmarken-Erkennung (D87)" },
      { name: "Tiering", modul: "src/lib/sov/tiering.ts", outcome: "PRIMARY (Titel) · SECONDARY (Bullets) · TERTIARY (Beschreibung) · Backend-Pool" },
      { name: "SOV-Audit (wenn Wettbewerber-Daten)", modul: "src/lib/sov/audit.ts", outcome: "Quick Wins, Top-Umsatzlücken, Rank-Proximity-Prioritäten" },
    ],
    verwendung: [
      "Content-Prompts je Sektion (Tier-gerecht) + Prüfer-Kontext",
      "Gate-Checks: keyword-echo, Fremdmarken-Blacklist, Keyword-Dedup (D181/D97)",
      "Keyword-Abdeckungs-Score der Listing-Kontrolle (D176)",
      "Zahlen-Herkunfts-Quellen (D114)",
    ],
    anzeige: ["Keywords-Reiter (aktive Chips + durchsuchbare Aussortierten-Liste)", "SOV-Audit kompakt inline (D161)"],
  },
  {
    id: "reviews",
    name: "Bewertungen (eigene + weitere ASINs)",
    quelle: "Start-Maske: optionale weitere ASINs; Scrape als Etappe des Ein-Klick-Laufs (D172)",
    speicher: "review_scrapes → review_insights",
    analysen: [
      { name: "Roh-Analyse", modul: "src/lib/reviews/insights.ts", outcome: "Roh-Aspekte mit Fundstellen, Pain Points, Kaufauslöser, Kundensprache" },
      { name: "Beleg-Prüfung (verbatim)", modul: "src/lib/reviews/belegPruefung.ts", outcome: "nur code-verifizierte Fundstellen überleben; echte Zählwerte je Aspekt (D152/D170) + Herkunfts-Attribution eigene/Wettbewerbs-ASIN je Aspekt (D196)" },
      { name: "Übertragbarkeits-Prüfung", modul: "src/lib/reviews/uebertragbarkeit.ts", outcome: "wettbewerbs-dominante Aspekte erhalten Urteil ja/nein/unbekannt gegen UNSERE Produkt-Wahrheit + Listing (D196)" },
      { name: "Verdichtung", modul: "src/lib/reviews/verdichtung.ts", outcome: "Erkenntnisse mit Gegensatz-Pflicht + code-gerechneter Tendenz (D171)" },
      { name: "Konfidenz", modul: "src/lib/reviews/konfidenz.ts", outcome: "Belastbarkeits-Urteil der Datenbasis; Signifikanz-Gate (D170)" },
    ],
    verwendung: [
      "Content-Prompts: strategische Blöcke nach Herkunft × Übertragbarkeit — Kern-Content (eigene Kaufauslöser), fehlender Kern-Content (übertragbare Wettbewerbs-Kaufauslöser), Angriffs-Lücken (nicht-übertragbare Wettbewerbs-Pain-Points), Erwartungsmanagement (eigene + übertragbare Pain Points); geteilte Themen nur auf ihrer Mehrheits-Seite (D196). NIE als Zahlen-/Spec-Quelle (D114)",
      "Conversion-Blocker & Conversion Drivers (D167/D178)",
      "Briefings (Bild-Ideen aus Gegenmaßnahmen, D171)",
    ],
    anzeige: ["Bewertungen-Reiter (Analyse-Dashboard)", "Analyse-Reiter (vier Bereiche, D178)"],
  },
  {
    id: "wettbewerber-listings",
    name: "Wettbewerber-Listings (Texte der Vergleichs-ASINs)",
    quelle: "Optionale Vergleichs-ASINs am Analyse-Start (D199) — werden beim Review-Scrape zusätzlich als Listing gescrapt",
    speicher: "competitor_listings → competitor_info_gaps",
    analysen: [
      { name: "Listing-Scrape je Wettbewerber", modul: "src/lib/scrape/anthropicProduct.ts", outcome: "Titel, Bullets, Beschreibung, Attribute der Konkurrenz-ASINs" },
      { name: "Wettbewerber-Abgleich", modul: "src/lib/analysis/wettbewerbsTexte.ts", outcome: "Infos, die die Konkurrenz nennt und unser Listing NICHT — mit Übertragbarkeits-Urteil ja/nein/unbekannt gegen unsere Produkt-Wahrheit (nein = verworfen)" },
    ],
    verwendung: [
      "Content-Prompts: ÜBERTRAGBARE WETTBEWERBER-INFORMATIONEN — fehlende Themen mit EIGENEN belegten Angaben besetzen, nie fremde Specs übernehmen (D199)",
    ],
    anzeige: ["Analyse-Reiter (übertragbare Informationslücken)"],
  },
  {
    id: "stammdaten",
    name: "Produkt-Stammdaten (Marke, Marktplatz, Content-Sprache, Preis, Produktname)",
    quelle: "Pflichtfelder beim Anlegen (D162); Marktplatz + Sprache danach FEST (D169); Preis beim Cerebro-Upload (D165); Marke editierbar mit Auto-Speichern",
    speicher: "products (marke, marketplace, content_sprache, price, name)",
    analysen: [
      { name: "Marken-Kontext für Content", modul: "src/lib/recipes/listing.ts", outcome: "MARKE-Zeile im Prompt (gepflegtes Datum schlägt Heuristik, D159); Zielsprache-Steuerung (D128)" },
      { name: "Margen-Kalkulation", modul: "src/lib/margin/calc.ts", outcome: "Marge €/%, Break-even-ACoS aus Preis + Gebühren-Tabellen" },
    ],
    verwendung: ["Alle Content-Prompts + Prüfer-Kontext", "SOV-€-Werte (nur mit echtem Preis, D165)", "Marge-Reiter"],
    anzeige: ["Kopfkarte über allen Reitern (D166)"],
  },
  {
    id: "zusatz-infos",
    name: "Optionale Produktbeschreibung",
    quelle: "Freitextfeld am Produkt (D108/D219) — nicht scrapebare Beschreibung, Fakten & Vorbilder",
    speicher: "products (zusatz_kontext)",
    analysen: [
      { name: "Direkte Prompt-Quelle", modul: "src/lib/recipes/listing.ts", outcome: "ZUSATZ-INFOS-Block in jedem Content-Prompt („verwenden, aber NICHTS darüber hinaus erfinden“)" },
      { name: "Zahlen-Herkunfts-Quelle", modul: "src/lib/validation/gate.ts", outcome: "im Zusatz belegte Zahlen/Specs passieren den Herkunfts-Check (D114)" },
      { name: "Tiefen-Audit-Grundlage", modul: "src/lib/analysis/deepAudit.ts", outcome: "füllt die Beschreibungs-Dimension, wenn Amazon keine scrapebare Beschreibung liefert (A+ ersetzt sie) — D219" },
    ],
    verwendung: ["Content-Generierung aller Sektionen", "Fakten-Sperre-Quellenbasis", "Beschreibungs-Dimension des Tiefen-Audits (D219)"],
    anzeige: ["Produkt-Arbeitsplatz — sichtbar in der Analyse-Start-Maske vor dem Lauf"],
  },
  {
    id: "content",
    name: "Generierter Content (Titel, Bullets, Highlights, Backend, Beschreibung, Q&A)",
    quelle: "Ein-Klick-Lauf oder Einzel-Generierung je Sektion — entsteht NUR über die QM-Schleife (D182)",
    speicher: "content_versions (payload, validation, status)",
    analysen: [
      { name: "Daten-Kontrakt an der LLM-Grenze", modul: "src/lib/llm/contracts.ts", outcome: "Schema-Abweisung statt stillem Weiterreichen (D183)" },
      { name: "Deterministisches Gate + Fixer", modul: "src/lib/validation/gate.ts", outcome: "Längen, Zahlen-Herkunft, Keyword-Echo, Dopplungen, Blacklists — je Regel ein Befund" },
      { name: "LLM-Prüfer (immer)", modul: "src/lib/validation/pruefer.ts", outcome: "Prüfprotokoll je Register-Regel: bestanden/verletzt + Beleg (D182)" },
      { name: "Begründungs-Extraktion", modul: "src/lib/recipes/listing.ts", outcome: "Komponenten-Begründung je Sektion, deterministisch gegen den Text verifiziert" },
    ],
    verwendung: [
      "Freigegebene Sektionen fließen als Kontext in spätere Sektionen (Titel → Bullets → Backend-Dedup)",
      "Flatfile-/Copy-Paste-Übergabe an Seller Central (D175)",
    ],
    anzeige: ["Content-Reiter (kopierbare Einzel-Felder, Zeichen-Hinweise, Begründung)", "Bei QM-Block (D202): bester Entwurf als markierter „Entwurf mit offenen Punkten“ (nicht freigabefähig, rote Findings); nur ohne jeden Entwurf harter QM-01-Banner"],
  },
  {
    id: "berichte",
    name: "Amazon-Berichte (Ads, Business, SQP)",
    quelle: "Datei-Upload — welche Berichte, steht im Berichte-Register dieser Seite (D85)",
    speicher: "report_uploads",
    analysen: [
      { name: "Ads-Parser", modul: "src/lib/reports/ads.ts", outcome: "Kampagnen-KPIs (ACoS, Spend, Sales)" },
      { name: "Business-Parser", modul: "src/lib/reports/business.ts", outcome: "Sessions, CR, Buy-Box je ASIN" },
      { name: "SQP-Engine", modul: "src/lib/reports/sqp.ts", outcome: "Suchbegriff-Trichter (Impressionen → Klicks → Käufe) vs. Markt" },
      { name: "Diagnose", modul: "src/lib/reports/diagnose.ts", outcome: "auffällige Abweichungen mit Regel-Herkunft" },
    ],
    verwendung: ["Dashboard-KPIs (Formeln im KPI-Register dieser Seite)", "Maßnahmen-Hinweise"],
    anzeige: ["Dashboard", "KPI- & Formel-Register (diese Seite)"],
  },
  {
    id: "gebuehren",
    name: "Amazon-Gebühren-Tabellen",
    quelle: "PDF-Upload auf dieser Seite mit Abweichungs-Vorschau und Bestätigung (D62)",
    speicher: "settings (fee_config)",
    analysen: [
      { name: "PDF-Extraktion + deterministische Prüfung", modul: "src/lib/margin/feesFromPdf.ts", outcome: "Verkaufsgebühr-, Lager-, Entsorgungs-Tabellen mit Änderungsliste" },
    ],
    verwendung: ["Margen-Kalkulation (live, src/lib/margin/calc.ts)", "Break-even-ACoS"],
    anzeige: ["Gebühren-Tabellen auf dieser Seite (live)", "Marge-Reiter je Produkt"],
  },
];

/**
 * Herkunfts-Deklaration jedes Content-Inputs (compile-erzwungen vollständig):
 * Jedes Feld, das in die Text-Generierung fließt, MUSS hier einem Datenpunkt
 * zugeordnet sein — ein neues RecipeInputs-Feld ohne Herkunft bricht den Build.
 */
export const RECIPE_INPUT_HERKUNFT: Record<keyof RecipeInputs, string> = {
  brand: "stammdaten",
  eigenmarkeAusListing: "listing-import",
  // Varianten-/Sortenname (D253): kommt aus den Achsenwerten der Variations-Familie.
  variantenName: "stammdaten",
  productName: "stammdaten",
  marketplace: "stammdaten",
  facts: "listing-import",
  keywords: "keywords",
  reviewInsights: "reviews",
  voiceTone: "stammdaten",
  approved: "content",
  competitorBrands: "keywords",
  listingIst: "listing-import",
  bildBelege: "listing-import",
  zusatzKontext: "zusatz-infos",
  sprache: "stammdaten",
  conversionBlocker: "reviews",
  wettbewerbsInfos: "wettbewerber-listings",
  featureRanking: "reviews",
};
