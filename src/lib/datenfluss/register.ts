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

/**
 * Feld-Ebene der Kette (D265, Nutzer-Vorgabe 30.07.: „es sollen keine Daten in
 * unserer Datenbank entstehen, die dann ungenutzt dort liegen bleiben").
 *
 * Warum das nötig war: Die Datenpunkt-Prüfung unten erzwingt nur, dass ein
 * Datenpunkt IRGENDEINE Verwendung und Anzeige deklariert — als Prosa. Einzelne
 * Payload-FELDER liegen unterhalb dieser Granularität, und genau dort sind
 * Karteileichen entstanden (`bildBefunde`, `qualitaetsNotizen`: erzeugt,
 * gespeichert, nie gelesen). Diese Deklaration ist maschinell geprüft: jeder
 * Consumer muss existieren UND das Feld wirklich enthalten.
 */
export type FeldKette = {
  /** Payload-Pfad, z. B. "review_insights.payload.painPoints[].herkunft". */
  feld: string;
  /** Dateien, die es LESEN — Existenz und Vorkommen werden im Test erzwungen. */
  consumer: string[];
};

/**
 * Bekannte Karteileiche mit Bau-Auftrag (D182-Geist: ein Befund ist ein
 * Auftrag, kein Vermerk). Steht ein Feld hier, ist es ehrlich als ungenutzt
 * deklariert — es darf nicht gleichzeitig als genutzt geführt werden.
 */
