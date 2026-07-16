/**
 * Rechenwerk-Register (D61): JEDE berechnete Größe im Tool mit Formel,
 * Quelle und Code-Ort — die Anti-Blackbox-Referenz. Diese Datei ist die
 * dokumentierende Schwester der Engines; ändert sich eine Formel im Code,
 * MUSS der Eintrag hier mitziehen (Review-Regel).
 */

export type KpiEintrag = {
  name: string;
  formel: string;
  quelle: string; // Wissens-Herkunft (Repo/Dokument/Golden-Wert)
  code: string; // wo es rechnet
  hinweis?: string;
};

export type KpiGruppe = { titel: string; eintraege: KpiEintrag[] };

/**
 * Berichte-Register (D85): WELCHE Berichte wir uns ziehen, wo man sie zieht
 * und welche Kennzahlen sie liefern — der Überblick, der unnötige Berichte
 * vermeidet. Kombinierte Kennzahlen (aus mehreren Berichten) stehen separat.
 */
export type BerichtEintrag = {
  name: string;
  status: "Pflicht" | "empfohlen" | "optional" | "geplant";
  /** Woher der Bericht kommt (D86): Seller Central, Amazon Ads Konsole oder Helium 10. */
  plattform: "Seller Central" | "Ads-Konsole" | "Helium 10" | "Amazon (PDF)";
  quelle: string; // wo ziehen (Seller Central / Helium 10 / …)
  turnus: string;
  liefert: string; // Kennzahlen direkt aus DIESEM Bericht
  imTool: string; // wo er hochgeladen/genutzt wird
};

export const BERICHTE: BerichtEintrag[] = [
  {
    name: "Business Report (Verkäufe & Traffic)",
    status: "Pflicht",
    plattform: "Seller Central",
    quelle: "Seller Central → Berichte → Geschäftsberichte → ‚Verkäufe und Besucherzahlen – Detailseite' (nach Datum)",
    turnus: "je Periode — monatlich empfohlen, lückenlos",
    liefert: "Umsatz, Bestellungen, Einheiten, Sitzungen, CVR, Einheiten-CVR, Buybox %, AOV",
    imTool: "Marke → Berichte",
  },
  {
    name: "Ads-/Kampagnenbericht (Sponsored Products)",
    status: "Pflicht",
    plattform: "Ads-Konsole",
    quelle: "Amazon Ads Konsole (advertising.amazon.de) → Berichte → Sponsored Products → Berichtstyp ‚Kampagne'",
    turnus: "je Periode — Zeitraum deckungsgleich zum Business Report",
    liefert: "Spend, PPC-Umsatz, ACoS, ROAS, CTR, CPC, PPC-CR, Impressionen, Ziel-ACoS (aus Portfolio-Namen)",
    imTool: "Marke → Berichte",
  },
  {
    name: "Search-Term-Report (Suchbegriffe)",
    status: "empfohlen",
    plattform: "Ads-Konsole",
    quelle: "Amazon Ads Konsole (advertising.amazon.de) → Berichte → Sponsored Products → Berichtstyp ‚Suchbegriff'",
    turnus: "monatlich oder quartalsweise",
    liefert: "Wasted Spend, Negativ-Kandidaten, N-Gram-Wurzeln, ASIN-Ziele ohne Conversion",
    imTool: "Marke → Berichte",
  },
  {
    name: "SQP (Search Query Performance)",
    status: "empfohlen",
    plattform: "Seller Central",
    quelle: "Seller Central → Marken → Marken-Analysen → Suchanfragen-Leistung (braucht Markenregistrierung)",
    turnus: "monatlich",
    liefert: "Eure CTR/CVR vs. Markt, verlorene Käufe, Umsatzpotenzial je Suchanfrage",
    imTool: "Marke → Berichte",
  },
  {
    name: "Cerebro-Export (Helium 10)",
    status: "optional",
    plattform: "Helium 10",
    quelle: "Helium 10 → Cerebro → eigene ASIN + Wettbewerber-ASINs → CSV-Export",
    turnus: "je Listing-Projekt / bei Bedarf",
    liefert: "SOV, Quick-Wins, Umsatzlücken, Opportunity-Matrix, Keyword-Tiering (primary→Titel …)",
    imTool: "Produkt-Werkbank → SOV-Report",
  },
  {
    name: "Flat-File-Kategorievorlage",
    status: "optional",
    plattform: "Seller Central",
    quelle: "Seller Central → Katalog → Produkte per Upload hinzufügen → Vorlage der Kategorie",
    turnus: "bei Amazon-Vorlagen-Änderung (jeweils NEUSTE Vorlage)",
    liefert: "keine Kennzahl — Ziel-Format für upload-fertige Flat Files",
    imTool: "Marke → Flat Files",
  },
  {
    name: "Amazon-Gebühren-PDF",
    status: "optional",
    plattform: "Amazon (PDF)",
    quelle: "Amazon-Ankündigungen/Hilfeseiten (Amazon verschickt Gebühren-Änderungen als PDF — keine öffentliche Tabellen-API)",
    turnus: "bei Gebühren-Änderung",
    liefert: "Verkaufsgebühr-Sätze, Lager- und Entsorgungs-Tabellen des Margen-Rechners",
    imTool: "Einstellungen → Daten & Formeln (diese Seite)",
  },
  {
    name: "Retouren-/Payments-Bericht",
    status: "geplant",
    plattform: "Seller Central",
    quelle: "Seller Central → Berichte → Zahlungen bzw. Retouren",
    turnus: "—",
    liefert: "Retourenquote (steht NICHT im Business Report — deshalb bewusst noch keine Retourenquote im Cockpit, kein Platzhalter)",
    imTool: "noch nicht integriert",
  },
];

