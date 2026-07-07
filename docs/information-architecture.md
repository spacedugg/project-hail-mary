# Informationsarchitektur — Navigation & Abläufe

> **Status:** v0. Visueller Blueprint: `docs/navigation-blueprint.html`.
> Komplementär zu `architecture-map.html` (Substanz/Schichten) — dieses Dokument beschreibt, **wie man das Tool bedient**.

## Grundprinzip

**Das Rückgrat ist der Katalog; das primäre Objekt ist das Produkt (ASIN), gruppiert unter Marke unter Kunde.** Fähigkeiten leben auf zwei Ebenen:

- **Account-Ebene** (Seitenleiste): Cockpit, Katalog, Sichtbarkeit & Markt, Advertising/PPC, Berichte & Daten, Handlungen.
- **Produkt-Ebene** (Tabs im ASIN-Detail, aus dem Katalog geöffnet): Übersicht, Content, Listing-Diagnose & Score, Reviews, Marge, Performance.

Begründung: Content, Reviews und Marge sind von Natur aus produktbezogen → gehören an den ASIN, nicht in getrennte Menüs mit eigenem Produktfilter. Account-weite Fähigkeiten bleiben oben. So denkt ein Seller.

## Zwei Navigations-Ebenen

- **Ebene A — Agentur (global):** Portfolio über alle betreuten Marken (Health/Score je Kunde) + Einstellungen/Wissen. Bestätigt durch ROPT („Clients" als Nav-Item).
- **Ebene B — Kunden-Workspace:** Kunde/Marke wählen → alles gefiltert. Entity-Hierarchie `Account → Marke → Land → Produktgruppe → ASIN` ist Filter überall + Weg in die Tiefe.
- **Intern zuerst:** EIN kombinierter Bereich, kein separater Kundenlogin. „Kunde anbinden" = Marke anlegen + Daten verbinden.

## Drei operative Abläufe

1. **Kunde/Marke anbinden:** Anlegen (Kunde+Marke) → Märkte wählen → Produkte anlegen (manuell / Bericht-Import) → Daten anschließen (erste Uploads) → Baseline (Tool rechnet KPIs/Score/Handlungen).
2. **Berichte hochladen (geführt):** Typ wählen → Kontext taggen (Marke/Land/Periode) → Auto-Parsing (Format/Zahlen erkannt) → Vorschau & Bestätigen → Status-Historie (was fehlt je Periode).
3. **Daten & Marge eingeben:** ASIN öffnen → Tab „Marge" → Kosten & Maße eingeben (EK, Gewicht, Paketmaße, Preis) → Gebühren automatisch aus Wissens-Layer (Amazon-Gebühren je Land/Größe) → Marge & Break-even → fließt ins Cockpit.

Prinzip über alle: **Import-First, API-Ready** — heute Upload, später SP-API/Ads-API, ohne Bedienungsänderung. Gebührentabellen aus dem Reporting-Repo portierbar (nicht neu recherchieren).

## KPI-Kachel-Zuordnung (welche Kennzahl wohin)

Alle Kennzahlen kommen aus dem Reporting-Repo (D30). Zuordnung zu Bereichen:

- **Cockpit (Account-Überblick):** Ad-Spend, AOV, org-CR, PPC-CR, Gesamt-CR, Bestellungen, bestellte Einheiten, Retouren + Quote, Buybox-Anteil. → `business/parser.ts`, `reporting/weekly.ts`.
- **Advertising / PPC:** PPC-CR, PPC-Anteil, PPC-AOV, ACoS, TACoS, Break-even-ACoS (als Schwellenlinie), Kampagnen, Search-Term-Harvest, Wasted Spend. → `ads/parser.ts`, `reporting/weekly.ts`, `searchterm/ngram.ts`, `margin/calc.ts`.
- **Sichtbarkeit & Markt (alles mit Markt-Vergleich):** CR vs. Markt, CTR vs. Markt, Delta, geschätzter Marken-Mehrumsatz (Potenzial zum Marktdurchschnitt), **Opportunity-Matrix** (Bubbles Sichtbarkeit × Suchvolumen), Funnel-Stufen (Impr→Klick→Warenkorb→Kauf) vs. Markt, Impression-Share. → `sqp/metrics.ts`, `sqp/tier1.ts`, `sqp/tier2.ts`, `sqp/scenario.ts`.

Break-even-ACoS wird pro Produkt in der Marge-Kachel gerechnet, aber als Schwellenlinie auch in Advertising/Cockpit gezeigt.

## Inspirationsquellen (NICHT nachbauen — eigene Logik)

- **remdash:** anpassbares Card-Dashboard (Content Accuracy, Retail Readiness Score, SEO Benchmark, Traffic & Conversion) mit „+"-Widget-Muster → validiert unser Cockpit mit konfigurierbaren KPI-Karten.
- **ROPT BI:** zwei Dashboard-Sichten — **Marketplaces** (nach Land: Total Sales / Ad Sales / Ad Spend Donuts, Sales-Trend stacked-area, Profitability-Trend TACoS/ACoS) und **Hub** (nach Produktgruppe: Sales-Trend YoY, Top-10-Produktgruppen Bar+Line, Datentabelle mit „Last Year Diff %"), plus Performance-Trend (Total/Ad Sales, Ad Spend, ACoS/TACoS) und **Organic vs. Ad Sales**. Nav: BI Dashboards, Monitoring, Inventory, Analysis, Clients, Support/Tickets, FAQ.
  - **Was wir daraus mitnehmen (Validierung, nicht Design):** (a) Slicing nach **Land** UND **Produktgruppe** ist zentral → bestätigt unsere orthogonale Entity-Dimension; (b) **YoY-/Zeitraum-Vergleich** gehört ins Cockpit; (c) **Organic-vs-Ad-Sales**-Split ist eine Kern-Sicht (haben wir in reporting `weekly.ts`: org-CR, ppc-share); (d) das KPI-Set (Total/Ad Sales, Ad Spend, ACoS, TACoS, CVR) deckt sich mit dem, was unsere Engines schon berechnen.
