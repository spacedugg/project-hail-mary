# Produkt-Scope — Amazon All-in-One Cockpit

> **Status:** v1. Ergebnis der Scope-Session 2026-07-07.
> **Visuelle Landkarte:** `docs/architecture-map.html`.

## Positionierung (die These)

Ein **Cockpit für Wachstum & Profitabilität auf Amazon**, das den **ganzheitlichen Überblick schafft, der im Tagesgeschäft untergeht**. Heute liegen die Daten verstreut — Seller Central, Amazon-Ads-Konsole, eigene Excel-Margenlisten, ausgelagerter Content, separates Account-Management — und keiner dieser Bereiche spricht mit dem anderen. Das Tool führt sie zusammen und übersetzt sie in **konkrete, priorisierte Maßnahmen** für die gesamte Account-Ebene bis auf ASIN-Level.

**Leitsatz:** datenbasierte Entscheidungen als Seller — wichtigste KPIs, eigene Position vs. Wettbewerb, Content-Steuerung, Performance-Analyse → abgeleitete Handlungsempfehlungen. So einfach wie möglich, nicht unnötig komplex.

**Go-to-Market (Reihenfolge):** zuerst **intern** bauen und nutzen (Kunden effizient betreuen), Kunden ggf. „mitnehmen" (draufschauen lassen). Eigene Kunden-Accounts, kundenseitiges Auth/Gating und Monetarisierung sind **nachrangig** — erstmal EIN kombinierter Bereich, später trennbar.

## Struktur in drei Ebenen

### A) Sechs Modul-Säulen (was das Tool kann)

> **Wirtschaftlichkeit ist KEINE eigene Säule** (Entscheidung D18): Marge, Break-even-ACoS, Profit-Tracking und ACoS/TACoS sind Kennzahlen *innerhalb* des Performance-Dashboards — ACoS ist nur eine von vielen KPIs.

1. **Überblick, Performance & Wirtschaftlichkeit** — KPI-Cockpit (Conversion-Funnel, CTR, CVR, Impressions, Impression-Share, ACoS, TACoS), **Margenkalkulation, Break-even-ACoS, Profit-Tracking**, Custom Dashboards, Performance-Historie über Zeiträume, Forecasts, Lagerbestandsdaten.
2. **Sichtbarkeit & Wettbewerb** — Share of Voice, organische vs. bezahlte Sichtbarkeit, relevante Keywords, Wettbewerbsposition, Market Share, Pricing-Analyse.
3. **Content-AI** — SEO-Texte (Titel/Bullets/Beschreibung/Backend), Bildererstellung (Haupt/Listing/A+), Content-Performance-Monitoring (hilft die Titeländerung?), Content-Pflege & Uploads, **Flat-File-Erstellung** für Produktanlage.
4. **Listing-Diagnose & Score** — Listing-Audit (Text + Bild), echter engine-gestützter Score, Competitor-Vergleich.
5. **Advertising / PPC** — PPC-Analyse, Kampagnen aus **Templates → API-Upload**, Search-Term-Harvest, Wasted-Spend, Gebots-/Negativ-Empfehlungen.
6. **Reviews / Voice of Customer** — Review-Scan (positiv/negativ, typische Probleme) → Handlungsableitung via **Content-Änderung (Bilder/Texte), PPC-Anpassung oder grundlegende Produktänderung**.

### B) Zwei orthogonale Dimensionen (wie das Tool schneidet) — Datenmodell, kein Feature

- **Entity-Hierarchie:** `Account → Brand → Land/Marktplatz → Produktgruppe → ASIN`.
- **Zeit:** Perioden / Zeiträume.

Jede Analyse aus jeder Säule schneidet entlang dieser Achsen. Einmal richtig im Datenmodell verankert → jede Auswertung bekommt die Aufschlüsselung automatisch.

### C) Intelligenz-Schicht (das Differenzierungsmerkmal) — sitzt ÜBER den Säulen

- **AI-Advisor** — konkrete Actions nach **Uplift-Potenzial** sortiert (Account- & ASIN-Ebene).
- **Alerts / Monitoring** — Buybox-Verlust, handlungsrelevante Änderungen (z. B. verkürztes Titel-Zeichenlimit), Ausreißer.
- **Market Intelligence** — Trends, Muster, Ausreißer, **in Kontext gesetzt** (Prime Day, Saisonartikel).

Reine Dashboard-Tools gibt es viele; der Sprung zu „hier sind die 3 Maßnahmen mit dem größten Hebel" ist der Unterschied.

## v1-Nicht-Ziele (bestätigt 2026-07-07 — bewusst gestrichen, nicht vergessen)

v1 verspricht **nicht**: Market Share/Pricing-Intelligence (keine Datenquelle), Forecasts, Lagerbestand, API-Write-back zu Amazon, Custom Dashboards, externe Kunden-Accounts/Abrechnung, Multi-Marktplatz jenseits DE. Alles bleibt im Zielbild; nichts davon blockiert die erste Scheibe.

## Datenanschluss (Ingest)

Primär **Seller Central** (Sales-/Performance-Berichte, Suchbegriffsbericht, Business Report) und **Amazon-Ads-Konsole** (Kampagnen/PPC) — daraus werden die wichtigsten KPIs berechnet/hergeleitet/dargestellt. Ergänzend Helium 10 Cerebro, Apify-Review-Scrape, Listing-Scrape (Text + Bild). Prinzip „Import-First, API-Ready": später SP-API / Ads-API-Adapter. Berichts-Upload **geführt, Schritt für Schritt**.

## Technisch

- **Backend + Frontend.** Ein kombinierter Bereich (Admin + Kunde zusammengelegt) für den internen Start.
- Benutzerfreundlichkeit hat oberste Priorität; Dashboards visuell ansprechend.
- KI arbeitet *innerhalb* des Tools (Trend-/Muster-/Ausreißer-Erkennung + Kontextualisierung), nicht nur bei der Content-Generierung.