export type OffenesFeld = {
  feld: string;
  /** Was gebaut werden muss, damit das Feld eine Verwendung bekommt. */
  bauauftrag: string;
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
  /** Feld-genaue Kette (D265) — optional, wird aber erzwungen, wo deklariert. */
  felder?: FeldKette[];
  /** Ungenutzte Felder mit Bau-Auftrag (D265) — ehrlich statt still. */
  offeneFelder?: OffenesFeld[];
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
      { name: "Bild-Audit", modul: "src/lib/analysis/bildAudit.ts", outcome: "Noten 0–5 je Bild für Design · Botschaft · Klarheit, mit „was wir sehen / warum / wie besser“ (D242)" },
      { name: "Bildbeweis-Abdeckung", modul: "src/lib/analysis/abdeckung.ts", outcome: "je Nutzen-Baustein: belegt · schwach · fehlt · nicht bewertet — die Grundlage der Conversion-Blocker (D265)" },
    ],
    verwendung: [
      "Feature-Ranking (verbatim-verifizierbare Quelle „Bilder“, D133)",
      "Verdichtungs-Beleg-Texte und Bild-Ideen-Wahrheitsfilter",
      "Conversion-Blocker: Botschafts-Note entscheidet zwischen „kein Bildbeweis“ und „unzureichender Bildbeweis“ (D265)",
      "Bilder-Briefing: heutiger Stand je Bild + „wie besser“ als Ausgangspunkt der Konzepte (D269)",
    ],
    anzeige: ["Status-Zeile „Bildanalyse: N Bilder erfasst“ (D165 — Details fließen nur in den Informationspool)", "Bild-Kacheln im Listing-Reiter"],
    felder: [
      { feld: "listing_snapshots.bilder_text[].faktoren", consumer: ["src/lib/analysis/abdeckung.ts", "src/components/bild-kacheln.tsx"] },
    ],
    offeneFelder: [
      {
        feld: "listing_snapshots.bild_befunde",
        bauauftrag:
          "Wird von der Bild-Auslese gefüllt (actions.ts) und nirgends gelesen. Ziel: Bild-Kapitel des Insights-Dokuments (D265) — die Befunde sind fertige Handlungsempfehlungen für die neuen Bilder.",
      },
    ],
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
      "Vergleichs-ASINs für Review-Scrape UND Wettbewerber-Listing-Abgleich (D268): die Rang-Spalten des Exports SIND die Wettbewerber — kein zweiter, manueller Eintrag",
      "Suchnachfrage-Anteil im Conversion-Driver-Score (D265) — der einzige gemessene Vorkauf-Datenpunkt",
    ],
    anzeige: [
      "Keywords-Reiter (aktive Chips + durchsuchbare Aussortierten-Liste)",
      "SOV-Audit kompakt inline (D161)",
      "Vergleichs-ASIN-Chips in der Analyse-Maske (vorbelegt, abwählbar) + Notiz in der Scrape-Datenbasis",
    ],
    felder: [
      {
        feld: "report_uploads.parsed.wettbewerberAsins",
        consumer: ["src/app/actions.ts", "src/app/(app)/produkte/[id]/page.tsx"],
      },
    ],
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
      "Zuständigkeits-Gate EINMAL beim Speichern der Roh-Analyse (D266, src/lib/analysis/zustaendigkeit.ts): Versand-/Zustell-Themen fallen raus (Amazon-Sache), Verpackungs-/Transportschaden wird Produkt-Feedback. Damit arbeiten Verdichtung, Feature-Ranking, Blocker, Driver UND analyzeListing() automatisch auf bereinigten Aspekten",
    ],
    anzeige: ["Bewertungen-Reiter (Analyse-Dashboard, inkl. „Grenzen dieser Auswertung“)", "Analyse-Reiter: Conversion Driver, Blocker, Ballast, Erwartungs-/Produktrisiken (D265/D266)"],
    felder: [
      { feld: "review_insights.payload.kernThese", consumer: ["src/components/bewertungs-dashboard.tsx", "src/lib/recipes/listing.ts"] },
      { feld: "review_insights.payload.verworfeneKarten", consumer: ["src/components/bewertungs-dashboard.tsx"] },
      { feld: "review_insights.payload.entfernteBildIdeen", consumer: ["src/components/bewertungs-dashboard.tsx"] },
      // Auch der Risiko-Block speist sich hieraus (D266): page.tsx filtert die
      // Karten mit negativer/ausgeglichener Tendenz heraus und übergibt sie.
      { feld: "review_insights.payload.insightCards", consumer: ["src/app/(app)/produkte/[id]/page.tsx", "src/lib/recipes/listing.ts"] },
      { feld: "review_insights.payload.painPoints[].herkunft", consumer: ["src/lib/recipes/listing.ts"] },
      { feld: "review_insights.payload.painPoints[].uebertragbarkeit", consumer: ["src/lib/recipes/listing.ts"] },
      // D269: Der Bild-Brief ist kein Markdown-String mehr — die Kundensprache
      // steht jetzt strukturiert im Briefing und ist damit keine Karteileiche.
      { feld: "review_insights.payload.languageToBorrow", consumer: ["src/lib/analysis/briefingErzeugung.ts", "src/lib/recipes/listing.ts"] },
      // D266: aus Karteileichen wurden Konsumenten.
      { feld: "review_insights.payload.qualitaetsNotizen", consumer: ["src/components/bewertungs-dashboard.tsx"] },
      { feld: "review_insights.payload.produktFeedback", consumer: ["src/app/actions.ts", "src/components/driver-karten.tsx"] },
      { feld: "review_insights.payload.ausgeschlossenAmazon", consumer: ["src/app/actions.ts"] },
    ],
    offeneFelder: [
    ],
  },
  {
    id: "bild-briefing",
    name: "Bilder-Briefing (Designer)",
    quelle: "Knopf im Briefings-Reiter, je Sprache — keine eigene Erhebung: Projektion des Driver-Laufs (D269)",
    speicher: "bild_briefings (je Produkt und Sprache, neueste Zeile gilt)",
    analysen: [
      { name: "Assemblierung", modul: "src/lib/analysis/bildBriefing.ts", outcome: "je unbewiesenem Kaufgrund ein Konzept mit Status (neu · ersetzen · nachschärfen), Findings aus dem Befund, Produkt-Wahrheit, Verbote, heutiger Bildstand" },
      { name: "Konzept-Ideen", modul: "src/lib/analysis/bildBriefingLauf.ts", outcome: "je Kaufgrund EINE Idee, was ankommen soll — Gate gegen vorgeschriebene Bildtexte und Szenen-Regie (pruefeKonzeptFreiheit)" },
      { name: "Lokalisierung", modul: "src/lib/analysis/bildBriefingLauf.ts", outcome: "englische Fassung sinngemäß aus der deutschen; sprachgebundene Felder (Produktangaben, Kundenstimmen, Bildinhalt) bleiben unangetastet" },
      { name: "Erzeugung", modul: "src/lib/analysis/briefingErzeugung.ts", outcome: "sammelt die Analyse-Zeilen und speichert die Fassung je Sprache" },
    ],
    verwendung: [
      "Designer-Briefing für neue oder überarbeitete Listing-Bilder — deutsch fürs eigene Team, englisch für externe Gestalter",
    ],
    anzeige: ["Briefings-Reiter: strukturierte Ansicht mit Sprach-Schalter (Deutsch Standard) statt Markdown-Textwand"],
    felder: [
      { feld: "bild_briefings.payload", consumer: ["src/app/(app)/produkte/[id]/briefs/page.tsx", "src/components/bild-briefing-ansicht.tsx"] },
      { feld: "bild_briefings.sprache", consumer: ["src/lib/analysis/briefingErzeugung.ts", "src/app/(app)/produkte/[id]/briefs/page.tsx"] },
      { feld: "bild_briefings.hinweise", consumer: ["src/app/(app)/produkte/[id]/briefs/page.tsx"] },
    ],
  },
  {
    id: "insights-dokument",
    name: "Insights-Dokument (Kunden-Report)",
    quelle: "Knopf im Analyse-Reiter — keine eigene Erhebung: eine Projektion vorhandener Analyse-Zeilen (D267)",
    speicher: "insights_reports (eingefroren je Version, eigener öffentlicher Token)",
    analysen: [
      { name: "Projektion", modul: "src/lib/reports/insightsDokument.ts", outcome: "Kopf, Datenbasis, Kern-These, Kaufgrund-Matrix mit Abdeckungs-Ampel, Listing-Status, Handlungsplan aus den Blockern, Risiken, Grenzen — ohne LLM" },
      { name: "Auslieferungs-Gate", modul: "src/lib/reports/insightsDokument.ts", outcome: "kein Dokument ohne Datenbasis, ohne Kaufgrund, ohne Beleg-Quelle je Zeile oder mit Maßnahme ohne Kaufgrund-Referenz — bei Verstoß wird NICHTS gespeichert (D182)" },
      { name: "Erzeugung & Einfrieren", modul: "src/lib/reports/insightsLauf.ts", outcome: "Version + Token; alte Links bleiben gültig und zeigen weiter ihren Stand" },
    ],
    verwendung: [
      "Kundenkommunikation vor der Content-Erstellung: Begründung der Optimierung",
      "Bild-Briefing: die Bild-Maßnahmen tragen „wie besser“ aus dem Bild-Audit",
    ],
    anzeige: ["Analyse-Reiter (Karte mit Öffnen · Link kopieren · Versionen)", "öffentliche Seite /insights/[token] mit Druck-Layout (dieselbe Seite ist das PDF)"],
    felder: [
      { feld: "insights_reports.token", consumer: ["src/app/insights/[token]/page.tsx", "src/app/(app)/produkte/[id]/page.tsx"] },
      // Die Darstellung bekommt den Payload als Prop — gelesen wird er beim Laden
      // und in der öffentlichen Route. Der Test prüft das ehrlich am Vorkommen.
      { feld: "insights_reports.payload", consumer: ["src/lib/reports/insightsLauf.ts", "src/app/insights/[token]/page.tsx"] },
      { feld: "insights_reports.version", consumer: ["src/app/insights/[token]/page.tsx", "src/app/(app)/produkte/[id]/page.tsx"] },
    ],
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
    // Ehrlich korrigiert (D265): Es gibt KEINE Ansicht dafür. Die frühere
    // Angabe „Analyse-Reiter (übertragbare Informationslücken)" war eine
    // Deklaration ohne Deckung — genau die Selbstbescheinigung, die die
    // Feld-Prüfung künftig verhindert.
    anzeige: ["(noch keine — nur Content-Prompt, siehe offeneFelder)"],
    offeneFelder: [
      {
        feld: "competitor_info_gaps.payload.gaps",
        bauauftrag:
          "Fließt in die Content-Generierung (actions.ts), ist aber in keiner Ansicht sichtbar und in keiner Analyse verwertet. Ziel: Motiv-Quelle der Conversion Driver (D265) — Wettbewerber-Listings sagen, welche Resultate die Kategorie bewirbt; plus Anzeige im Analyse-Reiter.",
      },
    ],
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
    id: "werk-auswahl",
    name: "Auftragsumfang (welche Werke · welche Listing-Sektionen)",
    quelle:
      "Haken-Auswahl „Was soll erstellt werden?“ — im Produkt-Arbeitsplatz, in der Übertragungs-Maske einer Variations-Familie (D261) und im Briefings-Reiter (D270)",
    speicher: "products (werke_plan = Werke D270, content_plan = Sektionen D257)",
    analysen: [
      {
        name: "Wirksame Auswahl",
        modul: "src/lib/content/werke.ts",
        outcome:
          "Werke in Code-Reihenfolge, dedupliziert; keine Entscheidung (null) ⇒ nur Listing-Texte, leere Auswahl ⇒ bewusst nichts — A+ Basic, A+ Premium, Store und Bilder-Briefing entstehen NIE ungefragt",
      },
      {
        name: "Wirksamer Sektions-Plan",
        modul: "src/lib/content/plan.ts",
        outcome: "geplante Sektionen, nächste geplante Sektion, geplante Vorgänger — Abgewähltes blockiert die Kette nie",
      },
      {
        name: "Durchsetzung am Generierungs-Eingang",
        modul: "src/app/actions.ts",
        outcome:
          "Listing-Texte ohne gewähltes Werk ⇒ GEN-06-Block; Bilder-Briefing ohne Werk ⇒ Banner statt Lauf; die Freigabe-Kette taktet bei abgewähltem Listing NICHT weiter (D181: Auswahl ist Gesetz, kein UI-Grau)",
      },
    ],
    verwendung: [
      "Generierungs-Eingang: Was nicht beauftragt ist, wird nicht erzeugt — auch nicht per Direkt-POST",
      "Taktgeber der geführten Kette (D195/D257): nächste Sektion und blockierende Vorgänger",
      "Umfang der Varianten-Ableitung auf einem Parent (D261)",
      "Briefings-Reiter: entscheidet, welche Briefs überhaupt assembliert werden",
    ],
    anzeige: [
      "Produkt-Arbeitsplatz (Content-Reiter): Auswahl + Hinweis „Werk nicht ausgewählt“ statt Generier-Knopf; bereits erzeugte Texte bleiben als Archiv sichtbar",
      "Briefings-Reiter: nur beauftragte Briefings, sonst ehrlicher Leerzustand",
    ],
    felder: [
      // Absichtlich der Property-Name (nicht die Spalte „werke_plan"): so prüft der
      // Test wirklich die lesenden Code-Stellen, nicht nur die Schema-Definition.
      {
        feld: "products.werkePlan",
        consumer: [
          "src/app/actions.ts",
          "src/components/werk-auswahl.tsx",
          "src/app/(app)/produkte/[id]/page.tsx",
          "src/app/(app)/produkte/[id]/briefs/page.tsx",
        ],
      },
      {
        feld: "products.contentPlan",
        consumer: [
          "src/app/actions.ts",
          "src/components/werk-auswahl.tsx",
          "src/app/(app)/produkte/[id]/page.tsx",
          "src/lib/variants/laden.ts",
        ],
      },
    ],
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
