# reporting-main — 100%-Vollextraktion

Quelle: `scratchpad/extracted/e69ed275-reportingmain/reporting-main/` (Next.js 15 App, „Amazon Reporting" der Agentur Temoa).
Diese Datei ergänzt die bestehende Kern-Analyse (Parser business/sqp/ads/searchterm, sqp/{metrics,tier1,tier2,scenario,cluster}, ngram, actionplan/build, margin/calc+fees, weekly, Assistent „Christoph") um ALLES bisher nicht tief Gelesene. Alle Pfade relativ zum Repo-Root, mit Zeilenangaben.

---

## 1. Vollständigkeits-Nachweis

167 Dateien im Repo; davon 148 relevante Quelldateien (Rest: package-lock.json, 5 Logos/Bilder in `public/`, `.gitignore`). Abdeckungsstatus:

**Komplett gelesen (dieser Durchgang):**

| Bereich | Dateien |
|---|---|
| Konfiguration | `README.md`, `.env.example`, `package.json`, `vercel.json`, `next.config.mjs`, `tsconfig.json` |
| Margin komplett | `src/lib/margin/{fees,calc,form,breakeven,index}.ts`, `src/lib/margin/calc.test.ts`, `src/app/margin/{page,calculator}.tsx` |
| Alle 25 Test-Dateien | `src/lib/**/*.test.ts` (actionplan, ads×2, auth, business×2, margin, period×3, periodflags, range, weekly, scope×2, searchterm×2, session, store, sqp×9) |
| Libs | `guidelines.ts`, `store.ts`, `blob-store.ts`, `auth.ts`, `session.ts`, `format.ts`, `marketplaces.ts`, `period.ts`, `upload-batch.ts`, `scope/{amazon,import}.ts`, `reporting/{range,weekly,periodflags,months}.ts`, `sqp/insights.ts`, `actionplan/forBrand.ts` |
| Portal-UI (alle unter `src/app/r/[slug]/`) | `layout.tsx`, `page.tsx`, `overview.tsx`, `dashboard.tsx` (1381 Z.), `keyword-funnel.tsx`, `portal-nav.tsx`, `range-picker.tsx`, `range-upload-form.tsx`, `range-multi-upload.tsx`, `period-flags-editor.tsx`, `marketplace-switch.tsx`, `logo-upload.tsx`, `report/{page,report-view}.tsx`, `sales/sales-dashboard.tsx`, `ads/{page,ads-dashboard}.tsx`, `b2b/{page,b2b-dashboard}.tsx`, `searchterm/searchterm-dashboard.tsx`, `produkte/page.tsx`, `massnahmen/{page,action-plan}.tsx`, `analyse/{page,section-page}.tsx` + 4 Sektions-Pages, `scope/{page,scope-editor}.tsx`, `margin/{page,margin-manager}.tsx`, `guidelines/{page,guidelines,christoph-chat}.tsx`, `upload/{page,reports-upload}.tsx`, `monate|reportings|wochenreport/page.tsx` (Redirects) |
| Admin-UI | `page.tsx` (Kundenliste), `admin-shell.tsx`, `admin-nav.tsx`, `accounts-manager.tsx`, `create-client.tsx`, `logout-button.tsx`, `sicherheit/page.tsx`, `anleitung/page.tsx` (internes Wiki, 405 Z.), `upload/page.tsx`, `upload-dropzone.tsx`, `login/{page,login-form}.tsx`, `admin/login/page.tsx`, `layout.tsx`, `globals.css` (Design-Tokens) |
| Alle 16 API-Routen | `api/accounts/…`, `api/auth/…` (login/admin-login/logout), `api/clients/…` (root, [slug], ads, business, searchterm, reports, margins, logo, scope/lookup, assistant), `api/reports`, `api/assets/[...path]` |
| Charts | `src/components/charts.tsx` (740 Z.: Donut, StageLine, CompareLine, TrendLines, FunnelChart, StackedBar, Scatter) |
| Sample-Daten | Header aller 6 CSVs in `sample-data/` geprüft |

**Von der Kern-Analyse abgedeckt, hier über Tests + Grep verifiziert (Verhalten durch Golden-Werte in Abschnitt 4 belegt):** `sqp/{parser,metrics,tier1,tier2,scenario,cluster,aggregate,comparison,period,types}.ts`, `ads/{parser,aggregate,types}.ts`, `business/{parser,aggregate,types}.ts`, `searchterm/{parser,ngram,types}.ts`, `actionplan/build.ts`. Kein Widerspruch zur Kern-Analyse gefunden (eine Präzisierung: Abschnitt 5).

**Stack:** Next.js 15.5.18, React 19, papaparse 5.4.1, `@anthropic-ai/sdk` ^0.100.1, `@vercel/blob` ^2.4.0, vitest 3. `recharts` ist zwar dependency, wird aber NICHT benutzt — alle Charts sind handgeschriebenes SVG.

---

## 2. GEBÜHREN-TABELLEN (Amazon.de) — Wissensbasis für den Margen-Rechner

Quelle: `src/lib/margin/fees.ts` (komplett) + `src/lib/margin/calc.ts`. Laut Kommentar (fees.ts:1–7) „1:1 reverse-engineered aus dem Margenkalkulation-Workbook des Kunden"; deutsche Marketplace-Sätze, als Auto-Defaults des Hybrid-Rechners — jeder Wert per Eingabe überschreibbar.

### 2.1 Verkaufsgebühr (Referral Fee) je Kategorie — Anteil vom BRUTTO-Verkaufspreis

24 Kategorien (`AMAZON_CATEGORIES`, fees.ts:36–61). Flat-Sätze (fees.ts:63–84):

| Kategorie | Satz |
|---|---|
| Alles andere | 8 % |
| Bekleidung & Schuhe | 15 % |
| Elektronik-Zubehör | 15 % |
| Computer-Zubehör | 15 % |
| Schmuck | 20 % |
| Baumarkt | 13 % |
| Materialtransportprodukte | 12 % |
| Musikinstrumente & DJ-Equipment | 12 % |
| Industrielle Werkzeuge & Instrumente | 12 % |
| Industrielle Elektroinstallation | 12 % |
| Schleifmittel & Veredlungsprodukte | 12 % |
| Zubehör für erneuerbare Energien | 12 % |
| Zubehör für Landwirtschaftliche Geräte | 12 % |
| Bier Wein und Spirituosen | 10 % |
| Reifen | 10 % |
| Fahrräder | 10 % |
| Fahrradzubehör | 8 % |
| Elektro-Großgeräte | 7 % |
| Elektronik | 7 % |
| Computer | 7 % |

Preisabhängige Staffeln (`referralRate()`, fees.ts:90–103):

| Kategorie | Bedingung | Satz |
|---|---|---|
| Drogerie & Körperpflege | Brutto ≤ 10 € | 8 % |
| Drogerie & Körperpflege | Brutto > 10 € | 15 % |
| Baby | Brutto ≤ 10 € | 8 % |
| Baby | Brutto > 10 € | 15 % |
| Beauty | Brutto ≤ 10 € | 8 % |
| Beauty | Brutto > 10 € | 15 % |
| Auto & Motorrad | Brutto > 50 € | 9 % |
| Auto & Motorrad | Brutto ≤ 50 € | 15 % |

Unbekannte Kategorie ohne Flat-Satz → 0 (Fallback, fees.ts:101).

### 2.2 Lagergebühr (fees.ts:105–121)

- Monatssatz Standard: **33,5425 €/m³**; Bekleidung & Schuhe: **19,5475 €/m³** (im Sheet-Modell billiger).
- Abrechnung pauschal **2 Monate** je Einheit (`STORAGE_MONTHS = 2`).
- Formel: `(L/100 · B/100 · H/100) m³ × Satz × 2` aus Kartonmaßen in cm.
- Golden-Wert: 9×9×27 cm, „Alles andere" → **0,146714895 €/Stück** (calc.test.ts:86).

### 2.3 Entsorgungsgebühr je Stück (fees.ts:123–146)

Größenklassen-Weiche: **Oversize, sobald IRGENDEINE Seite ≥ 46 cm** (fees.ts:140), sonst Standard. Tabelle: `[Gewicht in g EXKLUSIV-Untergrenze, Gebühr €]`, absteigend, erste Übereinstimmung `Gewicht > min` gewinnt.

**Standard-Größe** (fees.ts:133–136):

| Gewicht (g) | Gebühr |
|---|---|
| > 5000 | 2,10 € |
| > 4000 | 1,70 € |
| > 3000 | 1,30 € |
| > 2000 | 0,90 € |
| > 1000 | 0,50 € |
| > 500 | 0,45 € |
| > 200 | 0,30 € |
| > 0 (und =0) | 0,25 € |

**Oversize** (fees.ts:126–132):

| Gewicht (g) | Gebühr |
|---|---|
| > 25000 | 11,40 € |
| > 24000 | 11,00 € |
| > 23000 | 10,60 € |
| > 22000 | 10,20 € |
| > 21000 | 9,80 € |
| > 20000 | 9,40 € |
| > 19000 | 9,00 € |
| > 18000 | 8,60 € |
| > 17000 | 8,20 € |
| > 16000 | 7,80 € |
| > 15000 | 7,40 € |
| > 14000 | 7,00 € |
| > 13000 | 6,60 € |
| > 12000 | 6,20 € |
| > 11000 | 5,80 € |
| > 10000 | 5,40 € |
| > 9000 | 5,00 € |
| > 8000 | 4,60 € |
| > 7000 | 3,80 € |
| > 6000 | 3,40 € |
| > 5000 | 3,00 € |
| > 2000 | 2,50 € |
| > 1000 | 1,50 € |
| > 500 | 1,00 € |
| > 0 (und =0) | 0,50 € |

Golden-Werte (calc.test.ts:89–94): 900 g Standard → 0,45 €; 150 g Standard → 0,25 €; 900 g Oversize (50-cm-Seite) → 1,00 €; 100 g Oversize → 0,50 €.

### 2.4 Rechen-Engine (`computeMargin`, calc.ts:113–227) — komplette Formeln

Defaults: `orderQty=1`, `vatRate=0.19`, Kategorie „Alles andere", `customsRate=0`, `returnRate=0`, `disposalShare=0`. Nur `purchasePrice` und `sellingPriceGross` sind Pflicht.

- **Warenbestellung/Stück** = Einkauf + Verpackung + Quality Inspection + Logistik + Zoll; **Zoll = (Einkauf + Verpackung + Logistik) × Zollsatz** (spiegelt Zelle D22 des Workbooks; Quality Inspection ist NICHT zollpflichtig, calc.ts:127–129).
- **Verkaufsgebühr** = Satz (Override oder `referralRate(Kategorie, Brutto)`) × Brutto.
- **FBA-Versandgebühr**: kein Auto-Default („No reliable auto-default", calc.ts:46) — muss eingegeben werden.
- **Lager** = Override oder `storageFeePerUnit(Maße, Kategorie)`; ohne Maße 0.
- **Retourenkosten gesamt** (spiegelt D29, calc.ts:150–161), mit `q = returnRate × (1 − disposalShare)`:
  `Versand_ges × q + Verkaufsgeb_ges × 0,2 × q + (Waren_ges + Versand_ges + Inbound_ges + Variabel_ges) × 0,05 × q [+ Bekleidung: nochmal Versand_ges × q]`
  → also: voller FBA-Versand nochmal, 20 % der Verkaufsgebühr (Amazon behält 20 % bei Erstattung), 5 % Pauschale auf die Kostenbasis; Bekleidung zahlt den Rückversand doppelt.
- **Entsorgungskosten gesamt** (spiegelt D30, calc.ts:163–176), mit `p = returnRate × disposalShare`:
  `Menge × p × Entsorgungsgebühr/Stück + (Waren_ges + Inbound_ges + Variabel_ges) × p + Bruttoumsatz_ges × p − Verkaufsgeb_ges × 0,8 × p [+ Bekleidung: Versand_ges × p]`
  → abgeschriebene Ware + verlorener Umsatz, minus 80 % erstattete Verkaufsgebühr.
- **Netto-Preis** = Brutto ÷ (1 + MwSt). **Marge/Stück** = Netto − Waren − Amazon − Variabel. **Auszahlung** = Brutto − Amazon-Gebühren.
- **KPIs**: `marginPct = Marge ÷ Netto`; `ROI = Marge ÷ (Waren + Variabel)`; **`Break-even-ACoS = Marge ÷ BRUTTO × 100`** (calc.ts:189–191) — max. Werbekostenanteil am Bruttoumsatz bis ±0.
- Formular (`form.ts`): Prozente als ganze Zahlen (19 = 19 %), `formToInputs` teilt durch 100; Maße nur genutzt, wenn L, B und H ALLE gesetzt.

### 2.5 Referenz-Fixture „1L" (Regressionsanker, calc.test.ts:6–49)

Eingaben: Menge 100, MwSt 19 %, „Alles andere", Zoll 0, 9×9×27 cm, 900 g, Retourenquote 10 %, Entsorgungsanteil 25 %, Einkauf 1,17 €, Verpackung 0,71 €, FBA-Versand 3,40 €, Brutto-VK 9,90 €.
Erwartete Ausgaben: Waren 1,88 €/Stk; Verkaufsgebühr 8 % = 0,792 €; Lager 0,146714895 €; Retouren 0,28668 €; Entsorgung 0,28991 €; Amazon gesamt 4,915304895 €; Netto 8,319327731 €; **Marge 1,524022836 € = 18,31906 %**; ROI 81,065 %; Auszahlung 4,984695105 €; BEP-ACoS = 1,524022836/9,9 = **15,394 %**; Gesamt (×100): Umsatz 990 €, Marge 152,40 €, Auszahlung 498,47 €.

### 2.6 Break-even-Nutzung im Portal (`breakeven.ts`)

Margen-Schwelle für die ACoS/TACoS-Ampel, Priorität: (1) hand-eingetragene Account-Marge `BrandRecord.marginPct`, sonst (2) Durchschnitt der Break-even-ACoS aller gespeicherten Produktmargen (`breakEvenAcos()`, Z.15–27). `acosColor()`: ACoS **unter** Schwelle → `--good` (grün), **ab** Schwelle → `--bad` (rot); ohne Schwelle/Wert keine Färbung.

### 2.7 Rechner-UI (`src/app/margin/calculator.tsx`) — Eingabefelder als Vorlage

Varianten-Karten (mehrere Produkte/Varianten, „+ Produkt / Variante hinzufügen", editierbarer Name). Linke Spalte `MarginFormFields`:
- Kategorie (Select, 24 Kategorien)
- Pflicht (mit *): **Einkaufspreis €**, **Verkaufspreis (brutto) €**
- FBA-Versandgebühr €, Marketing / variabel €
- Bestellmenge, MwSt. %
- `<details>` „Maße & Gewicht (für Lager- & Entsorgungsgebühr)": Länge/Breite/Höhe cm, Gewicht g
- `<details>` „Retouren": Retourenquote %, Anteil Entsorgungen %
- `<details>` „Weitere Warenkosten": Verpackung €, Quality Inspection €, Logistik €, Zollsatz %
- `<details>` „Erweitert: Amazon-Gebühren überschreiben": Verkaufsgebühr-Satz %, Lagergebühr €, Versand an Amazon €, Retourenkosten €, Entsorgungskosten €

Rechte Spalte `MarginResults` (live): 4 KPI-Karten **Marge / Stück**, **Marge %** (rot bei Verlust), **ROI**, **Break-even-ACoS** (Hint „Max. Werbekostenanteil bis ±0"); StackedBar „Aufteilung des Netto-Preises" (Warenbestellung blau #4f8cff, Amazon-Gebühren orange #ffb648, Variable Kosten violett #9b8cff, Marge grün #2ecc8f / Verlust rot #ff5d6c); Detailtabelle: Brutto, Netto, Warenbestellung, Amazon-Gebühren (mit Satz) + eingerückt „davon Verkaufsgebühr/Versand (FBA)/Lager/Retouren/Entsorgung", Auszahlung von Amazon. Beispiel-Variante beim Start = das 1L-Fixture. Ab 2 Varianten: **Vergleichstabelle** (Brutto, Marge €, Marge %, ROI, BEP-ACoS, Marge-%-Balken). Dieselben zwei Komponenten werden im Portal-Margen-Manager wiederverwendet.

---

## 3. UI-/Dashboard-Inventar (Vorlage fürs Cockpit)

### 3.0 Design-System (`globals.css`)

Dark-Glass-Theme: `--bg #070a12`, Surfaces halbtransparent (rgba mit backdrop-blur), `--accent #5b8dff` (Blau), `--accent-2 #9b6cff` (Violett), `--accent-3 #34d0c4`, `--good #2ecc8f`, `--bad #ff5d6c`, `--warn #ffb648`, Radius 18px, Card-Schatten mit Glow. `overflow-y: scroll` fest reserviert (kein Layout-Shift zwischen Tabs). CSS-Klassen: `card`, `card lift`, `kpi-label`, `kpi-value`, `chip`, `toggle`/`toggle active`, `kw` (Tabellen), `bar-track`, `section-title`, `spinner`, `tabs/tab`.

### 3.1 Chart-Bibliothek (`src/components/charts.tsx`) — dependency-freies SVG

1. **Donut** (Z.21–95): Segmente + zentrierter Wert (`centerTop`/`centerSub`), optionale Legende mit %-Anteilen. Genutzt für Umsatzanteil je Produkt, Spend-Split, Branded/Generic, Spend je Anzeigentyp.
2. **StageLine** (Z.109–200): Linie+Fläche über geordnete Punkte, Wertlabels an jedem Punkt, optionale gestrichelte **Referenzlinie** (Break-even/Marge) und graue gestrichelte **Vergleichsserie** (Vorperiode) mit Mini-Legende „aktuell/Vergleich"; zweizeilige X-Labels (KW + Datumsbereich).
3. **CompareLine** (Z.214–300): zwei Serien (Ihr farbig vs. Markt grau) über gleiche Stufen; kollisionsvermeidende Wertlabels, wenn Linien nah beieinander.
4. **TrendLines** (Z.316–413): N Serien über Perioden, Farbpalette `#5b8dff #2ecc8f #d255b0 #ffb14e #9b8cff #4fd1d9`, Null = Linienbruch („Gaps bleiben ehrlich"), optional Wertlabels (gestaffelte dy) + Vergleichsserien gestrichelt.
5. **FunnelChart** (Z.430–520): Balken-Funnel (Marken-Absolutwerte, links→rechts) + je Übergang ein Paar-Balken „Ihr vs. Markt" mit ▲/▼-Delta in pp (grün/rot).
6. **StackedBar** (Z.535–584): horizontale Kostenaufteilung (Margen-Rechner); negative Segmente (Verlust) auf 0 geklemmt, aber in Legende; optionaler Marker (gestrichelte Linie).
7. **Scatter** (Z.600–723): Opportunity-Matrix; **log-skalierte X-Achse auf den Datenbereich normiert** (4 % Inset), Blasenradius `4 + √(gewicht/max)·16`, Hover-Tooltip als SVG (Keyword fett, Werte, umgebrochene Begründung), `<title>` als No-JS-Fallback.

### 3.2 Navigation & Shell

**Portal-Layout** (`r/[slug]/layout.tsx`): Zugriffsgate (Admin → alles; Client → nur eigener Slug, sonst Redirect auf eigenes Portal bzw. /login). Header: Agenturlogo, Chip „Admin"/„Kundenzugang", MarketplaceSwitch, Client-E-Mail, Abmelden; darunter Kundenlogo (Admin: klickbarer Upload) + Markenname + „Aktualisiert {Datum}". Body: Sticky-Sidebar (210px) + Content.

**PortalNav** (`portal-nav.tsx`): eigene SVG-Icons (11 Stück, single-stroke). Struktur:
- **Finanz Dashboard** (primär, hervorgehoben, `/r/slug`)
- REPORTS: Performance (`/report`), Umsatzanteil je Produkt (`/produkte`), Werbe-Kampagnen (`/ads`), B2B (`/b2b`, ausgegraut+nicht klickbar, wenn keine B2B-Daten)
- KEYWORD-ANALYSE: Übersicht, Keywords, Opportunity-Matrix, Cluster, N-Gramm-Analyse (`/analyse[/…]`)
- EINSTELLUNGEN: Produkte (`/scope`), Margen-Kalkulation (`/margin`), Zugriffsrechte (`/guidelines`), Berichte-Upload (`/upload`, nur Admin)
`?m=`-Marketplace-Param wird bei jeder Navigation mitgenommen. Alt-URLs `/monate`, `/wochenreport` → `/report`; `/reportings` → `/analyse`.

**Admin-Bereich** (`/`): Tabs „Kunden | Zugänge & Sicherheit | Anleitung". Kundenübersicht: 3 StatCards (Kunden, Reports gesamt, Kundenzugänge), „Neuen Kunden anlegen" (Name + optional Logo), Kundenkarten mit Monogramm/Logo + Chips (n Reports, n Produkte, n im Scope, n Zugänge). `/sicherheit`: AccountsManager (Zugang anlegen: Kunde-Dropdown + E-Mail + Passwort ≥8; Liste mit „Passwort ändern"/„Löschen"). `/anleitung`: internes Wiki (s. 3.13). `/upload`: globale SQP-Dropzone (Marke wird aus Dateikopf erkannt; bei genau 1 Marke Auto-Redirect ins Portal).

### 3.3 Finanz Dashboard (`page.tsx` + `overview.tsx`) — die Cockpit-Seite

Aufbau von oben nach unten:
1. **FinanceHeader**: RangePicker (Default „Gesamt"), KW-Label + Datumsspanne rechts; Chip „enthält manuelle Werte" bei Manual-Rows; Warnkarte „⚠ Gesperrte Wochen enthalten" (rote Umrandung, listet KWs). **Genau 4 KPI-Karten in fester Reihenfolge: Umsatz, Ad-Spend, ACoS, TACoS** — ACoS/TACoS gegen Marge gefärbt (`acosColor`), bei aktivem Vergleich Delta ↑/↓ (Umsatz: %-Delta, up=grün; Ad-Spend: invertiert; ACoS/TACoS: pp-Delta, down=grün). Link „Zum Performance-Report →".
2. Zwei Trendkarten (nur wenn >1 Punkt): **Umsatz-Verlauf je KW** (StageLine grün #2ecc8f, letzte 8 Wochen) und **TACoS-Verlauf je KW** (StageLine %, Referenzlinie „Marge").
3. **„⚡ Maßnahmen – das Wichtigste zuerst"** (Karte mit Akzentrahmen): Kopfzeile „Einsparpotenzial X € · Umsatzpotenzial Y €", Top-3-Maßnahmen nummeriert mit Severity-Label (Hoch=rot/Mittel=warn/Niedrig=dim), Link „Alle n Maßnahmen ansehen →".
4. **Scope-Status**: Chips „Offen: n / In Bearbeitung: n / Fertig: n".
5. **Keyword-Funnel · ihr vs. Markt** (`keyword-funnel.tsx`, nur wenn SQP vorhanden): eigener Produkt+Zeitraum-Selektor; (a) FunnelChart mit 4 Stufen Impressionen→Klicks→Warenkorb→Käufe, (b) **Share of Voice je Funnel-Stufe** (StageLine: Höhe = Marktanteil, Steigung = besser/schlechter als Markt konvertiert — mit ausführlicher InfoBox-Mathematik „Anteil danach ÷ Anteil davor = eure Rate ÷ Marktrate"), (c) **Eure Raten vs. Markt** (CompareLine: CTR, Warenkorb-Rate, Kaufrate absolut).

Datenfluss: `buildWeeklyRows(businessReports, adsReports)` → `mergePeriodFlags(rows, periodFlags)` → `Overview`; Marge via `effectiveMarginPct(record)`; Maßnahmen via `actionPlanForBrand`.

### 3.4 Performance-Report (`report/report-view.tsx`) — die Wochentabelle

Read-only konsolidierter KW-Report („exakt die Tabelle, die wir mit dem Kunden führen"). Default-Range „thisMonth". Berechnete Spalten bekommen dezente Akzent-Tönung (`calcCol`, 7 % Akzent).
- Hinweiszeile „Marge / Break-even-ACoS: X % – darunter profitabel, ab der Marge unprofitabel".
- **ComparisonSummary** (bei aktivem Vergleich): 6 Karten Umsatz, Ad-Spend (invertiert), Bestellungen, CR (pp), ACoS (pp, invertiert), TACoS (pp, invertiert).
- **Tabelle 1 „Gesamtübersicht · Produktseiten"**: Woche (KW + Datumsbereich) | Sitzungen | Bestellungen | Einheiten | CR | PPC-CR | Org.-CR | Umsatz | AOV | Adspend | TACoS. Footer = Gesamtzeile mit Zell-Deltas (▲/▼/→, flat <0,05 %) gegen Vergleich. Bewusst KEINE CTR/Impressionen (gibt es store-weit nicht).
- **Tabelle 2 „Werbung"**: Woche | Adspend | Impr | Klicks | CTR | PPC-Ord. | PPC-CR | PPC-Anteil (goodDir neutral) | PPC-Umsatz | PPC-AOV | ACoS (gefärbt) | BEP-ACoS (konstant).
- **Charts**: Umsatz (€, grün) und Ad-Spend (€, rot) nebeneinander (bewusst getrennte Achsen); **Conversion-Mix** (TrendLines: Conv. Rate/PPC-CR/Org.-CR) und **Umsatz-Split** (Gesamt/Organisch/PPC togglebar; Organisch = max(0, Umsatz − PPC-Umsatz), „Näherung, kein Cent-Ledger").
- **Toggle-Chart-Leiste** (EXTRA_CHARTS, report-view.tsx:423–442): ACoS (rot, BEP-Referenz), TACoS (violett, BEP-Referenz), Conv. Rate (türkis), PPC-Anteil (cyan) — default an; CTR (orange), Bestellungen, Einheiten, Retourenquote, Buy-Box (grün) — optional; Buttons „Alle"/„Keine". Alle mit Vergleichsoverlay.

### 3.5 Verkäufe & Traffic / Umsatzanteil (`sales/sales-dashboard.tsx`)

Zwei Views: **„products"** (Zeitraum-Dropdown einzeln, KPI-Reihe: Umsatz, Sitzungen, Bestellte Einheiten, CR (Einh./Sitzung), Buy-Box, Retourenquote (invertiert) — Delta nur, wenn Vorperiode GLEICHE Tagesanzahl abdeckt (`sameDuration`, Z.231–237), sonst Hinweis) + durchsuchbare Produkttabelle. **„share"** (= Seite `/produkte`): RangePicker mit Aggregation über Wochen (`mergeBusinessReports`), Umsatzanteil-Donut (Top 6 + „Sonstige", Palette Z.15) mit %-Delta zum Vergleich, plus Produkttabelle.
Produkttabelle: Suche (Substring über Titel+ASIN), Spalten Produkt (Kurzlabel „6 × 1L"-Extraktion, Z.18–26) | Sitzungen | CR | Einheiten | Umsatz | Buy-Box | Retouren (>5 % → warn-Farbe). Admin kann pro Zeitraum löschen + hochladen.

### 3.6 Werbe-Dashboard (`ads/ads-dashboard.tsx`)

`summary`-Modus (Seite `/ads`): 4 KPIs Impressionen, PPC-Umsatz, Ad-Spend (invertiert), ACoS (gefärbt) + Kampagnen-Tabelle. Voll-Modus: 8 KPIs (+ ROAS „x,yz×", Klicks, CTR, PPC-Orders); Break-even-Hinweiszeile („aktuell X % → profitabel / ab der Marge – Umsatz wird unprofitabel erkauft"); **„Monthly-Reporting-Kennzahlen · Werbung × Business Report"**-Karte (Umsatz, CR, PPC-CR, Org.-CR, PPC-Anteil, AOV, ACoS, TACoS aus `combinedFromTotals`, Z.285–300 — Achtung: hier Orders = bestellte Einheiten!) bzw. Hinweis, wenn Business-Report für die Wochen fehlt; Spend-Donut je Anzeigentyp (SP blau/SB grün/SD orange, Z.15–20) mit Spend-% und ACoS je Typ; Kampagnentabelle (Name gekürzt um „TE-DE-"-Präfix, Portfolio + „Ziel X %", Typ-Badge, Impr., Klicks, Spend, PPC-Umsatz, ACoS gefärbt, ROAS; Zeilen mit 0 Spend+Impr. 45 % Opacity); Adspend-Trend + ACoS-Trend (Referenzlinie „Break-Even") ab 2 Perioden.

### 3.7 B2B (`b2b/b2b-dashboard.tsx`)

Aus den „… – B2B"-Spalten des Business-Reports. RangePicker; 6 Karten: B2B-Umsatz, B2B-Anteil am Umsatz (pp-Delta), B2B bestellte Einheiten, B2B-Einheiten-Anteil, B2B-Bestellposten, Ø B2B-Bestellwert (= B2B-Umsatz ÷ B2B-Bestellposten). StageLine „B2B-Umsatzanteil je Zeitraum" (violett) + Tabelle je Zeitraum mit Gesamt-Footer. Leerzustand erklärt die B2B-Spalten.

### 3.8 Keyword-Analyse (`dashboard.tsx`, Sektionen `uebersicht|keywords|opportunity|cluster|ngram`)

Toolbar: „Search Query Performance · n Reports · m Produkte" + **„🔗 Sales-Room-Link teilen"** (Copy). Selektor-Karte: Produkt (brand-level zuerst), **Zeitraum von/bis** (mehrere Wochen → `mergeSqpReports`-Aggregat, Chip „n Wochen aggregiert"), Vergleich (kein/Vorperiode/Vorjahr — nur bei Einzelperiode). **Portfolio-Übersicht** ab 2 Produkten: 3 KPIs (Umsatz/Käufe/Potenzial gesamt) + klickbare Produkttabelle (Eure CVR, Δ Markt, Markenumsatz, Potenzial, Keywords).

- **Übersicht**: ★ **Top-Priorität-Hero** (Keyword mit CVR>Markt, Volumen, Sichtbarkeits-Headroom; 6 HeroStats + generierter Satz „Dieses Keyword konvertiert +X pp über dem Markt bei N Suchen/Monat und hält erst Y % Sichtbarkeit"); 4 KPI-Karten (Eure CVR, Eure CTR — je mit Markt-Sub + Trend-Badge; Geschätzter Markenumsatz mit %-Trend; Umsatzpotenzial gesamt = Sichtbarkeit + Conversion); **„Quintessenz"**-Karte mit Auto-Headlines (insights.ts:196–258); **Szenario-Steuerung**: 2 Tabs „Ziel = Kauf-Share" (Default) / „Fester Zielwert" (Slider 5–100 %, Step 5, Default 50 %) mit MODE_DESC-Erklärtexten und großer InfoBox (Formeln: Sichtbarkeit = (Ziel−Ist-Share) × Markt-Impressionen × eure CTR × eure CVR × Preis; Conversion = max(0, Markt-CVR−eure CVR) × eure Klicks × Preis); 3 PotentialStats (Über Sichtbarkeit/Über Conversion/Gesamt), je mit „Wie wird das berechnet?"-InfoBox.
- **Keywords**: **Top-Keywords im Funnel** — Keyword-Buttons (Top-Umsatzkeywords bis ~80 % kumuliert, max 10), pro Auswahl FunnelChart + Tabelle Stufe/Ihr/Markt/Lift (SoV bei Impressionen, ↑/↓-Lift bei CTR/Warenkorb/Kaufrate); **Umsatztreiber-Leaderboard** (Top 20 nach Markenumsatz: Volumen, Eure Käufe, CVR, Δ Markt, Sichtbarkeit, Umsatzbalken, kumul. Anteil); **Top-Keywords nach Umsatzpotenzial** (Spalten inkl. „Preis vs. Markt" = Preis-Premium aus tier1, „Engpass" = Sichtbarkeit→Klick / Klick→Warenkorb / Warenkorb→Kauf, Potenzialbalken).
- **Opportunity**: Scatter-Matrix (X=Suchvolumen log, Y=Sichtbarkeit %, Größe=Potenzial, max 200 Keywords), Farb-Chips mit Zählern je Typ (Farben dashboard.tsx:107–115: bleeder #d255b0, easyWin #2ecc8f, fixListing #ff5d6c, scale #4f8cff, defend #9b8cff, maintain #5a6b86, niche #3a4661; Labels: Bleeder / Leichtes Geld / Listing fixen / Skalieren / Verteidigen / Halten / Nische), InfoBox mit Klassifikationslogik (Median-Vergleiche), **aufklappbare Gruppenliste** je Typ (Top 8 + „… und n weitere"); darunter **Branded vs. Generic**: 2 Segment-Karten (CVR groß; „wenig Daten"-Warnung bei <30 Klicks, dashboard.tsx:1000) + Umsatz-Donut, große InfoBox (erklärt CVR vs. Umsatzanteil, Commodity-Fall).
- **Cluster**: Tabelle Top 12 Cluster (Kopf-Wort-Gruppierung; Keywords, Volumen, CVR, Δ Markt, Sichtbarkeit, Kauf-Anteil, Markenumsatz) + **„Cluster-Walking"**: TrendLines des Kauf-Anteils je Top-6-Cluster über alle Perioden („Steigende Linien = ihr erobert das Thema").
- **ngram**: bettet SearchTermDashboard read-only ein.
- Fußnote: „Quelle: {Datei} · Stand {Datum} · CTR/CVR auf Klick-/Impressions-Basis berechnet, einheitlich für Marke und Markt."

### 3.9 Suchbegriffs-/N-Gram-Dashboard (`searchterm/searchterm-dashboard.tsx`)

Zeitraum-Dropdown (+Admin: Upload/Löschen). **Spend-Split-Karte**: Donut Konvertierend (grün) vs. Nicht konvertierend (rot) mit Gesamt-Spend im Zentrum + Zeilen mit €/%; **„⚠ Wasted Spend"-Karte**: großer roter Betrag + „n Suchbegriffe ohne Conversion / m konvertierende". **Wort-Muster-Toggle 1-/2-/3-Wort** („n Wurzeln · ASIN-Ziele ausgeschlossen"). Zwei RankedLists: „↗ Top Converting Intent" (Top 7 nach Sales, Sub „n Orders") und „↘ Negative-Kandidaten" (Top 7 nach Spend, „0 Orders"; Leertext „Keine budgetfressenden Wurzeln – sauber!"). Detail-Tabelle Top 50 Wurzeln: Wurzel, Freq., Impr., Klicks, Spend, Umsatz, Orders, CTR, CPC, CVR, ACoS (rot wenn wasted, grün wenn Sales). Separate Karte **„ASIN-Ziele ohne Conversion"** (Top 6, Monospace-ASIN + Kampagne + Spend). Leerzustand enthält die komplette Export-Anleitung (Bericht erstellen → Vorlage „Suchbegriff" → E-Mail agency@temoa.de).

### 3.10 Maßnahmen (`massnahmen/action-plan.tsx`)

3 Kopfkarten: Einsparpotenzial (rot), Umsatzpotenzial (grün), Offene Maßnahmen (Anzahl). Dann ActionCards: Rang, Titel, Kategorie-Badge (PPC blau/Keywords grün/Listing orange), Severity-Badge, Detailtext, „→ umsetzen unter {Quelle}", rechts €-Impact + „betroffen". Leerlauf: „Aktuell keine dringenden Maßnahmen – die Kampagnen laufen im Rahmen. 👍". Quelle `actionPlanForBrand` (`actionplan/forBrand.ts`): nutzt jeweils NEUESTEN SearchTerm-/Ads-Report + SQP-Signale der neuesten Periode (über alle Produkte aggregiert; Top-Priority = größtes Einzelpotenzial).

### 3.11 Einstellungen-Seiten

- **Scope-Editor** (`scope/scope-editor.tsx`): Import-Karte (ASIN-Textarea → `extractAsins`, De-Dupe; CSV-Upload z. B. Helium 10 → `parseProductCsv`), danach **automatischer Amazon-Lookup** (Titel+Hauptbild) via `/scope/lookup` mit Fortschritts-/Fehlermeldung („x/y ASINs angereichert"). Produktzeilen: Status-Leuchtpunkt (offen dim/in Bearbeitung warn/fertig grün, mit Glow), 44px-Thumb, Felder Name/ASIN/SKU/Status/Notiz/Bild-URL, Entfernen. Speichern als kompletter PATCH (filtert leere Zeilen).
- **Margen-Manager** (`margin/margin-manager.tsx`): **Account-Margen-Karte** (eine %-Zahl, Vorrang vor berechnetem BEP-ACoS, erklärt die Ampel-Logik) + je Scope-Produkt eine Karte mit gespeicherter Kalkulation (`MarginResults` read-only) bzw. Edit-Modus mit den geteilten `MarginFormFields`+`MarginResults` aus dem Standalone-Rechner. **Clients dürfen Margen editieren** (eigene API-Route mit `canAccessSlug` statt Admin-only).
- **Guidelines** (`guidelines/guidelines.tsx`): „Frag Christoph"-Chat oben; **AgencyEmailCard** („Zugriff gewähren für" — E-Mail groß in Monospace, Kopieren-Button, Admin editierbar); die 5 GUIDES als `<details>`-Akkordeon (Titel + Kurzbeschreibung, „Damit können wir: …", nummerierte Schritte mit eingesetzter Agentur-E-Mail). Fußnote: Amazon-Menüs ändern sich → Christoph fragen.
- **Die 5 Onboarding-Guides** (`src/lib/guidelines.ts`, vollständig): (1) **Nutzer einladen & Berechtigungen vergeben** — Seller Central Zahnrad → Einstellungen → Benutzerberechtigungen → Neuen Benutzer hinzufügen mit {agencyEmail} → Einladung bestätigen → „Berechtigungen verwalten" → Bereiche auf „Anzeigen & Bearbeiten"/„Nur Anzeigen". (2) **Lesezugriff auf Berichte** (Search Query, Business, Brand Analytics) — Berichte→Geschäftsberichte mind. „Nur Anzeigen"; Markenanalysen/Brand Analytics inkl. SQP „Nur Anzeigen"; optional Lagerbestandsberichte. (3) **Amazon Ads** — advertising.amazon.de → Nutzer verwalten → einladen, Rolle „Administrator" oder „Anzeigenmanager" (letzterer genügt für Optimierung). (4) **Brand Store bearbeiten** — Voraussetzung Brand Registry; Benutzerberechtigungen → „Stores" auf „Anzeigen & Bearbeiten". (5) **Brand Registry Rolle** — brandservices.amazon.de → Benutzer hinzufügen, Rolle „Registrierter Vertreter" oder „Benutzer" (für A+/Store-Pflege).
- **Christoph-Chat** (`christoph-chat.tsx`): Avatar (christoph.jpg → christoph.svg → Monogramm-Fallback), Begrüßung „Hey, ich bin Christoph 👋…", 4 Preset-Quick-Replies (Leseberechtigung, Search-Query-Zugriff, Brand-Store-Rechte, „Welche Berechtigungen braucht ihr zum Start?"), eigener Mini-Markdown-Renderer (fett, ol/ul, hr, Absätze — ohne raw HTML), „Christoph tippt…"-Indikator.

### 3.12 Upload-Flows

- **Zentrale Upload-Hub** (`upload/reports-upload.tsx`, admin-only): (1) **Sales-Room-Link-Karte** (Kundenlink kopieren/öffnen); (2) **Marktplatz-Selektor** (taggt alle Uploads; „Bestehende Berichte zählen als Deutschland"); (3) 4 Upload-Felder mit exakten Amazon-Quellen-Anleitungen: Verkäufe & Traffic (RangeMultiUpload), Werbung (RangeMultiUpload — Hinweis: max. Zeilenzahl, Filter aktiviert/pausiert entfernen für archivierte, Land wählen), Suchbegriffsbericht (RangeMultiUpload), Keyword/SQP (UploadDropzone — Marken- vs. ASIN-Ansicht-Regel: Markenansicht nur bei faktisch einer ASIN in Bundle-Größen); (4) **„Hochgeladene Berichte verwalten"**: je Kind Chips pro (Marktplatz × Zeitraum) mit ✕-Löschung (optimistisch, mit Spinner); (5) PeriodFlagsEditor; (6) **DangerZone** „Alle Berichte löschen" (Stammdaten bleiben). Optimistisches Mergen frisch hochgeladener Perioden wegen eventual consistency (Z.70–89).
- **RangeMultiUpload** (`range-multi-upload.tsx`): 2 Modi. **„Pro Datei"**: Zeitraum je Datei auto-erkannt (Reihenfolge: CSV-Inhalt `detectRangeFromCsv` → Dateiname `parseRangeFromFilename`), editierbare von/bis-Datumsfelder, Status je Datei (✓ erkannt–bitte bestätigen / ⚠ manuell angeben). **„Gesamtzeitraum + feste Länge"**: freier Zeitrahmen + Länge je Datei (7/14/30/frei Tage); Dateien numerisch-sortiert nach Name bekommen konsekutive Blöcke und müssen den Rahmen **lückenlos kacheln** (`validateTiling`: Lücke/Überschneidung/beginnt/endet/nicht-erkennbar-Fehlermeldungen; grünes „✓ Lückenlos"-Feedback). Ganzer Batch in EINEM Request (ein Read-Modify-Write → keine Lost Updates), Ergebnisse index-aligned.
- **RangeUploadForm** (`range-upload-form.tsx`): einfachere Variante (nur Pro-Datei-Modus) für die Inline-Uploads in Sales/SearchTerm-Dashboards.
- **UploadDropzone** (`upload-dropzone.tsx`, SQP): Multi-CSV, Marke wird aus Meta-Kopfzeile erkannt; Ergebnisliste je Marke; bei genau einer Marke Redirect in deren Portal.

### 3.13 Widgets & Sonstiges

- **RangePicker** (`range-picker.tsx`): aufklappbarer Button „📅 {Label} · n Wochen ▼" + Vergleich-Dropdown (Kein Vergleich / vs. Vorperiode / vs. Vorjahr). Aufgeklappt: Presets **Letzte Woche, Letzte 4 Wochen, Dieser Monat, Letzter Monat, Jahr (YTD), Gesamt**; „Von Woche/bis Woche"-Selects mit **optgroup je Monat**; Hinweis „Auswahl erfolgt in ganzen Wochen (Mo–So)…". Logik in `reporting/range.ts`: Woche gehört zum Monat ihres **Donnerstags** (ISO-Anker, Z.38); Vorjahr = Woche ~364 Tage früher, Toleranz ±4 Tage.
- **PeriodFlagsEditor** (`period-flags-editor.tsx`): Von/Bis-Datum, Checkbox „Account war in diesem Zeitraum gesperrt", Notiz, manuelle Werte (Umsatz brutto €, Bestellungen, Sessions, Ad-Spend €); Liste mit Chips „gesperrt"/„manuelle Werte", Bearbeiten/Löschen; persistiert als kompletter `periodFlags`-PATCH. Merge-Logik (`periodflags.ts`): Flag auf vorhandener Woche → nur suspended/note angehängt; Flag ohne Upload → synthetische Manual-Row (cr=orders/sessions, tacos=adSpend/revenue, Rest 0, `isManual:true`).
- **MarketplaceSwitch**: Flaggen-Toggles im Header, nur bei >1 Land; steuert `?m=`; 13 Marktplätze DE/FR/IT/ES/NL/BE/SE/PL/IE/UK/US/CA/MX, Default DE (`marketplaces.ts`). `recordForMarketplace()` filtert nur Reports — Stammdaten (Scope, Margen, Flags) sind länderübergreifend.
- **Anleitung/Wiki** (`anleitung/page.tsx`): 4+1 Berichts-Guides (SQP, Business by-ASIN, optional Business by-Date, Ads, SearchTerm) mit Quelle/Zeitraum/Füllt/Upload-Spalten; Schnellstart-Checkliste neue Marke; **Kennzahlen-Data-Dictionary** in 6 Gruppen (Direkt übernommen / Aus einem Report / Aus mehreren Reports zusammengeführt [TACoS, Org-CR, PPC-Anteil, Werbe-Ampel] / Suchbegriffe / Marge / SQP) mit Formeln und farbigen Quellen-Chips (Business blau, Werbung violett, Suchbegriffe grün, SQP orange, Marge pink). Grundregel: „Zeitraum muss exakt dem Export entsprechen — das Tool schneidet nichts zu und rechnet nichts hoch."

### 3.14 Auth, Persistenz, APIs (Details)

- **Sessions** (`session.ts`): stateless, HMAC-SHA256-signierter base64url-JSON-Payload in httpOnly-Cookie `rs_session`, 30 Tage; Rollen `admin` (Shared Password `ADMIN_PASSWORD`, constant-time check) und `client` {slug, accountId, email}. `canAccessSlug`: admin→alles, client→nur eigener Slug.
- **Accounts** (`auth.ts`): eine JSON-Datei `accounts.json`; scrypt(salt 16B, 64B) als „saltHex:hashHex"; E-Mail lowercase-unique; Passwort ≥8 Zeichen (API-seitig).
- **Blob-Store** (`blob-store.ts`): Key→JSON-Interface; Vercel Blob wenn `BLOB_READ_WRITE_TOKEN` gesetzt, sonst Filesystem (`REPORT_STORE_DIR`, Default `./uploads`). Blob: deterministische Pfade, `allowOverwrite`, `cacheControlMaxAge:0` UND zusätzlich **Cache-Buster-Query je Read** (`fresh()`, Z.42 — CDN-Edge-Cache-Umgehung, sonst wirkten Deletes „nicht"). Binär-Assets (Logos) → öffentliche Blob-URL bzw. `/api/assets/…`-Route (Traversal-Guard).
- **Store** (`store.ts`): 1 JSON-Dokument je Marke unter `brands/<slug>.json`. `BrandRecord`: entries (SQP je Produkt×Periode×Marktplatz, ID `MK:productKey@periodKey`), businessReports/adsReports/searchTermReports (ID `MK:periodKey`, Re-Upload überschreibt), scope, margins, marginPct, agencyEmail, logo, links, baselineKpis, profile, periodFlags. Slug: NFKD-normalisiert, `[^a-z0-9]+`→`-`. Batch-Upserts als EIN Read-Modify-Write.
- **API-Matrix**: alles Admin-only außer: `PATCH /api/clients/[slug]/margins` (auch Client, nur Margen), `POST …/assistant` (auch Client). Logo: max 2 MB, PNG/JPG/WEBP/GIF/SVG, cache-busted Key. Scope-Lookup: max 60 ASINs, Konkurrenz 4. `DELETE …/reports` ohne Query = alles löschen, mit `?period=` nur SQP-Periode. Client-PATCH whitelisted Felder explizit.
- **ASIN-Scraping** (`scope/amazon.ts`): fetch `https://www.amazon.de/dp/<ASIN>` mit Chrome-UA + `Accept-Language: de-DE`, Timeout 10 s; Titel aus `#productTitle` → `og:title` → `<title>` (Amazon-Suffix gestrippt); Bild aus `data-a-dynamic-image` (breiteste URL) → `data-old-hires` → `og:image`; Entity-Decoder; never-throws, Fehler pro ASIN; `fetchAmazonProducts` mit Konkurrenz 4.
- **Christoph-API** (`assistant/route.ts`): Model `ASSISTANT_MODEL` (Default `claude-opus-4-8`), max_tokens 6000, System-Prompt mit Persona (Du-Form, locker, sparsame Formatierung, keine ---) + alle 5 Guides als **gecachter Prefix** (`cache_control: ephemeral`); Tool `web_search_20260209` mit pause_turn-Resume-Schleife (max 4); Fallback-Retry ohne Tools; ohne `ANTHROPIC_API_KEY` Graceful-Degradation-Text. History-Cap 16 Turns.

---

## 4. Testfälle / Golden-Werte (alle 25 Test-Dateien)

### Margin (`margin/calc.test.ts`) — siehe 2.5; zusätzlich:
- Nur Pflichtfelder (EK 2, VK 10): Netto 8,403361; Referral 0,80 (8 %); Lager/Entsorgung 0; Marge = 8,403361−2−0,8.
- Override schlägt Auto: `storageFee: 0.5` ersetzt berechneten Wert.
- Staffel-Checks: Beauty 9 €→8 %, 11 €→15 %; Auto&Motorrad 60 €→9 %; Alles andere 100 €→8 %.

### Ads-Parser (`ads/parser.test.ts`)
- **US-Export** (`DE_CampaignReport_example_20260430_20260529.csv`): Profil „Handelsagentur und Manufaktur Altmark"; 20 Kampagnen inkl. pausierter; Typ-Mapping sponsoredProducts→SP, sponsoredBrands→SB, sponsoredDisplay→SD; Kampagne 8684861467846: Spend 1189,66 / Sales 8102,29 / Conv 364 / Impr 72384 / Klicks 913 — ACoS/ROAS/CTR/CVR IMMER aus Rohwerten neu berechnet, nie aus Datei; **Target-ACoS aus Portfolio-Namen geparst**: „ACOS Ziel 10%"→0,10; „Max Conversion"→null; Totals = Summen, Raten aus Summen (nie ACoS-Mittelwert).
- **Deutscher Export** (`DE_AdsExport_german_example.csv`, ohne ID- und Impressions-Spalte): 20 Zeilen, Name als ID; deutsche Zahlen „2.447,18 €"→2447,18; **Impressions abgeleitet = round(Klicks ÷ CTR)** (123÷0,0045≈27333); Typ-Codes SB2→SB, SP→SP, SD→SD; Totals: Klicks 986, Spend 1119,86, Conv 249, Sales 7025,27.
- `parseTargetAcos`: „ACoS Ziel 20%"→0,20; „Ziel 12,5%"→0,125 (Komma-Dezimal); null-tolerant.

### Ads-Aggregate (`ads/aggregate.test.ts`)
- Einzelreport wird identisch zurückgegeben; Merge summiert je Kampagnen-ID (C1: 600+490,62=1090,62), neue Kampagnen bleiben separat; Totals-ACoS = 1190,62/3900 (neu abgeleitet).

### Business-Parser (`business/parser.test.ts`)
- Child-ASIN B0FC6NX87C über 3 Parents aggregiert: Sessions 2406+2273+1632, Revenue 16426,53+15832,80+11390,82, Units 747+720+518; parentAsins.length 3; unitsPerSession aus Aggregat neu.
- Leere-Titel-Zeile wird verworfen; Sortierung nach Revenue; Buy-Box sessions-gewichtet in 0..1.
- **B2B-Spalten**: „Durch bestellte Produkte erzielter Umsatz – B2B", „Bestellte Einheiten – B2B", „Bestellposten – B2B" → revenueB2B 200, unitsB2B 8, orderItemsB2B 6; ohne Spalten alles 0.
- **By-Date-Layout** (kein ASIN): alles zu EINEM Produkt „Gesamt" summiert; KW20-Goldwerte: Sessions 1266, Bestellposten 327, Einheiten 367, Umsatz 8575,10 brutto; ÷1,19 = 7205,97 netto (reproduziert das manuelle Sheet).

### Business-Aggregate (`business/aggregate.test.ts`)
- Merge je Child-ASIN: A = 100+300 Sessions, 1000+2000 €, 50+80 Units; Buy-Box sessions-gewichtet (0,9·100+0,5·300)/400 = 0,6; Totals neu abgeleitet (3500 € / 450 Sessions / 140 Units).

### SearchTerm-Parser (`searchterm/parser.test.ts`)
- Sample: 15 Zeilen, EUR, Portfolio „ACOS Ziel 25%". Top-Term „gardinenstange ausziehbar" broad: Impr 15702 (aus „15.702"), Klicks 478, Spend 211,34, Sales 933,17, Orders 41, Units 43; Raten aus Rohwerten.
- Match-Types: EXACT→exact, PHRASE→phrase, BROAD→broad, „-" (Auto-ASIN)→other; ASIN-Erkennung `isAsinTerm` (b0cxyz1234, B0AB981234 ja; „b0", „" nein).
- **Totals-Goldwerte**: spend 860,06; sales 3083,17; orders 137; units 143; clicks 1818; impressions 60048; **zeroOrderTerms 7, convertingTerms 8; wastedSpend = 41,00+20,43+18,10+17,59+14,49+12,78+12,54 = 136,93** (die 7 Null-Order-Terme: teleskopstange, b0cxyz1234, gardinen, balkon sichtschutz, b0ab981234, fenster deko, aussen).
- **„Bericht erstellen"-Template** (deutsche Header „Suchbegriff/Gesamtkosten/Käufe/Verkäufe/Verkaufte Einheiten", aber US-Punkt-Dezimal + „Datumsbereich"-Spalte): 2 Zeilen, spend 21,52, sales 44,60; ASIN-Target-Flag; wastedSpend 15.

### N-Gram (`searchterm/ngram.test.ts`)
- 1-Wort-Wurzel „gardinenstange": Frequenz 4 (in 4 Termen enthalten, NICHT in „gardinen"/„vorhang stange"), Spend 211,34+142,88+60,40+70,00, Orders 41+29+8+17, Sales 933,17+612,40+188,00+388,00; Raten aus Summen.
- 2-Wort nur **zusammenhängend** („gardinenstange ausziehbar": 3 Terme), de-dupliziert innerhalb eines Terms.
- ASINs aus Wurzeln ausgeschlossen; **kein Stemming, Stopwörter bleiben** („ohne", „weiss" bleiben eigene Wurzeln — literale Wurzeln für Keyword-Aktionen); Sortierung nach Spend desc.
- `topConverting`: nur Orders>0, nach Sales; Top „gardinenstange". `negativeCandidates`: Spend>0 & Orders=0, Top „teleskopstange" mit 41,00 €.

### ActionPlan (`actionplan/build.test.ts`)
- `st-negatives`: Impact = wastedSpend − ASIN-Waste (20,43+14,49); Titel enthält „Negativ-Keywords"; Detail nennt „teleskopstange".
- `st-asin-negatives`: Impact = 34,92 (ASIN-Waste separat).
- `st-scale-converting`: Impact **null** (Skalierungs-Wurzeln zählen nicht als Upside), Detail nennt „gardinenstange".
- `ads-over-target`: Überspend über Portfolio-Ziel = spend − sales×targetAcos (40−100·0,2 = 20 €); Titel „1 Kampagnen".
- `ads-no-sale`: Kampagnen mit Spend ohne Sales → Impact = voller Spend.
- SQP: `sqp-bleeder` severity high, `sqp-easywin` medium, `sqp-top-priority` Impact = Potenzial; Sortierung high→medium→low; **totalWaste = kompletter wastedSpend (Text+ASIN), totalUpside = nur SQP-Potenzial**.

### SQP-Parser (`sqp/parser.test.ts`)
- `parseNumber`: „"/„-"→null; „41.18"→41,18; „16,95 €"→16,95; „5,02 %"→5,02; „1.234,56"→1234,56 (beide Zahlformate).
- Meta-Zeile `Marke=["HaA"],Berichtszeitraum=["Monatlich"],Jahr auswählen=["2026"],Monat auswählen=["April"]`; Sample: 1000 Zeilen, reportDate 2026-04-30, ASIN null (Markenansicht). Erste Zeile „bioethanol zum reinigen": volume 17, imprTotal 478, imprBrand 24, imprShare 5,02, clicksTotal 7, clickRateAmazon 41,18, clicksBrand 1, clickShare 14,29, cartAddsTotal 2, purchasesTotal 0. Nie NaN.

### SQP-Metrics (`sqp/metrics.test.ts`)
- Standard-Row (imprBrand 200/clicksBrand 20/purchBrand 2, Markt 1000/100/25, Preis 30): brandCtr 10, marketCtr 10, brandCvr 10, marketCvr 25, cvrDeltaPp −15; **lostPurchases = MarktCVR×eigene Klicks − eigene Käufe = 3; revenuePotential = 3×30 = 90 €**; nie negativ; null (nicht NaN) bei 0-Nennern. `analyzeReport`: brandCvr aus Summen (2/20=10 %).

### SQP-Scenario (`sqp/scenario.test.ts`)
- Fixed 25 % bei Ist-Share 5 % (imprBrand 50/1000, CTR 20 %, CVR 50 %, Preis 30): +200 Impressionen → +40 Klicks → **+20 Käufe → 600 € Sichtbarkeits-Potenzial**. 0 wenn schon über Ziel. `matchPurchaseShare`: Ziel = Kauf-Anteil (25/100 → 25 %). DEFAULT_SCENARIO = {matchPurchaseShare, 50 %}.
- Conversion-Hebel: (Markt 50 % − Marke 10 %) × 10 Klicks × 30 € = **120 €**; 0 wenn Marke besser konvertiert.

### SQP-Tier1 (`sqp/tier1.test.ts`)
- Cart-to-Purchase Marke 5/10=50 %, Markt 25/50=50 %; Preis-Premium 36 vs 30 = +20 %.
- Engpass-Diagnose braucht **≥5 Marken-Klicks** (`MIN_CLICKS_FOR_DIAGNOSIS = 5`, tier1.ts:65); purchase-Engpass → Empfehlung matcht /Buy-Box|Preis-Wettbewerb/ („Warenkorb-Adds konvertieren nicht zum Kauf → Preis-Wettbewerb, Buy-Box und Verfügbarkeit prüfen").

### SQP-Tier2 (`sqp/tier2.test.ts`)
- ShareFunnel: imprShare 5 % → purchaseShare 12 % = +7 pp Lift → Typ „visibility"; fallender Share → „conversion".
- Opportunities: hohes Volumen + niedriger Share + CVR>Markt → easyWin; **Bleeder = echte Marken-Klicks aber 0 Käufe** (10 Klicks ja, 1 Klick = Rauschen, nicht Bleeder); Bleeder hat Vorrang.
- Branded: `deriveBrandTerms("HaA Home")` enthält „haa"; „haa bioethanol" branded, „bioethanol kamin" nicht; Segmente getrennt aggregiert (CVR 60 % vs 20 %).

### SQP-Aggregate/Comparison/Period (`sqp/aggregate|comparison|period.test.ts`)
- Merge: Funnel-Counts + Volumen summiert; Shares aus Summen neu (200/1500); **Preis-Mediane über Perioden gemittelt** (20 u. 30 → 25).
- `compareInsights`: absolute + %-Deltas (brandCvr +5 abs; Revenue 1200 vs 1000 → +20 %); pct null bei Basis 0.
- Perioden: „2026"+„April" → Key „2026-04", Label „April 2026"; März→3; ohne Monat nur Jahr; productKey = ASIN oder BRAND_LEVEL-Sentinel; `findComparisons("2026-04")` → previous „2026-03", lastYear „2025-04".

### SQP-Cluster (`sqp/cluster.test.ts`)
- `stemToken`: De-Umlaut + leichte Flexions-Endung („Gehstöcke"≡„gehstock"; „STRAßE"→„strass"); kurze Stämme unangetastet.
- Zuordnung: Flexionsvarianten + „gehstock holz" in EINEM Cluster; **Kopf-Wort = das in den meisten Queries geteilte Token**; token-lose Queries → Cluster „" mit Label „Sonstige".
- Aggregation: Funnel summiert, brandCvr aus Summen (8/20=40 %); `buildClusterTrend`: stabile Cluster-Identität über Perioden (2 %→8 % Kauf-Anteil = „Walking").

### Period/Range/Weekly/Flags (`period.*.test.ts`, `reporting/*.test.ts`)
- `parseDateCell`: „15.03.26"→2026-03-15; „5.3.2026"→2026-03-05; ISO durchgereicht; „32.01.26" abgelehnt.
- `detectRangeFromCsv`: „Datum"-Spalte → min/max; **„Datumsbereich"-Zelle** („17.05.2026 - 23.05.2026") wird auch erkannt (Token-Regex); by-ASIN-Report → null.
- `rangeKey` „20260430_20260529" chronologisch sortierbar; `rangeDays` DST-fest (Mai-Range = 30 Tage, März = 31); `formatRange`: „30.04.–29.05.2026", eintägig „01.05.2026", jahresübergreifend „30.12.2025–05.01.2026"; `parseRangeFromFilename` mit Plausibilitäts-Guard (ASIN-Ziffernfolgen abgelehnt).
- `calendarWeekLabel`: **So–Sa-Export wird der KW seines Mittel-Tags zugeordnet** (20260503_20260509 → „KW 19"); Monat → „KW 14–18"; TOTAL → „".
- `validateTiling`: 4 zusammenhängende Wochen ok; 1 Datei = ganzer Rahmen ok; Fehlertexte matchen /Lücke/, /Überschneidung/, /beginnt/, /endet/, /nicht erkennbar/; monatsübergreifend driftfrei.
- Range-Presets: last1=1, last4=4, thisMonth=alle Wochen des Monats der letzten Woche, ytd=alle Wochen des Jahres (52-Wochen-alte Woche ausgeschlossen); previous = n Wochen davor; lastYear = Woche ~364 Tage früher (±4 Tage); weeksByMonth neuester Monat zuerst.
- `computeWeeklyRow` (mit Sample-KW20 + DE-Ads): sessions 1266, orders 327 (Bestellposten!), units 367, cr 327/1266, revenue 8575,10 brutto, aov = revenue/327; adSpend 1119,86, clicks 986, acos = spend/ppcRevenue, tacos = spend/8575,10; orgCr = (327−ppcOrders)/1266; ppcShare = ppcOrders/327; nur Business (ohne Ads): adSpend/tacos 0.
- PeriodFlags: Flag auf realer Woche → suspended/note angehängt, Zahlen unverändert; Flag ohne Upload → Manual-Row (revenue 2380 brutto wie eingegeben, cr 50/500, tacos 119/2380, hasAds true, isManual); reine Sperr-Markierung → Null-Zeile mit isManual; Sortierung alt→neu.

### Scope/Auth/Session/Store
- `scope/amazon.test.ts`: Titel-Fallback-Kette + Entity-Decoding; Bild: breiteste URL aus data-a-dynamic-image → data-old-hires → og:image.
- `scope/import.test.ts`: isAsin (10 alphanumerisch MIT Ziffer, case-insensitive; „PRODUCTION" nein); extractAsins split auf Newline/Komma/Semikolon/Space + De-Dupe; parseProductCsv: Helium-10-Header, „Untergeordnete ASIN" bevorzugt vor Parent-Spalte, headerlose Datei = ASIN-Spalte, De-Dupe per ASIN, Titel-ohne-ASIN-Zeilen bleiben.
- `auth.test.ts`: hash/verify; Salt einzigartig; E-Mail case-insensitive; Duplikat wirft; listAccounts ohne passwordHash; Passwort-Reset + Delete.
- `session.test.ts`: Roundtrip admin/client; manipulierter Payload → null; checkAdminPassword constant-time; canAccessSlug-Matrix.
- `store.test.ts`: createBrand idempotent per Slug („Haus & Ambiente"→„haus-ambiente"); PATCH ersetzt Arrays wholesale, andere Keys bleiben; Identity-Felder (slug/createdAt) unveränderlich; **Batch-Upsert: 12 Perioden in einem Write, alle nach Reload da (kein Lost Update); Re-Upload gleicher Periode überschreibt statt dupliziert**.

---

## 5. NEU / korrigiert gegenüber der Kern-Analyse

1. **Gebühren-Tabellen jetzt im Wortlaut** (Abschnitt 2): 24 Kategorien mit Sätzen, 4 preisabhängige Staffeln (10-€-Schwelle Drogerie/Baby/Beauty, 50-€-Schwelle Auto), Lager 33,5425/19,5475 €/m³ × **2 Monate pauschal**, komplette Entsorgungs-Gewichtstabellen (8 Standard- / 25 Oversize-Stufen, Oversize-Kriterium: eine Seite ≥ 46 cm). Zoll gilt NICHT auf Quality Inspection (calc.ts:128).
2. **Retouren-/Entsorgungsformeln mit exakten Faktoren** (calc.ts:150–176): 20 % einbehaltene Verkaufsgebühr bei Retoure, 5-%-Pauschale auf Kostenbasis, 80 % Verkaufsgebühr-Erstattung bei Entsorgung, Bekleidungs-Doppelversand — plus 1L-Fixture als Regressionsanker (Marge 1,524022836 €, 18,319 %).
3. **`recharts` ist toter Dependency-Ballast** — sämtliche 7 Chart-Typen sind eigene SVG-Komponenten (`charts.tsx`), inkl. handgebautem Scatter-Tooltip und Null-Lücken-Pfaden. Für ein Cockpit heißt das: die exakten Chart-Spezifikationen sind kopierbar, keine Library-Bindung.
4. **UI-Detail bislang unbeschrieben**: Finanz Dashboard hat FEST 4 KPIs (Umsatz/Ad-Spend/ACoS/TACoS) + Maßnahmen-Highlight (Top 3) + eingebetteten Keyword-Funnel; Performance-Report trennt bewusst 2 Tabellen (Produktseiten ohne CTR vs. Werbung mit CTR — Begründung: gleiche Datenquelle je Tabelle) und tönt berechnete Spalten; 9 togglebare Zusatz-Charts; Vergleichs-Overlays (graue gestrichelte Linien) durchgängig.
5. **Wochen-Semantik**: RangePicker wählt nur ganze hochgeladene Wochen; Monat einer Woche = Monat ihres Donnerstags; Vorjahresvergleich per −364 Tage ±4 Toleranz; KW-Label eines So–Sa-Exports = KW des Mitteltags. `orders` = **Bestellposten** mit Fallback auf bestellte Einheiten (weekly.ts:83); die Ads-Dashboard-Kombikarte nutzt dagegen bestellte Einheiten als Orders (ads-dashboard.tsx:287) — kleine Inkonsistenz zwischen den zwei Ansichten.
6. **Vergleichbarkeits-Guards**: Sales-KPIs vergleichen nur Perioden gleicher Tageslänge (`sameDuration`); Keyword-Vergleich nur bei Einzelperiode; „wenig Daten"-Flag bei Branded-CVR unter 30 Klicks.
7. **Upload-Robustheit**: ganzer Batch in EINEM Request wegen eventual consistency des Blob-Stores (Lost-Update-Vermeidung, dokumentiert in range-multi-upload.tsx:181 und store.test.ts:64); Blob-Reads mit Random-Query-Cache-Buster gegen CDN-Staleness; Kachel-Validierung (`validateTiling`) für datumslose Exporte.
8. **Deutscher Ads-Export ohne Impressions-Spalte**: Impressions werden aus Klicks ÷ CTR rekonstruiert (parser.test.ts:93–98) — wichtig für eigene Parser-Nachbauten.
9. **SearchTerm-Parser versteht 2 Formate**: klassischer SP-Suchbegriffsbericht (deutsche Zahlen) UND „Bericht erstellen"-Template (deutsche Header, US-Dezimalpunkte, „Datumsbereich"-Spalte) — Zahlformat wird pro Datei erkannt.
10. **Rollen-Ausnahmen**: Clients sind read-only AUSSER Margen-PATCH und Christoph-Chat; Sales-Room-Link = Portal-URL (Zugriff trotzdem session-gated; „no login, shareable" im store.ts-Kommentar ist historisch — layout.tsx erzwingt Login).
11. **Christoph-Details**: Default-Modell `claude-opus-4-8` (env-überschreibbar), Guides als ephemeral-gecachter System-Prefix, `web_search_20260209`-Tool mit pause_turn-Schleife (max 4 Iterationen), Fallback ohne Tools, No-Key-Fallback-Text; UI mit 4 Onboarding-Presets und eigenem Safe-Markdown-Renderer.
12. **Onboarding-Guides vollständig** (guidelines.ts, UI in 3.11): 5 Guides (Nutzer einladen, Berichte-Lesezugriff, Amazon Ads, Brand Store, Brand Registry) mit `{agencyEmail}`-Platzhalter; identischer Text speist Portal-Akkordeon UND Christophs Wissensbasis.
13. **Internes Wiki** (`/anleitung`) enthält ein komplettes Kennzahlen-Data-Dictionary inkl. Join-Warnung („Zähler und Nenner aus VERSCHIEDENEN Berichten — Zeiträume müssen exakt übereinstimmen") und die 7-Tage-Attributions-Notiz für PPC-Zahlen.
14. **Marktplatz-Dimension**: alle 4 Report-Arten sind je (Marktplatz × Periode) versioniert; Legacy ohne Tag = DE; `recordForMarketplace` filtert Reports, teilt Stammdaten; 13 unterstützte Länder.
15. **Sample-Daten als Testfixtures** (sample-data/): 6 anonymisierte Exporte (SQP-Markenansicht 1000 Zeilen „HaA", Business by-ASIN + by-Date, US- und DE-Ads-Export, SearchTerm „Gardinenstange") — die Golden-Werte in Abschnitt 4 referenzieren genau diese Dateien.
