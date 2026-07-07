# Eingabe-Matrix — was eingespeist werden muss (und was nicht)

> Antwort auf die Kernfrage „Was muss hochgeladen/eingegeben werden?" — pro Baustein der ersten Scheibe (Text-Content), plus Ausblick Reporting-Schiene. Prinzip: **Das LLM rät nie — jede Generierung stützt sich auf eingespeiste Daten.** Geführter Upload, Schritt für Schritt (Nutzer-Vorgabe).

## Erste Scheibe: Text-Content für einen ASIN

| # | Input | Status | Wofür | Format / Quelle |
|---|---|---|---|---|
| 1 | **Produkt-Stammdaten** (Marke, Produkttyp, Specs, Material, Maße, USPs, Marktplatz) | **PFLICHT** | Wahrheits-Anker für alle Claims (Reference-Fidelity) | manuell im Tool, einmalig pro ASIN |
| 2 | **Keyword-Basis** | **PFLICHT** | PRIMARY/SECONDARY/TERTIARY-Tiering für Titel/Bullets/Beschreibung/Backend | **Helium 10 Cerebro-CSV** (Upload); alternativ manuelle Keyword-Liste. Parser vorhanden (reporting + seo-os Autodetect) |
| 3 | **Original-Listing** (bei Optimierung eines bestehenden ASIN) | **PFLICHT** | Vorher/Nachher, Audit, Claim-Abgleich | **H10-Bundle-Upload** (ASIN-Comparison-CSV, temoa-audit-Muster) ODER Scrape — Scrape-Zuverlässigkeit klärt der Spike (Review R2) |
| 4 | **Reviews** (eigene + 3–5 Wettbewerber-ASINs) | **STARK EMPFOHLEN** | Pain Points, Kaufauslöser, Kundensprache → Bullet-Reihenfolge + Formulierungen | Apify-Scrape (Actor vorhanden, DE) oder CSV-Upload (H10/JS-Format, temoa-audit-Muster). Ohne: Bullets nach Default-Slots, Warnung „ohne Kundendaten" |
| 5 | **Wettbewerber-/Bestseller-Listings** | **STARK EMPFOHLEN** | Lücken-Analyse, Differenzierungs-Hooks („was machen Bestseller ähnlicher Produkte") | H10-Competitor-CSV oder Scrape der Top-ASINs |
| 6 | **Cerebro-CSV der Wettbewerber → SOV-Audit** | EMPFOHLEN | Quick-Wins/Revenue-Gaps/invisible Keywords = Profit-Hebel-Priorisierung | vorhandene sov_calculator-Logik (temoa-audit) portieren |
| 7 | Brand-Voice / Tone-Dokument | OPTIONAL | Überschreibt Default (temoa Premium-DE, nüchtern) | Freitext/Upload |
| 8 | **SQP-Bericht (Baseline)** | OPTIONAL bei Erstellung, **PFLICHT fürs Performance-Monitoring** | CTR/CVR vor der Content-Änderung festhalten → vorher/nachher-Beweis | Seller Central Search Query Performance, Parser vorhanden |
| 9 | Business Report (Baseline) | wie 8 | Sessions/CVR/Buybox vor/nach | Parser vorhanden |

**Minimal lauffähig:** 1 + 2. **Gute Qualität:** 1–5. **Beweisbare Qualität (Monitoring):** + 8/9.

## Reporting-/Performance-Schiene (Phase 3, Parser existieren)

| Bericht | Liefert | Parser |
|---|---|---|
| Business Report („Verkäufe & Traffic") | Sessions, CVR, Buybox, Einheiten, Umsatz, Retouren-Basis | `business/parser.ts` |
| SQP (Markenansicht) | Funnel je Suchbegriff vs. Markt, Impression-Share | `sqp/parser.ts` |
| Ads-/Kampagnenbericht | Spend, Sales, ACoS/TACoS, je Kampagne | `ads/parser.ts` |
| Search-Term-Report | N-Gram, Waste, Harvest | `searchterm/parser.ts` |
| Cerebro-CSV | Keywords, SOV, Revenue-Gaps | sov_calculator + seo-os Autodetect |
| Placement-Report | Platzierungs-Performance | **fehlt — neu bauen wenn priorisiert** |

Jeder Upload wird getaggt: Marke · Land · Periode (geführter Flow, `information-architecture.md`).