/** Kennzahlen, die erst aus der KOMBINATION mehrerer Quellen entstehen. */
export type KombiKennzahl = { name: string; aus: string; formel: string };

export const KOMBI_KENNZAHLEN: KombiKennzahl[] = [
  { name: "TACoS", aus: "Ads-Bericht + Business Report", formel: "Spend (Ads) ÷ Gesamtumsatz (Business) × 100" },
  { name: "PPC-Anteil", aus: "Ads-Bericht + Business Report", formel: "PPC-Orders (Ads) ÷ Bestellungen (Business) × 100" },
  { name: "Organisch-Umsatz", aus: "Ads-Bericht + Business Report", formel: "max(0, Umsatz − PPC-Umsatz) — Näherung, kein Cent-Ledger" },
  { name: "Organische CR", aus: "Ads-Bericht + Business Report", formel: "max(0, Bestellungen − PPC-Orders) ÷ Sitzungen × 100" },
  { name: "ACoS/TACoS-Ampel", aus: "Ads-Bericht + Margen-Kalkulation (oder Hand-Marge)", formel: "Schwelle = Account-Marge (Hand) VOR Ø Break-even-ACoS der Produkt-Kalkulationen" },
  { name: "Perioden-Diagnose", aus: "Business + Ads (+ SOV & SQP als Ursachen-Signale)", formel: "ln-Zerlegung Umsatz = Sitzungen × CVR × AOV + Quer-Abgleich der Module" },
  { name: "Handlungs-Hebel (€)", aus: "Cerebro + Search-Term + Ads + SQP", formel: "je Handlung eigene Quelle: SOV-Korridor, Wasted Spend − ASIN-Anteil, Überspend über Ziel-ACoS, SQP-Potenzial" },
  { name: "Review-Datenbasis", aus: "Produkt-Crawler/Scrape (kein Amazon-Bericht — ASIN reicht)", formel: "Amazon-Gesamtzahlen (reviewsCount/Ø/Verteilung) NEBEN der Scrape-Stichprobe (5×100 je Sterne-Klasse)" },
];

export const RECHENWERK: KpiGruppe[] = [
  {
    titel: "Business Report (Verkäufe & Traffic)",
    eintraege: [
      { name: "Bestellungen (Orders)", formel: "Bestellposten gesamt; FALLBACK bestellte Einheiten, wenn Spalte fehlt", quelle: "reporting-main (Doppel-Definition im Bestand hier EINMAL festgelegt, D48)", code: "src/lib/reports/business.ts" },
      { name: "CVR", formel: "Orders ÷ Sitzungen × 100", quelle: "reporting-main computeWeeklyRow", code: "src/lib/reports/business.ts", hinweis: "Immer aus Roh-Summen, nie aus der Datei übernommen." },
      { name: "Einheiten-CVR", formel: "Einheiten ÷ Sitzungen × 100", quelle: "reporting-main", code: "src/lib/reports/business.ts" },
      { name: "Buybox %", formel: "Σ(Buybox% × Sitzungen) ÷ Σ Sitzungen (sitzungsgewichtet)", quelle: "reporting-main Business-Parser-Golden", code: "src/lib/reports/business.ts" },
      { name: "AOV", formel: "Umsatz ÷ Bestellungen", quelle: "reporting-main", code: "Cockpit (Hero-Kachel)" },
      { name: "Zahlformat", formel: "aus den DATEN erkannt (deutsch 1.234,56 vs. US 1,234.56), nie geraten", quelle: "reporting-main-Prinzip", code: "src/lib/reports/business.ts (makeNumParser)" },
    ],
  },
  {
    titel: "Advertising / PPC (Ads-Bericht)",
    eintraege: [
      { name: "ACoS", formel: "Spend ÷ PPC-Umsatz × 100", quelle: "reporting-main Ads-Parser-Golden (Raten IMMER aus Rohwerten)", code: "src/lib/reports/ads.ts" },
      { name: "ROAS", formel: "PPC-Umsatz ÷ Spend", quelle: "reporting-main", code: "src/lib/reports/ads.ts" },
      { name: "CTR / CPC / PPC-CR", formel: "Klicks÷Impr. ×100 · Spend÷Klicks · PPC-Orders÷Klicks ×100", quelle: "reporting-main", code: "src/lib/reports/ads.ts" },
      { name: "Impressionen (abgeleitet)", formel: "round(Klicks ÷ CTR) — nur wenn Export keine Impressions-Spalte hat", quelle: "reporting-main-Golden (DE-Export)", code: "src/lib/reports/ads.ts" },
      { name: "Ziel-ACoS", formel: "aus dem Portfolio-Namen geparst (‚ACoS Ziel 12,5%' → 0,125)", quelle: "reporting-main parseTargetAcos", code: "src/lib/reports/ads.ts" },
      { name: "Totals-Raten", formel: "aus SUMMEN — nie Mittelwert der Zeilen-ACoS", quelle: "reporting-main Aggregate-Golden", code: "src/lib/reports/ads.ts" },
      { name: "TACoS", formel: "Spend ÷ Gesamtumsatz (Business Report) × 100", quelle: "reporting-main computeWeeklyRow-Golden", code: "src/lib/reports/ads.ts (combineWithBusiness)" },
      { name: "PPC-Anteil", formel: "PPC-Orders ÷ Bestellungen × 100", quelle: "reporting-main-Golden (Orders-basiert!)", code: "src/lib/reports/ads.ts" },
      { name: "Org.-CR", formel: "max(0, Orders − PPC-Orders) ÷ Sitzungen × 100", quelle: "reporting-main-Golden", code: "src/lib/reports/ads.ts" },
      { name: "Organisch-Umsatz", formel: "max(0, Umsatz − PPC-Umsatz)", quelle: "reporting-main (‚Näherung, kein Cent-Ledger')", code: "src/lib/reports/ads.ts" },
      { name: "ACoS/TACoS-Ampel", formel: "unter der Schwelle grün, ab der Schwelle rot; ohne Schwelle keine Färbung. Schwelle: Account-Marge (Hand-Eintrag) VOR Ø Break-even-ACoS der Produkt-Kalkulationen", quelle: "reporting-main acosColor + effectiveMarginPct", code: "Advertising-/Cockpit-Seite" },
    ],
  },
  {
    titel: "Search-Term-Report & N-Gram",
    eintraege: [
      { name: "Wasted Spend", formel: "Σ Spend aller Suchbegriffe mit Spend > 0 und 0 Käufen (inkl. ASIN-Ziele; ASIN-Anteil separat ausgewiesen)", quelle: "reporting-main SearchTerm-Golden (136,93-€-Fixture)", code: "src/lib/reports/searchterm.ts" },
      { name: "ASIN-Ziel-Erkennung", formel: "Suchbegriff matcht ^B0 + 8 Zeichen [a-z0-9]", quelle: "reporting-main isAsinTerm", code: "src/lib/reports/searchterm.ts" },
      { name: "N-Gram-Wurzeln", formel: "zusammenhängende 1/2/3-Wort-Folgen; De-Dup je Term; ASINs ausgeschlossen; KEIN Stemming, Stopwörter bleiben (literale Wurzeln für Keyword-Aktionen); Raten aus Summen", quelle: "reporting-main ngram-Golden", code: "src/lib/reports/searchterm.ts (ngramRoots)" },
      { name: "Negativ-Kandidaten", formel: "Wurzeln mit Spend > 0 und 0 Käufen, sortiert nach Spend", quelle: "reporting-main", code: "src/lib/reports/searchterm.ts" },
    ],
  },
  {
    titel: "Search Query Performance (SQP)",
    eintraege: [
      { name: "Eure CTR / CVR vs. Markt", formel: "Marken-Klicks÷Marken-Impr. bzw. Marken-Käufe÷Marken-Klicks — Markt analog aus Gesamt-Spalten; Report-Ebene aus SUMMEN", quelle: "reporting-main SQP-Metrics-Golden", code: "src/lib/reports/sqp.ts" },
      { name: "Verlorene Käufe", formel: "max(0, Markt-CVR × eure Klicks − eure Käufe)", quelle: "reporting-main-Golden (lostPurchases = 3 bei 25 %×20−2)", code: "src/lib/reports/sqp.ts" },
      { name: "Umsatzpotenzial", formel: "verlorene Käufe × Median-Kaufpreis (Marke, Fallback Markt)", quelle: "reporting-main-Golden (3×30 € = 90 €)", code: "src/lib/reports/sqp.ts" },
    ],
  },
  {
    titel: "SOV-Audit (Cerebro)",
    eintraege: [
      { name: "Rank-Gewicht vw(rank)", formel: "1: 1,0 · 2: 0,65 · 3: 0,45 · 4–5: 0,3 · 6–10: 0,15 · 11–20: 0,06 · 21–50: 0,015 · 51–100: 0,005 · >100: 0,001", quelle: "temoa-tools-beta script.js:1424", code: "src/lib/sov/audit.ts" },
      { name: "Keyword-Sales → monatlich", formel: "Cerebro-KS (wöchentlich) × 4,36", quelle: "temoa-tools-beta WEEKLY_TO_MONTHLY", code: "src/lib/sov/audit.ts" },
      { name: "Opportunity-Score", formel: "Gap×0,45 + KS×0,25 + SV×0,15 + CPR-Leichtigkeit×0,15; Priorität ≥0,6 High / ≥0,35 Medium", quelle: "temoa-tools-beta", code: "src/lib/sov/audit.ts" },
      { name: "Umsatz-Korridor", formel: "Lücken-Potenzial × 20 % (low) / 60 % (base) / 95 % (high) — Korridor, keine Garantie", quelle: "temoa-tools-beta", code: "src/lib/sov/audit.ts" },
      { name: "Keyword-Tiering", formel: "Rang = Suchvolumen × Cluster-Relevanzgewicht (Tiebreak Opportunity-Score); Schnitte: 1–3 primary → Titel, 4–13 secondary → Bullets, 14–18 tertiary → Beschreibung, Rest Backend; Brand-Alternatives ausgeschlossen (Fremdmarken-Verbot)", quelle: "D51 + Backend-Spec (Amazon-Policy)", code: "src/lib/sov/tiering.ts" },
    ],
  },
  {
    titel: "Content-Regeln (Validation-Gate)",
    eintraege: [
      { name: "Byte-Zählung", formel: "TextEncoder (UTF-8): Umlaute = 2 Bytes — zählt wie Amazon", quelle: "seo-os-Regression", code: "src/lib/text/bytes.ts" },
      { name: "Ausschöpfungs-Prinzip", formel: "Unterausnutzung der Limits = WARNUNG (blockiert nicht), harte Verstöße = FEHLER (blockieren Freigabe)", quelle: "Nutzer-Vorgabe D41", code: "src/lib/validation/gate.ts" },
      { name: "Begründungs-Pflicht", formel: "jeder Textbestandteil trägt Herleitung (Teil ← Quelle); Behauptungen werden deterministisch gegen den Text verifiziert (≥50 % Wort-Überlappung = belegt)", quelle: "D40/D41", code: "src/lib/recipes/listing.ts" },
      { name: "USP-Einmal-Verwendung", formel: "jede USP genau 1× über alle Bullets (Wortstamm-Dedup, Bindestrich-Komposita gesplittet)", quelle: "Nutzer-Feedback (Briefing-Wiederholungen)", code: "src/lib/validation/gate.ts" },
    ],
  },
  {
    titel: "Marge & Break-even (Workbook-Port)",
    eintraege: [
      { name: "Warenbestellung/Stück", formel: "Einkauf + Verpackung + Logistik + Zoll + QC; Zoll = (Einkauf+Verpackung+Logistik) × Zollsatz — QC ist NICHT zollpflichtig", quelle: "Workbook Zelle D22 (via reporting-main)", code: "src/lib/margin/calc.ts" },
      { name: "Retourenkosten", formel: "mit q = Retourenquote × (1 − Entsorgungsanteil): FBA-Versand×q + Verkaufsgebühr×0,2×q + Kostenbasis×0,05×q; Bekleidung zahlt den Rückversand doppelt", quelle: "Workbook Zelle D29", code: "src/lib/margin/calc.ts" },
      { name: "Entsorgungskosten", formel: "mit p = Retourenquote × Entsorgungsanteil: Entsorgungsgebühr×p + (Ware+Inbound+Variabel)×p + Umsatz×p − Verkaufsgebühr×0,8×p", quelle: "Workbook Zelle D30 (80 % Gebühren-Erstattung)", code: "src/lib/margin/calc.ts" },
      { name: "Marge / Netto", formel: "Netto = Brutto ÷ (1+MwSt); Marge = Netto − Ware − Amazon-Gebühren − Variabel − Inbound; Marge% = Marge ÷ Netto", quelle: "Workbook (1L-Fixture: 18,31906 %)", code: "src/lib/margin/calc.ts" },
      { name: "ROI", formel: "Marge ÷ (Ware + Variabel + Inbound) × 100", quelle: "Workbook (1L: 81,065 %)", code: "src/lib/margin/calc.ts" },
      { name: "Break-even-ACoS", formel: "Marge ÷ BRUTTO-VK × 100 — max. Werbekostenanteil am Bruttoumsatz bis ±0", quelle: "Workbook (1L: 15,394 %)", code: "src/lib/margin/calc.ts" },
      { name: "Regressionsanker", formel: "1L-Fixture (Menge 100, 9,90 € VK, 9×9×27 cm, 900 g, 10 % Retouren, 25 % Entsorgung) → Marge 1,524022836 € — jeder Umbau muss diesen Wert reproduzieren", quelle: "reporting-main calc.test.ts", code: "src/lib/margin/calc.test.ts" },
    ],
  },
  {
    titel: "Perioden-Diagnose (Cockpit)",
    eintraege: [
      { name: "Umsatz-Zerlegung", formel: "Umsatz = Sitzungen × CVR × AOV; das Perioden-Delta wird über ln-Anteile exakt auf die drei Faktoren verteilt (Σ Faktor-Beiträge = Gesamt-Delta, kein Rest); bei Null-Werten keine Zerlegung statt erfundener Zahlen", quelle: "Eigenentwicklung (D64) — Antwort auf die fehlende Holistik der Bestands-Tools", code: "src/lib/reports/diagnose.ts" },
      { name: "Ursachen-Abgleich", formel: "dominanter Faktor + Quer-Signale: Traffic-Rückgang × offene SOV-Lücken → Sichtbarkeit; CVR-Rückgang × Buybox −2 pp → Buybox vor Listing; CVR-Rückgang × Buybox stabil → Listing/Preis (SQP/Reviews); AOV → Preis/Mix; TACoS ≥ Break-even → unprofitabel erkauft; fehlende Signale werden benannt statt still gelückt", quelle: "Eigenentwicklung (D64), konservative Regeln — nur belegbare Aussagen", code: "src/lib/reports/diagnose.ts" },
    ],
  },
  {
    titel: "Bewertungs-Analyse & Tiefen-Audit",
    eintraege: [
      { name: "Review-Scrape je Sterne-Klasse", formel: "5 parallele Läufe (filterByStar 1★–5★), je bis zu 100 der AKTUELLSTEN Reviews (sortBy recent, Scrape-Maximum); Teilausfälle als Notiz, nie stiller Abbruch", quelle: "Nutzer-Vorgabe D72 (Actor-JSON)", code: "src/lib/reviews/apify.ts" },
      { name: "Datenbasis-Anzeige", formel: "echte Amazon-Zahlen (Gesamt-Bewertungen, Ø, Verteilung %) NEBEN der Stichprobe; Verhältnis-Balken nur aus der echten Verteilung — die Stichprobe ist je Klasse gedeckelt und bildet kein Verhältnis ab", quelle: "Ehrlichkeits-Prinzip D74", code: "src/app/actions.ts (scrapeReviewsAction)" },
      { name: "Pain Points / Kaufauslöser", formel: "aus ALLEN Sterne-Klassen (Sterne-Zahl = Kontext, kein Filter); Häufigkeit + verbatim-Zitate; Konfidenz: ≥60 Reviews high, ≥20 medium, sonst low", quelle: "temoa-audit review-insights-Schema (SALVAGE §7) + D75", code: "src/lib/reviews/apify.ts (extractInsights)" },
      { name: "Tiefen-Audit (8 Dimensionen)", formel: "Titel · Bullets · Beschreibung · Backend · Bilder · A+ · Bewertungs-Sockel · Preis, je ‚Aktuell / Probleme / Empfehlung' + Score 0–10; bewertbar ist NUR, wofür Daten vorliegen (erzwingt der Code, nie das LLM); USPs/Zielgruppe/Positionierung werden aus Listing + Kundenstimmen HERGELEITET", quelle: "temoa-audit 8-Dim-Spec (SALVAGE §7) — Struktur portiert, Umsetzung neu (‚LLM generiert, Code erzwingt')", code: "src/lib/analysis/deepAudit.ts", hinweis: "Pflicht-Datenbasis: Listing-Inhalt + Bewertungs-Analyse (optional Wettbewerber)." },
    ],
  },
  {
    titel: "Handlungen (€-Hebel)",
    eintraege: [
      { name: "SOV-Umsatzlücken", formel: "Hebel = Korridor-Obergrenze der Top-Lücken", quelle: "D45/temoa-tools-beta", code: "src/app/actions.ts (syncBrandActions)" },
      { name: "Kampagnen ohne Verkäufe", formel: "Hebel = voller Spend der No-Sale-Kampagnen", quelle: "reporting-main ads-no-sale", code: "src/app/actions.ts" },
      { name: "Über Ziel-ACoS", formel: "Hebel = Σ (Spend − PPC-Umsatz × Ziel-ACoS) der Kampagnen über Ziel", quelle: "reporting-main ads-over-target (40−100×0,2 = 20 €)", code: "src/app/actions.ts" },
      { name: "Negativ-Keywords", formel: "Hebel = Wasted Spend − ASIN-Anteil; ASIN-Ziele als eigene Handlung", quelle: "reporting-main st-negatives/st-asin-negatives", code: "src/app/actions.ts" },
      { name: "SQP-Priorität", formel: "Hebel = Gesamt-Umsatzpotenzial; größte Einzel-Lücke wird benannt", quelle: "reporting-main sqp-top-priority", code: "src/app/actions.ts" },
    ],
  },
];
