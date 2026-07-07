# Temoa-Tools-Beta — 100%-Vollextraktion (alle ~131 Dateien)

**Quelle:** `scratchpad/extracted/9257faa1-TemoaToolsBetamain3/Temoa-Tools-Beta-main/`
**Erstellt:** 2026-07-07 · Ergänzt die bestehende Kern-Analyse (buildPrompt, byteEnforcement, filterKeywords, reviews-Apify, campaignBuilder+excelExport, kpis/sqrBenchmark/campaignClassifier).
Alle `Datei:Zeile`-Angaben beziehen sich auf den Repo-Root `Temoa-Tools-Beta-main/`.

---

## 1. Vollständigkeits-Nachweis

Jede Datei des Repos wurde gelesen (vollständig) oder per `diff` als identisch/nahidentisch zu einer vollständig gelesenen Datei verifiziert:

| Bereich | Dateien | Abdeckung |
|---|---|---|
| Root-Docs | `CLAUDE.md` (405 Z., v7.3), `README.md` (256 Z., Handover v5.0), `HANDOVER.md` (354 Z., techn. Assessment v1.0/25 Mai 2026), `.gitignore` | vollständig gelesen |
| Root-App | `index.html` (937 Z., Markup gescannt: Login-Overlay, SEO-Panel, SOV-Panel mit 3 Sektionen), `source/script.js` (2450 Z., **komplett**), `styles/style.css` (344 Z., CSS-Variablen/Dark-Mode geprüft), `vercel.json`, `package.json` | vollständig |
| Root-API | `api/auth.js`, `api/_validate.js`, `api/_ratelimit.js`, `api/generate.js`, `api/reviews.js`, `api/pdf.js` (288 Z.) | vollständig |
| temoa-os lib | `sov/calculations.js`, `sov/runSOV.js`, `sov/sovApi.js`, `sov/reportJSON.js`, `listing/buildPrompt.js`, `listing/byteEnforcement.js`, `listing/csvKeywords.js`, `listing/extractSection.js`, `listing/filterKeywordsApi.js`, `listing/generateSectionApi.js`, `listing/highlighting.js`, `listing/reviewInsightsApi.js`, `campaign/campaignBuilder.js`, `campaign/excelExport.js`, `reporting/kpis.js`, `reporting/format.js`, `reporting/campaignClassifier.js`, `reporting/sqrBenchmark.js`, 6 Parser, `auth/authedFetch.js`, `supabase.js` | vollständig |
| temoa-os Stores | `useListingStore.js`, `useSOVStore.js`, `useSetupStore.js`, `useReportingStore.js` | vollständig |
| temoa-os API | `api/_auth.js`, `api/_ratelimit.js`, `api/generate.js`, `api/reviews.js` | vollständig |
| temoa-os Pages | `App.jsx`, `main.jsx`, `Shell.jsx`, `AuthGuard.jsx`, `ErrorBoundary.jsx`, `SignIn.jsx`, `SOV/index.jsx` (727 Z.), `Campaign/Wizard.jsx` (623 Z.), `Campaign/Dashboard.jsx`, `ListingGenerator/*` (8 Dateien), `Reporting/*` (6 Dateien), `index.html`, `vercel.json`, `vite.config.js`, `.env.example`, `package.json`, `global.css` (Kern-Tokens) | vollständig |
| apps/reporting (standalone) | `src/lib/**` per `diff -r` **byte-identisch** zu `temoa-os/src/lib/reporting/`; Pages/Store per diff = gleiche Logik minus Recharts-Charts und mit `/upload`- statt `/reporting/upload`-Routen; `App.jsx`, `main.jsx`, `Shell.jsx`, `ErrorBoundary.jsx`, `index.html`, `vercel.json`, `vite.config.js`, `package.json` gelesen | vollständig (via diff + Lektüre) |
| apps/campaign (standalone) | `campaignBuilder.js`/`excelExport.js`/`useSetupStore.js` per diff (Abweichungen dokumentiert, §5.2); `SetupWizard.jsx` per diff = englische UI-Texte, ohne Gebotsstrategie/Platzierungs-/Brand-Defense-Felder, `-AUTO` statt `-AUT`; `App.jsx`, `LoginOverlay.jsx`, `Dashboard.jsx`, `Shell.jsx`, `api/_validate.js`+`api/auth.js` (≈ Root-API, nur Kommentare fehlen), Configs gelesen | vollständig (via diff + Lektüre) |
| Assets/Locks | `package-lock.json` ×3, Logos/PNGs, `.gitignore` ×3 | nicht inhaltsrelevant, registriert |

**Nicht zeilenweise gelesen** (bewusst): die drei `package-lock.json`, Binär-Assets, sowie die vollen 344/674/567/326 Zeilen CSS (nur Design-Tokens und Dark-Mode-Mechanik extrahiert — keine Geschäftslogik in CSS).

---

## 2. SOV-Calculator / „Amazon Growth Briefing" — Formelwerk KOMPLETT

Kanonische Implementierungen: `source/script.js:1408–2216` (Root-App) und `apps/temoa-os/src/lib/sov/calculations.js` + `runSOV.js` (Temoa OS). Die Formeln sind in beiden identisch; Abweichungen siehe §5.1.

### 2.1 CSV-Einlese-Vertrag (Helium10 Cerebro)

- Spalten-Lookup case-insensitiv per `includes()`: `Keyword Phrase` (Pflicht, sonst Abbruch), `Search Volume`, `Position (Rank)`, `Keyword Sales`, `CPR`, `Ranking Competitors` (`script.js:1587–1596`, `runSOV.js:118–127`).
- Wettbewerber-Spalten = alle Header, die dem ASIN-Regex `^B[A-Z0-9]{9}$` entsprechen (`script.js:1598–1601`, `runSOV.js:107,129`).
- `parseRank()`: `""`, `"-"`, `"0"`, NaN, ≤0 → **0 = NICHT gerankt** (nie Position null) (`script.js:1411–1416`).
- Zeilenfilter (Pass 1, `script.js:1606–1621`): Zeile fliegt raus, wenn (a) Keyword leer oder SV ≤ 0, oder (b) weder Haupt-ASIN noch irgendein Wettbewerber rankt.
- `cpr = parseNum(cols[cprIdx]) || 999` → fehlender CPR wird als 999 (Sentinel „kein Wert") geführt; nur `0 < cpr < 999` fließt in die Perzentil-Basis `allCPRs`.
- `WEEKLY_TO_MONTHLY = 4.36` (`script.js:121`, `calculations.js:2`). Cerebro **Keyword Sales ist wöchentlich**, Search Volume ist **bereits monatlich** (CLAUDE.md §6, Z. 199–204).

### 2.2 Rank-Weight-Kurve `vw(rank)` — nur für SOV-Balken (`script.js:1424–1435`)

| Rang | Gewicht |
|---|---|
| unranked/0 | 0.00 |
| 1 | 1.00 |
| 2 | 0.65 |
| 3 | 0.45 |
| 4–5 | 0.30 |
| 6–10 | 0.15 |
| 11–20 | 0.06 |
| 21–50 | 0.015 |
| 51–100 | 0.005 |
| >100 | 0.001 |

### 2.3 SERP-1-Umsatzverteilung `rankShare(rank)` — für Positions-Umsatzlücke (`script.js:1438–1450`)

| Rang | Share |
|---|---|
| unranked | 0 |
| 1 | 0.300 |
| 2 | 0.210 |
| 3 | 0.125 |
| 4 | 0.090 |
| 5 | 0.075 |
| 6–10 | 0.020 (je, = 10 %/5) |
| 11–20 | 0.007 (je, = 7 %/10) |
| 21–50 | 0.001 |
| 51–100 | 0.0005 |
| >100 | 0.0001 |

„Temoa methodology" laut Code-Kommentar `script.js:1437`.

### 2.4 Keyword-Cluster `clusterKeyword(kw)` (`script.js:1452–1461`) — Regex-Kaskade, erste Übereinstimmung gewinnt

1. `\b(brand|marke|konkurrenz|competitor|alternative|vs\.?)\b` → **Brand Alternatives**
2. `\b(problem|lösung|solution|schmerz|hilfe|gegen|anti)\b` → **Problem / Solution**
3. `\b(wie|how|was ist|what is|anleitung|guide|tutorial|ratgeber|tipp|verwenden|anwenden|einnehmen)\b` → **Usage Intent**
4. `\b(günstig|cheap|angebot|deal|sale|billig|preis|rabatt|discount|kaufen|bestellen)\b` → **Discovery Terms**
5. Umlaute `[äöüß]` ODER dt. Funktionswörter `\b(der|die|das|ein|eine|für|zum|zur|mit|beim|gegen)\b` → **German Category**
6. ≥ 4 Wörter → **Longtail**
7. sonst → **Core Category**

### 2.5 Relevanz-Scores und -Gewichte (`script.js:1463–1469`)

`getRelevanceScore(cluster)`: Core Category = 5, German Category = 4, Problem/Solution = 3, Usage Intent = 3, Longtail = 3, Brand Alternatives = 2, Discovery Terms = 2 (Default 3).
`relevanceWeight(score)`: 5→1.0, 4→0.8, 3→0.6, 2→0.4, 1→0.0 (Default 0.6).
**Achtung:** CLAUDE.md §6 (Z. 194–195) beschreibt eine ältere Cluster-/Gewichtstabelle („Use Case/Occasion=0.6, Brand/Alternative=0.6, Discovery=0.4") — der Code ist maßgeblich.

### 2.6 Gewichtete Sichtbarkeit und SOV

- Pro Keyword: `weightedVis = SV × vw(mainRank) × relWeight` (`script.js:1631–1632`).
- Pro Wettbewerber c: `compWeightedVis[c] = SV × vw(compRank_c) × relWeight`; bester Wettbewerber = höchstes `vw` (`script.js:1634–1645`).
- Keyword-SOV: `kwSOV = weightedVis / (weightedVis + Σ compWeightedVis) × 100`; `topCompKwSOV` analog mit bestem Wettbewerber; beide auf 1 Dezimale gerundet (`script.js:1660–1662,1674–1675`).
- **Brand SOV** (Metrik-Karte): `brandSOV = Σ weightedVis / Σ (weightedVis + alle compWeightedVis) × 100` über alle Keywords (`script.js:1691–1700`).
- `compSOVs[asin]` analog, gerundet auf 1 Dezimale; `topCompSOV`/`topCompASIN` = Maximum; `visibilityGapMetric = max(0, topCompSOV − brandSOV)` (`script.js:1701–1709`).

### 2.7 CPR-Klassifikation `classifyCPR(cpr, sortedCPRs)` — relatives Perzentil im CSV-Set (`script.js:1471–1480`)

- Keine CPR-Daten im CSV → **"Medium"** (blockiert Quick Wins nicht).
- `cpr ≥ 999` (Sentinel) → **"High"**.
- Perzentil `pct = |{c ≤ cpr}| / n`: ≤ 0.33 → **Low**, ≤ 0.66 → **Medium**, sonst **High**.
- CPR ist **kein Gate** für Opportunity-Typen — reine Info + Ease-Faktor im Score. (CPR = 8-Tage-Ranking-Ziel, nie Umsatz-Proxy; CLAUDE.md Z. 233, 259.)

### 2.8 Opportunity-Typen `classifyOpportunity(...)` (`script.js:1482–1488`) — Reihenfolge = Priorität

1. **Strong Position**: `mainRank 1–10` UND (`bestCompRank == 0` ODER `bestCompRank ≥ mainRank`)
2. **Defend / Optimize**: `mainRank 1–10` UND `0 < bestCompRank < mainRank`
3. **Quick Win**: `mainRank 8–25` UND Wettbewerber in Top 10 UND `ks > 0`
4. **Strategic Gap**: (`mainRank > 25` ODER unranked) UND Wettbewerber in Top 20 UND `ks > 0`
5. **Monitor**: alles andere

(Root-Signatur nimmt zusätzlich `cprClass` entgegen, nutzt sie aber nicht; Temoa-OS-Version hat den Parameter entfernt — `calculations.js:72`.)

### 2.9 Revenue-Pool und Positions-Umsatzlücke (`script.js:1650–1657`)

```
ksMonthly  = ks(wöchentlich) × 4.36
kwRevPool  = ksMonthly × price          // price: Eingabefeld, Default 45 €
ownPosRev  = kwRevPool × rankShare(mainRank)
compPosRev = kwRevPool × rankShare(bestCompRank)
fullRevGap = max(0, compPosRev − ownPosRev)
```

### 2.10 Korridore `captureCorridors(gap, type)` (`script.js:1490–1496`)

- `Monitor` → `{low: 0, base: 0, high: 0}`
- alle anderen Typen (standardisierte Raten): `low = round(gap × 0.20)`, `base = round(gap × 0.60)`, `high = round(gap × 0.95)`

### 2.11 Opportunity-Score und Priorität (`script.js:1679–1687`)

Normalisierung über das Dataset (`maxGap`, `maxKS`, `maxSV`, Minimum 1):

```
cprEase  = Low→1.0 | Medium→0.6 | High→0.2
oppScore = (fullRevGap/maxGap)×0.45 + (ks/maxKS)×0.25 + (sv/maxSV)×0.15 + cprEase×0.15
priority = oppScore ≥ 0.6 → "High" | ≥ 0.35 → "Medium" | sonst "Low"
```

### 2.12 Empfohlener Hebel `getRecommendedLever(d)` (`script.js:1498–1513`) — erste Regel gewinnt

| Bedingung | Hebel (DE) |
|---|---|
| Strong Position | „Verteidigen & Conversion optimieren" |
| Cluster = Discovery Terms | „Erst testen, dann skalieren" |
| cprClass High UND Strategic Gap | „Content-Aufbau vor Budget-Einsatz" |
| mainRank 8–25 UND bestCompRank 1–5 | „SEO Titel/Bullets/Backend + selektive PPC" |
| (mainRank > 25 oder 0) UND bestCompRank 1–10 | „Content-Aufbau, Ranking-Tests, dann PPC" |
| mainRank 1–10 UND bestCompRank < mainRank | „Hauptbild, CTR, CVR, Preis, Bewertungen" |
| mainRank 8–25 | „SEO + selektive PPC + Visual/CVR" |
| sonst | „Beobachten — Intent validieren" |

(Root hat EN/DE-Varianten via `uiLang`/`forceDE`; Temoa OS nur Deutsch.)

### 2.13 Coverage-Bänder (`script.js:1711–1719`; `runSOV.js:239–247`)

`ranked` (Rang > 0), `top3Count` (1–3), `top10Count` (1–10), `rank11_20Count`, `rank21_50Count`, `unranked` (= 0); **nur Temoa OS zusätzlich `rank51plusCount` (≥ 51)** — Bugfix 27 Jun 2026.
`rankingCoverage = ranked/total×100`; `top10Coverage = top10Count/total×100`.

### 2.14 Aggregat-Metriken und Listen

- `quickWins` / `strategicGaps`: je Typ gefiltert, nach `oppScore` absteigend, **Top 10** (`script.js:1722–1725`).
- `topDemandGaps`: QW + SG kombiniert, nach `oppScore`, **Top 10** — Basis der Korridor-Summen (`script.js:1726–1727`).
- `totalCorrLow/High` = Σ `corridors.low/high` über topDemandGaps; `totalFullGap` = Σ `fullRevGap` (`script.js:1729–1731`).
- `top2ByKS`: Keywords mit `ks > 0` nach KS absteigend, **Top 2** (Sektion „Top Keywords nach kommerziellem Potenzial") (`script.js:1734`).
- Revenue-Gaps-**Tabelle** (UI): QW+SG, Root nach **KS** sortiert, Top 15 (`script.js:1826–1829`); Temoa OS nach **oppScore**, Top 15 (`SOV/index.jsx:264–266`). PDF-Tabelle: Top 5 nach oppScore.

### 2.15 Die 5 Metrik-Karten

Eigener SOV (`brandSOV`), Top-Wettbewerber-SOV, Potenzial-Korridor `€totalCorrLow–totalCorrHigh`/Mo. (bei 0 „–"), Top-10-Abdeckung (%), Quick Wins (Anzahl) — `script.js:1757–1768`, `SOV/index.jsx:133–156`.

### 2.16 KI-Aufrufe im SOV-Tool

**Maßnahmenplan** (`script.js:1884–1942`; `sovApi.js:275–323`): Modell `claude-sonnet-4-6`, `max_tokens 700`, `temperature 0`. System-Prompt (wörtlich): „Du bist ein erfahrener Amazon-Marketplace-Stratege. Schreibe einen Maßnahmenplan auf Deutsch für einen Vertriebsberater. Tonalität: direkt, klar, kommerziell. Kein generischer Text — nur konkrete Bezüge auf die gelieferten Daten. Keine Markdown-Überschriften." User-Prompt liefert: eigener SOV vs. Top-Wettbewerber (mit Markennamen), QW-/SG-Zählungen mit Definitionen („Rang 8–25, Wettbewerber Top 10" / „nicht gerankt oder Rang >25"), Top-3-QW-Details (Rang, Wettb.-Rang, KS/Wo., CPR-Klasse), Top-2-SGs, Korridor, Hinweis „KS = wöchentliche Keyword Sales, hochgerechnet auf Monatsbasis (×4,36)" — und erzwingt **exakt** diese 3-Hebel-Struktur mit festen Framework-Texten:

1. „Hebel 1: Retail-Readiness & Content-Qualität" — Framework: Titel/Bullets/Backend/Hauptbild/Galerie/A+/Vertrauenssignale; Ziel CTR, CVR, organische Rankingbasis.
2. „Hebel 2: Keyword-, Suchterm- und Kampagnenlücken analysieren" — Framework: systematische Gap-Analyse, stärkster Wettbewerber organisch vs. Paid, Gap-Mapping, Kampagnenstruktur, Competitor-Targeting via Sponsored Products/Product Targeting.
3. „Hebel 3: Selektiv skalieren & Ranking-/Indexierungslücken schließen" — Framework: PPC-Pushes auf Long-Tail/Suchintents/Wettbewerber, erst Indexierungslücken schließen, nicht breit streuen.

Je Hebel: 1–2 Sätze Rahmentext + max. 1 Satz individuelle Datenanmerkung. „Kein Markdown. Klarer, direkter Ton. Indikative Sprache für alle Potenzialangaben."

**Executive Summary** (`script.js:2011–2054`; `sovApi.js:325–358`): `max_tokens 600`, immer **Deutsch** (kundenseitiges PDF). System-Prompt: „senior Amazon marketplace strategist writing an Amazon Growth Briefing … Use ‚indicative potential' or ‚potential range' language, never hard revenue promises. Never mention data tools by name." (Temoa OS zusätzlich: „No markdown headings or formatting — plain prose only" + Nachbearbeitung `raw.replace(/^#[^\n]*\n+/m, '')`, Bugfix 27 Jun.) User-Prompt: 4–6 Sätze Fließtext, Fokus auf Nachfrageverlust an Wettbewerber, Korridor als kommerzielles Kernsignal, wichtigste Maßnahmen; dominanten Wettbewerber und wirksamste QW-Keywords referenzieren; „Never mention Helium10 or tool names"; Ton „confident, diagnostic, direct".

### 2.17 Anti-Error-Sprachregeln (NON-NEGOTIABLE, CLAUDE.md Z. 271–274)

Nie: „revenue loss", „lost revenue", „competitors stealing revenue", exakte Euro-Versprechen.
Immer: „indicative potential", „indicative corridor", „weighted visibility share", „competitors capture demand more effectively", nur Spannen. UI-Interpretationssatz (`sov_interp`): „Die Nachfrage ist vorhanden. Derzeit erfassen Wettbewerber sie effektiver." CTA (`sov_cta`): „In 30 Minuten priorisieren wir die drei Hebel mit dem höchsten kurzfristigen Impact."

### 2.18 JSON-Export → Sales Room (der Export-Vertrag), `script.js:2100–2216`, `reportJSON.js`

Pflicht-Validierung vor Analyse **und** vor Export: eigene Marke (`sov-brand-label`) + **jeder** Wettbewerber-Markenname müssen gefüllt sein (`sovBrandsComplete()`, `script.js:1551–1567`; leere Felder rot `#e11d48`; deutsche Alerts „Bitte zuerst ALLE Markennamen ausfüllen…" / „Export blockiert: Es fehlen Markennamen…").

Schema `version: "1.0"` — Dateiname `sov-report-YYYY-MM-DD.json` (Temoa OS: `temoa-sov-report-YYYY-MM-DD.json`):

```
meta:    brandLabel, ownAsin, marketplace (Default "DE"), price (Default 45),
         totalKeywords, competitorCount, competitorBrands {ASIN→Marke},
         weeklyToMonthlyFactor: 4.36,
         notes: "ksWeekly = raw Cerebro Keyword Sales (weekly). ksMonthly = ksWeekly × 4.36.
                 kwRevPool/corridors/gaps are monthly estimates. SV (Search Volume) is already monthly."
metrics: brandSOV, topCompSOV, topCompASIN, visibilityGapMetric, rankingCoverage,
         top10Coverage, quickWinCount, totalCorrLow, totalCorrHigh, totalFullGap
sovBars: [{label, sov, isOwn, brand}] — eigene Bar zuerst (label = brandLabel||ownAsin||"Own ASIN");
         Wettbewerber-Bars: label = ASIN (Sales Room scraped Bilder per ASIN), brand = compLabels[asin]||null
coverage: {total, ranked, top3, top10, rank11_20, rank21_50, unranked}   // KEIN 51+-Feld im Export
top2ByKS, quickWins, strategicGaps: slim()-Arrays
revenueGaps: QW+SG nach oppScore, Top 15, slim()
allKeywords: gesamtes Dataset nach oppScore absteigend, slim()
actionPlan: innerText der (editierbaren) Maßnahmenplan-Box oder undefined
```

`slim(k)`-Felder pro Keyword: `kw, cluster, sv, ksWeekly, ksMonthly, cpr, cprClass, mainRank, bestCompRank, kwSOV, topCompKwSOV, kwRevPool, ownPosRev, compPosRev, fullRevGap, corridors{low,base,high}, opportunityType, priority, recommendedLever, oppScore`.

### 2.19 PDF-Export (Client, print-to-PDF)

`downloadPDF()` (`script.js:2218–2449`; Temoa OS `SOV/index.jsx:389–610`): `window.open` + inline HTML/CSS + `print()` nach 800 ms. Immer Deutsch. Aufbau: Navy-Header „Amazon Growth Briefing / Competitive Visibility & Demand Gap Analysis" mit Ø Preis, Keyword-/Wettbewerber-Anzahl, Datum, temoa-Logo („Amazon Growth Partner") → Exec-Summary-Block (Fallback-Text falls keine KI-Summary: „Eigener Sichtbarkeitsanteil: X% — stärkster Wettbewerber (Y): Z%. …") → 3 Karten (Share of Voice mit „Lücke: +X% zugunsten Wettbewerb."; Ranking-Abdeckung; Indikat. Potenzial mit „Indikative Schätzung — keine Prognose.") → Sektion 1 SOV-Balken + Coverage-Balken (Temoa OS inkl. 51+-Band) + Top-2-Keywords → Sektion 2 Gap-Tabelle Top 5 (Spalten: Keyword, KS (Wo.), Rang, Wettb., Typ [Quick Win grün / „Strat. Lücke" orange], CPR [Niedrig/Mittel/Hoch], Korridor/Mo.) + Hinweisbox „KS = wöchentliche Keyword Sales (Cerebro). Umsatzpool = KS × 4,36 (Monatsfaktor) × Preis. Korridor = indikative monatliche Schätzung — keine Umsatzprognose." → Sektion 3 Quick-Win-Karten (Top 3) + Maßnahmenplan-Text → CTA „Nächster Schritt: Kostenlose Potenzialanalyse … Jetzt Termin buchen →" → Footer „© 2026 Temoa GmbH · Vertraulich". Farben: Navy #1B3A5C, Orange #F5A623, Rot #D93025, Grün #10B981.

### 2.20 UI-Struktur SOV (Root)

Kein Tab-System mehr — 3 scrollbare Sektionen (`index.html:869–941`): „1 — Share of Voice & Coverage" (`sov-bars`, `top2-keywords`, `coverage-breakdown`), „2 — Indicative Revenue Gaps" (`revgap-thead/tbody`, 9 Spalten: Keyword, KS (Wo.), Umsatzpool (Mo.), Eigener Rang, Wettb. Rang, Volle Lücke, Korridor (Niedrig–Hoch), CPR, Priorität), „3 — Quick Wins & Action Plan" (`qw-cards` Top 3 + contenteditable `action-plan-box`). `exec-summary-box` ist `display:none` — nur PDF-Quelle. **`renderGrowthBriefing()` (`script.js:1965–2009`) ist toter Code**: Ziel-Element `briefing-content` existiert nicht im Markup; ebenso ungenutzt bleiben die `sov_tab_*`-/Briefing-UI-Strings und `showSOVTab()`.

---

## 3. buildPrompt (Listing Generator) — Volltext-Detail

Identisch in Root (`source/script.js:881–939`, DOM-basiert) und Temoa OS (`apps/temoa-os/src/lib/listing/buildPrompt.js:480–527`, parametrisiert). Prompt-Gerüst (wörtliche Regeln):

**Kopf:** „You are an Amazon listing expert and senior SEO copywriter for Temoa." + `BRAND:`/`PRODUCT:`/`MARKET: ${lang}` + optional `PRODUCT DETAILS:` + optional `BRAND TONE:` + `KEYWORDS:` (aktiver Pool zeilenweise; Fallback Paste-Box).

**KEYWORD LANGUAGE:** Keywords ggf. anderssprachig — „use the natural ${lang} translation or equivalent of each keyword — never copy foreign-language words verbatim into visible copy. Exception: internationally recognised brand names or technical terms with no clean translation."

**KEYWORD STRATEGY** (mentale Tierung vor dem Schreiben):
- PRIMARY (Top 3–4 nach SV+Relevanz) → müssen in den Titel
- SECONDARY (nächste 8–12 nach Relevanz) → 2–3 je Bullet, natürlich eingewoben
- TERTIARY (übrige relevante) → Description mit anderer Formulierung als Titel/Bullets
- LONG-TAIL/BACKEND → alles Unplatzierte in Backend Search Terms

**Slots:** `ALREADY APPROVED SECTIONS (for context only — do not regenerate):` mit `[KEY — APPROVED]`-Blöcken; `CUSTOMER PAIN POINTS (from 1–4★ reviews — address at least 2–3 in your copy):` als Bullet-Liste, nur wenn Pain Points selektiert.

**NON-NEGOTIABLES:**
1. COPY LANGUAGE: alles in ${lang}, keine Ausnahmen.
2. ANNOTATION LANGUAGE: Byte-Counts/Flags/Consultant-Notes auf Englisch.
3. SUGGESTION LANGUAGE: Padding-Vorschläge in ${lang}.
4. „BYTE LIMITS ARE FIRM TARGETS — write, count precisely, adjust, repeat until exact, but do this silently. Never show draft attempts, recounts, or commentary like ‚let me adjust' … output ONLY the final, correct section."

**SECTION RULES (wörtlich zusammengefasst):**
- **TITLE:** exakt 200 Zeichen (jedes Zeichen zählt, inkl. Spaces/Hyphen/Kommas); unter 200 → Phrase erweitern/Keyword anhängen, über 200 → kürzen; Struktur „BRAND – MAIN KEYWORD – benefit – keywords"; erste 80 Zeichen mobile-kritisch, Primär-Keywords vorn; 3–4 distinkte Keywords insgesamt; kein exaktes Keyword öfter als 2× im Titel; danach `[TITLE: X/200 characters]`.
- **BULLETS:** 5 Stück; ALL-CAPS-Heading + Normalsatz-Body; 250–300 Bytes je Bullet; 2–3 distinkte Keywords je Bullet, natürlich; kein exaktes Keyword 2× im selben Bullet; **KEYWORD CAP: max. 2× je Keyword im gesamten sichtbaren Listing (Titel + alle 5 Bullets)** — Description/Backend dürfen wiederverwenden. Slot-Zwecke: B1 = Stop attention (Hook, Primär-Keyword vorn) · B2 = Problem + Features→Benefits · B3 = Trust (Qualität/Material/Zertifikate/Tests/Awards, kein Marketing-Fluff) · B4 = Usage (Kompatibilität, Lieferumfang, Größe/Format, Zielgruppe) · B5 = Close (Garantie, Risk-Reversal, Differenzierer). Keine Titel-Phrasen wiederholen. Danach `[BULLETS: B1=X B2=X B3=X B4=X B5=X bytes]`.
- **BACKEND KEYWORDS:** max. 249 Bytes, hart; unsichtbar → Rechtschreibvarianten, Misspellings, hoch-SV-Englisch-Terme, Synonyme, die nicht in Titel/Bullets sind; **nur Einzelwörter** (Phrasen zerlegen); keine Duplikate; keine Kommas; Space-separiert; `[BACKEND: X bytes]`.
- **DESCRIPTION:** max. 1.999 Bytes; „Conversion-focused, Rufus/Cosmo/GEO optimised"; Tertiär-Keywords mit neuer Formulierung, neue Information statt Wiederholung; `[DESCRIPTION: ~X bytes]`.
- **Q&A:** 5 Paare; Frage max. 110 Zeichen, Antwort max. 230 Zeichen; `[Q: X / A: X chars]` je Paar.
- **GENERAL RULE:** jede Sektion liefert neuen Wert; keine Sektion wiederholt eine andere mit denselben Wörtern/Phrasen.

**Sequenzieller Ablauf:** `SECTION_ORDER` full = title→bullets→backend→description→qa; Modi `title_bullets`, `description`, `backend`. Pro Sektion eigener API-Call: `buildBasePrompt() + "\n\n" + SECTION_INSTR[key]` („Generate ONLY the [X] section. Use [X] as the header. Nothing else."), Modell `claude-sonnet-4-6`, `max_tokens 1000`, System-Prompt „professional Amazon listing copywriter … Output only the requested section with its header — no preamble … silent recount" (`script.js:1044–1053`, `generateSectionApi.js:817–822`). Pipeline danach: `extractSection` (Header-Varianten `[TITLE]`/`# TITLE`/`## TITLE` …) → `stripClaudeAnnotation` (entfernt `[TITLE…]`-Tags, `[Q:|F:|A:…]`, `[B1=… bytes]`, Markdown-Headings, `CONSULTANT FLAG:`-Rest, `**`) → `cleanContent` (Label-Regexes) → `enforceByteLimit`.

**Titel-Auto-Expand:** Ergebnis < 190 Zeichen → zweiter Call (`max_tokens 300`): „This Amazon listing title is X/200 characters and must reach exactly 200. It needs N more characters. … Keep all existing words intact. Output ONLY the final title"; Ergebnis `.slice(0,200)`, nur übernommen wenn länger (`script.js:1059–1078`, `generateSectionApi.js:829–844`).

**Byte-Annotation-Ampel** (`renderByteAnnotation`/`getByteAnnotation`): Titel ok 190–200, warn ≥ 175, sonst err; Bullet ok 250–300 B, warn 220–330 B, sonst err; Backend ok ≤ 249 B; Description ok ≤ 1.999 B, warn ≤ 2.100 B; Q ok ≤ 110, A ok ≤ 230 Zeichen. Temoa OS erkennt Q auch als `F:` (dt. „Frage", Fix 2 Jul; `byteEnforcement.js:615`) — Root nur `Q\d*:`.

**Client-seitige Byte-Härtung** (`enforceByteLimit`): Backend wortweise bis 249 B (inkl. 1 B Space-Gap); Bullets zeilenweise wortweise auf ≤ 300 B gekappt; Description am letzten Satzende `". "` unter 1.999 B getrimmt (Fallback wortweise). UTF-8 via `TextEncoder` (Umlaute = 2 Bytes) — Claude kann Bytes nicht zuverlässig zählen, Enforcement immer client-seitig (CLAUDE.md Z. 133).

**Keyword-/Pain-Point-Highlighting:** volle Phrasen + Einzelwörter ≥ 4 Zeichen aus Mehrwort-Keywords (deutsche Flexionsformen), längste zuerst, `<mark class="kw-highlight">`; Pain-Point-Wörter > 3 Zeichen minus DE-Stoppwortliste, nur außerhalb bestehender `<mark>`, `<mark class="pp-highlight">`.

**PDF-Dokumente (nur Temoa OS + Root-Upload):** Base64-PDFs als `type:"document"`-Blöcke vor dem Text-Prompt; Prompt-Zusatz „ADDITIONAL DOCUMENTS: PDF files are attached above …" (`generateSectionApi.js:800–815`).

---

## 4. Parser-Spaltenverträge je Berichtstyp (Reporting)

Standalone `apps/reporting/src/lib/**` und `apps/temoa-os/src/lib/reporting/**` sind **byte-identisch** (diff leer). Upload-Definitionen: `apps/temoa-os/src/pages/Reporting/Upload.jsx:10–17`.

| Key | Titel (UI) | Quelle (UI-Hinweis) | Format |
|---|---|---|---|
| business | Business Report | Seller Central → Berichte → Unternehmensberichte | CSV |
| sqr | Suchanfragenleistung (SQR) | Advertising → Brand Metrics → Markenansicht | CSV |
| budget | Budget / Kampagnen | Advertising Console → Kampagnen → Export | CSV |
| placements | Placements | Advertising Console → Berichte → Platzierungen | XLSX |
| audience | Zielgruppen (Audience) | Advertising Console → Berichte → Zielgruppen | XLSX |
| searchTerm | Search Term Report | Advertising Console → Berichte → Suchbegriffe | XLSX („Parser in Beta — bitte prüfen") |

### 4.1 parseBusinessReport (CSV, PapaParse header:true)
Zahlformate: Integers US-Style (Komma-Tausender via `parseIntField`), Umsatz **deutsch** via `parseGermanNumber` („5.255,61 €" → 5255.61). Spalten (mit Fallback-Kette):
- `sessions`: `Sitzungen – Summe` | `Sessions` | `Sitzungen`
- `pageViews`: `Seitenaufrufe – Summe` | `Seitenaufrufe`
- `orderedUnits`: `Bestellte Einheiten` | `Bestellungen (bestellte Artikel)` | `Bestellungen (gekaufte Artikel)`
- `orderedRevenue`: `Durch bestellte Produkte erzielter Umsatz` | `Verkäufe (bestellte Artikel)` | `Verkäufe (gekaufte Artikel)`
- `asin`: `(Untergeordnete) ASIN` | `ASIN`; `parentAsin`: `(Übergeordnete) ASIN`; `title`: `Titel` | `Produktname`
- Filter: nur Zeilen mit ASIN.

### 4.2 parseSQR (CSV) — Zeile 1 ist **Metadaten**, nicht Header
- Meta-Extraktion aus Zeile 1: `Marke=\["([^"]+)"\]` → brand; `Woche (\d+) \| (\d-…) - (\d-…)` → week/dateFrom/dateTo (setzt `currentWeekLabel` = „KW{week} {Jahr}").
- Zahlen **dot-decimal** via `parseSQRNum` — `parseGermanNumber` würde „3.17" zu 317 korrumpieren (Kommentar im Code).
- Spalten (beide Varianten mit/ohne Doppelpunkt): `Suchabfrage`; `Volumen der Suchabfrage`; `Eindrücke: Markenanteil %`/`Eindrücke Markenanteil %`; `Klicks: Markenanteil %`; `Käufe: Markenanteil %` — Shares werden /100 als Ratio gespeichert (`impressionShare`, `clickShare`, `purchaseShare`).
- SQR-Benchmark: `ratio = purchaseShare/clickShare`; ≥ 1.0 Strong, 0.8–1.0 OK, 0.6–0.8 Weak, < 0.6 Poor (`sqrBenchmark.js`).

### 4.3 parseBudget (CSV) — liefert die „campaigns" für alle KPI-Berechnungen
- Encoding-Erkennung: Buffer erst UTF-8; enthält Text `в‚¬`/`Г¤`/`Гј` (Windows-1252-Mojibake des €-Zeichens) → Re-Decode als windows-1252 (`parseBudget.js:14–24`).
- Zahlen US-/dot-Format via `parseUSNum` (strippt `€$ ,%`).
- Spalten: `name`: `Kampagnen-Name` | `Kampagnenname` | `Campaign Name`; `status` (lowercase); `budget`: `Budget` | `Tagesbudget`; `spend`: `Ausgaben` | `Spend`; `sales`: `7 Tage, Umsatz gesamt (€)` | `Verkäufe` | `Sales`; `impressions`; `clicks`; `orders`: `7 Tage, Aufträge gesamt (#)` | `Bestellungen` | `Orders`; `acos`: `Zugeschriebene Umsatzkosten (ACOS) gesamt` als Prozentstring („20.022%") → /100 als Ratio.

### 4.4 parsePlacements (XLSX, SheetJS)
- `xlsxNum`: JS-Zahlen direkt durchreichen (parseGermanNumber würde 21.73 → 2173 korrumpieren); leere/NaN → null.
- Spalten: `campaign`: `Kampagnen-Name` | `Kampagne` | `Campaign`; `placement` normalisiert (`Platzierung`|`Placement`: enthält „top/obers"→`top`, „produkt/product page"→`productpage`, „rest/other"→`rest`, sonst `other`); `Impressionen`/`Klicks`/`Ausgaben`; `sales`: `7 Tage, Umsatz gesamt (€)` | `Verkäufe`; `orders`: `7 Tage, Aufträge gesamt (#)` | `Bestellungen`; `acos`: **`Zugeschriebene Umsatzkosten (ACOS) gesamt ` mit trailing Space** UND Variante ohne (reales XLSX hat den Space!) — bereits Ratio, kein /100; `roas`: `Gesamte Rentabilität der Anzeigenkosten (ROAS)` — Multiplikator.
- `PLACEMENT_LABELS`: top=„Oberste Suchergebnisse", productpage=„Produktseiten", rest=„Restliche Suchergebnisse", other=„Sonstige".

### 4.5 parseAudience (XLSX)
Spalten: `Kampagnen-Name`|`Kampagne`|`Campaign`; `audience`: `Name der Zielgruppe`|`Zielgruppe`|`Audience`; Impressionen/Klicks/Ausgaben/Verkäufe/Bestellungen; ACoS im Audience-Report **nicht vorhanden** → null; ROAS plain number.

### 4.6 parseSearchTerm (XLSX) — **STUB**, nie gegen echte Datei validiert (Code-Kommentar + CLAUDE.md Z. 365–366)
Erwartete Spalten: `Kampagne`, `Anzeigengruppe`, `Ausgeliefertes Keyword`|`Ausgelieferter Ausdruck`, `Übereinstimmungstyp`, `Kundensuche`, `Impressionen`, `Klicks`, `Ausgaben`, `Verkäufe`, `Bestellungen`, `ACoS` (deutsch geparst, /100). Nutzt (fragwürdig) `parseGermanNumber` auf XLSX-Zellen.

### 4.7 KPI-Formeln (`kpis.js`) — „13 Master-KPIs"
Aggregation über Budget-Zeilen (impressions, clicks, adSpend=spend, adRevenue=sales, adOrders=orders) + Business-Zeilen (totalRevenue=orderedRevenue, totalOrders=orderedUnits, sessions). Ohne Business-Report: `totalRevenue = adRevenue` (TACoS ≈ ACoS).

```
TACoS = adSpend / totalRevenue     (Ziel ≤ 15 % — KPI_META target, upIsBad)
ACoS  = adSpend / adRevenue
ROAS  = adRevenue / adSpend
CTR   = clicks / impressions
CVR   = adOrders / clicks
CPC   = adSpend / clicks
```
WoW-Delta: `calcDelta(current, previous)` → pct = (cur−prev)/|prev|, dir-Schwelle ±0.001; `deltaClass` invertiert Farben bei `upIsBad` (TACoS, ACoS, CPC). Vorwochen-Snapshot manuell via „Als Vorwoche speichern" (`archiveAsPrevious`), persistiert in localStorage `temoa-reporting-store` (nur previousReports/-Label).

### 4.8 campaignClassifier (Substring, case-insensitiv)
AUTO: `SP-AUT`, `-AUTO` · BRAND: `SP-BRA`, `-BRA-` · GEN_EXACT: `GEN-KW-EXACT` · GEN_RESEARCH: `GEN-KW-Research/RESEARCH`, `GEN-ASIN` · COM_CAT: `(SP-)COM-CAT` · COM_ASIN: `(SP-)COM-ASIN` · sonst OTHER. Charts: ACoS-Ampel > 50 % rot, > 30 % orange, sonst grün; ReferenceLine bei 30 %.

---

## 5. NEU / korrigiert gegenüber der Kern-Analyse

### 5.1 SOV: Root vs. Temoa OS — konkrete Deltas
1. **`rank51plusCount`** existiert nur in Temoa OS (`runSOV.js:244`) — Root-Coverage und JSON-Export kennen kein 51+-Band (Export-`coverage` hat es in **beiden** nicht).
2. `classifyOpportunity` Temoa OS ohne `cprClass`-Parameter (war schon in Root ungenutzt) — funktional identisch.
3. Revenue-Gaps-Tabelle: Root sortiert nach **KS**, Temoa OS nach **oppScore** (§2.14).
4. Exec-Summary Temoa OS strippt führende Markdown-Heading-Zeile (`sovApi.js:357`) + System-Prompt-Zusatz „plain prose only".
5. Temoa OS SOV-Seite triggert Maßnahmenplan **und** Exec Summary automatisch per `useEffect` nach `runSOV` (`SOV/index.jsx:640–653`, Loading-Sentinel `'__loading__'`); Root generiert Exec Summary versteckt beim Rendern (`renderSOV → generateExecSummary`).
6. Temoa OS Marketplace-Dropdown: DE/US/UK/FR (SOV) bzw. DE/US/UK/FR/IT/ES/NL (Campaign-Wizard); Root: freies `sov-marketplace`-Select.
7. **Toter Code in Root:** `renderGrowthBriefing()` (`script.js:1965–2009`) referenziert nicht existentes `#briefing-content`; `showSOVTab()` + `sov_tab_*`-Strings sind Reste des alten Tab-Layouts. Die UI-Strings enthalten außerdem ungenutzte Altbestände: `outreach_body`/`outreach_th` (Kaltakquise-E-Mail-Template mit „€lo–€hi/Monat leaking"-Sprache — verletzt die Anti-Error-Regeln, wird aber nirgends mehr gerendert), `sov_m_grs` („Growth Readiness"), `qw_*`-Karten-Strings.

### 5.2 Campaign Builder: Temoa OS ist weiter als die Standalone-App (diff-belegt)
Nur in `apps/temoa-os/src/lib/campaign/campaignBuilder.js` (nicht in `apps/campaign/`):
- **AUT-Naming:** `${prefix}-AUT` statt `-AUTO` (Fix 1 Jul 2026; Konvention `TE-{country}-{product}-SP-{family}-{targeting}`).
- **`biddingStrategy`** wählbar (Dynamic down only [Default] / up and down / Fixed bid) — Standalone hart „Dynamic bids - down only".
- **`placementAdjustments`**-Toggle: an → Platzierungszeilen `placementTop +15 %`, `placementProductPage +15 %`, `placementRestOfSearch +10 %`; aus → keine Gebotsanpassungs-Zeilen.
- **`applyBrandSurcharge(bid, %)`**: BRA-KW-EXACT-Gebot = `round2(maxCpc×0.6 × (1+s/100))`, BRA-ASIN = `round2(maxCpc×0.5 × (1+s/100))` — optionaler Markenverteidigungs-Aufschlag 0–200 %.
- Vollständige Bid-Multiplikatoren (beide Versionen): `maxCpc = round2(Price × ACoS% × CVR%)`, Fallback 0.50 €; AUTO/GEN-KW-EXACT/COM-KW-EXACT = maxCpc; GEN-KW-PHRASE/COM-CAT/COM-ASIN = ×0.75; BRA-KW-EXACT = ×0.6; BRA-ASIN = ×0.5. Budgets: AUTO 15 €, GEN/COM 10 €, BRA 8 €/Tag.
- Negativierung: AUTO erhält (im Full-Modus) alle Generic-Exact-Keywords als negativeExact + Markenname negativeExact + eigene & Wettbewerber-ASINs als negatives Produkt-Targeting; COM-CAT: Marken-Negativ + ASIN-Negative; GEN-KW-PHRASE: Cross-Negation der Generic-Exact-Keywords. Launch-Modus = nur AUTO + COM-CAT (Warnung, wenn keine Kategorie-IDs, Regex `^\d{5,}$`).
- Excel-Export (`excelExport.js`, identisch in beiden Apps): Sheet „Sponsored Products-Kampagnen", 52 deutsche Header exakt in Amazon-Bulk-Reihenfolge, Zeilen-Entitäten Kampagne → Gebotsanpassung(en) → Anzeigengruppe → Produktanzeige (nur mit SKU) → Keyword → Negatives Keyword → Produkt-Targeting → Negatives Produkt-Targeting; Operation immer `Create`, Zustand `enabled`, Startdatum `YYYYMMDD` heute; Dateiname `TE-{marketplace}-{nameSlug}-SP-{YYYY-MM-DD}.xlsx`.
- Wizard-Extras (Temoa OS): „Auch als Phrase Match hinzufügen"-Checkbox (nur Generic/Use-Case+Exact; dupliziert Keywords als Phrase, Cross-Negation automatisch), Auto-Befüllung der eigenen ASIN als Own-ASIN-Target, Kategorie-Paste, Lösch-Bestätigung im Dashboard. Setups persistiert in localStorage `temoa-campaign-store` (nur `setups`).

### 5.3 Zwei verschiedene `/api/reviews`-Implementierungen
- **Root** (`api/reviews.js`): `run-sync-get-dataset-items?timeout=240` (ein Call), `maxDuration 300`; Rating-Parsing deutsch „5,0 von 5 Sternen" via `/^(\d+)[,.](\d)/` → Dezimalwert; Feld heißt **`body`**; ASIN-Normalisierung (trim/upper, cap 6, invalid werden still gefiltert); Mindestlänge body > 10.
- **Temoa OS** (`apps/temoa-os/api/reviews.js`): zweistufig `runs?waitForFinish=300` → `datasets/{id}/items?limit=600`; Rating nur erste Ziffer `/^(\d)/`; Feld heißt **`text`** (`text||reviewBody`); harte 400 bei > 6 oder ungültigen ASINs (listet sie auf). Client `reviewInsightsApi.js` erwartet dementsprechend `r.text`.
- Beide: 1–4★-Filter serverseitig; Actor `axesso_data~amazon-reviews-scraper`, `domainCode 'de'`, `maxPages 10`, `reviewerType all_reviews`; Rate-Limit 3 Req/60 s.

### 5.4 Auth-/Security-Architektur im Detail
- **Root-App:** Passwort-Login → `/api/auth` vergleicht `password !== APP_PASSWORD` (Plain-Compare beim Login) und gibt **deterministischen** Token `HMAC-SHA256(APP_PASSWORD, APP_SECRET)` zurück; Client speichert 7 Tage in localStorage (`temoa_token`/`temoa_token_expiry`). `isAuthenticated()` prüft Bearer-Token per `timingSafeEqual`; fehlende Env-Vars → alles blockiert („block all requests rather than open the door"). CORS strikt auf `ALLOWED_ORIGIN` (500 wenn nicht gesetzt).
- **Root `/api/generate` Härtung:** Modell-Whitelist `['claude-sonnet-4-6','claude-haiku-4-5-20251001']` (Fallback sonnet), `MAX_TOKENS_CAP 4000`, `system` ≤ 50.000 Z., Message-Content ≤ 100.000 Z., max. 20 Messages, **Content wird zu String gezwungen** → Root-API kann keine PDF-Dokument-Blöcke durchreichen (nur Temoa OS-API kann `document`-Blöcke, whitelisted auf `type:'text'|'document'/base64`).
- **Temoa OS:** Supabase-JWT; `requireAuth()` verifiziert serverseitig via `supabaseAdmin.auth.getUser(token)` (Service-Role-Key); `AuthGuard`-Layout-Route; `authedFetch()` hängt `Authorization: Bearer <access_token>` an; CORS `ALLOWED_ORIGIN || request.origin` + `Vary: Origin`. Temoa-OS-`generate.js` hat **keine** Längen-Caps für system/content (nur Modell-Whitelist + 4000-Token-Cap).
- **Rate-Limits** (Upstash sliding window, IP-basiert via `x-forwarded-for`, Fail-Open ohne Env-Vars): generate 30 Req/60 s, reviews 3 Req/60 s; Redis-Prefixe `temoa:gen`/`temoa:rev` (Root) vs. `temoa-os:generate`/`temoa-os:reviews`; X-RateLimit-Header gesetzt, 429 bei Überschreitung.
- **Standalone campaign-App** hat eigene Kopie von `_validate.js`/`auth.js` (identisch minus Kommentare), Session-Key `temoa_cm_session` (JSON mit token+expiry, 7 Tage). Standalone reporting-App hat **gar keine Auth** (rein clientseitig, keine API).

### 5.5 `api/pdf.js` — reserviert/ungenutzt, aber vollständig implementiert
PDFKit-Handler (POST, `req.body` = Analysedaten) rendert ein **A4 „Amazon Market Gap Audit"** — das ist die **ältere Generation** des SOV-Reports mit inzwischen entferntem Vokabular: Growth Readiness Score `d.grs.score/100` (Farbe ≥ 75 grün, ≥ 40 orange, sonst rot; Default-Label „Starke Sichtbarkeitslücke"), Karte „Revenue Opportunity ca. €{round(totalLeak/1000)}k/Monat", Opportunity-Tabelle mit **QW-Score /100** (≥ 70 grün, ≥ 55 orange) und `revOpportunity €/Mo.`, fixe 3 Maßnahmen (01 Retail Readiness & Content, 02 Visuelle Differenzierung, 03 PPC Aktivierung), SOV-Balken Top 7, Footer „Analysebasis: Helium 10 Cerebro … Revenue Opportunity = indikative Potenzialschätzung, keine Umsatzprognose." Wird von keinem Frontend aufgerufen (CLAUDE.md Z. 50: „reserved, currently unused"); Felder `grs`, `qwScore`, `totalLeak`, `revOpportunity` existieren im aktuellen Datenmodell nicht mehr. `pdfkit` ist deswegen Root-Dependency (`package.json`).
- Ebenfalls Altbestand: Metrik-Label `sov_m_leak: "Indikat. Potenzial"` und `sov_m_grs` in den UI-Strings.

### 5.6 CLAUDE.md (root, v7.3) — vollständige Faktenlage (es gibt **kein** separates apps/temoa-os/CLAUDE.md)
- **9-Tab-Roadmap:** Tab 4 Flatfile/Content Automation (not started; blockiert auf Beispiel-Flatfiles + Top-Rejection-Gründe; Pflichtfelder als editierbare JSON-Config je Kategorie, später Amazon Product Type Definitions; LG-Output soll Felder vorbefüllen) · Tab 8 Quote & Contract Automation (blockiert auf anwaltlich geprüftes Template; nur Form-Fill+PDF) · Tab 1b Agency Alerts (Wave 2, API-Polling) · Tab 1+2 Cockpit + Inventory Planning (Wave 3) · Tab 3 Review Monitoring intern (Wave 3) · Tab 7 Competitive Audit intern (Wave 3). Bestehende Tools = Tab 5, 6, 9 + SOV-Komponente. Prinzip: kein Greenfield; SOV-Logik lebt einmal und wird in Reporting + künftigem Competitive Audit gesurfaced.
- **Import-First, API-Ready:** alle Tabs von CSV/Excel-Import gespeist; Datenquelle austauschbar halten (Import-Adapter heute, API-Adapter später, keine UI-Änderung); deshalb Parser getrennt von Pages.
- **Kein i18n in Temoa OS:** englische Chrome/deutsche Outputs by design; das ~850-Key-EN/DE-System der Root-App wurde bewusst nicht portiert — „Do not re-implement it."
- **Cerebro-Spaltenglossar** (19 Spalten, Z. 225–247) inkl.: Relative Rank (alle 5 Wettbewerber besser → 6), Competitor Rank Average **exkludiert** Nicht-Ranker, Ranking Competitors Count. + 10 Interpretationsregeln (Z. 249–260).
- **Offene Fragen an Christoph:** exakte CPC-Formel + Default-CVR; Reporting-„Golden Test" (erwartete ACoS/TACoS für Beispieldatei); COGS-Lieferformat; TACoS-Definition (Annahme: total ad spend ÷ total revenue) — Bestätigung ausstehend; Term-Promotion-Schwelle (1–2 Käufe?).
- **Deferred:** mehrere Ad-Groups je Kampagne; Browse-Node-Tree-Suche; Brand-Defense-Fixed-Bid-Semantik (Aufschlag inzwischen gebaut, s. §5.2 — flat replacement noch offen); Term-Harvesting/dynamische Negation (Wave 2); SB/SD (Soll-Split SP 85 %/SB 10 %/SD 5 %).
- **Code Editing Protocol:** Read before editing; Grep callers; Research before editing. Arbeitsprinzipien: Deutsch immer primärer Output-Benchmark; Mensch prüft final (Tool 80 %); „Never ship something that would embarrass Christoph"; PDF/kundenseitig immer Deutsch; CLAUDE.md nach jeder Session aktualisieren.
- **Session-Log** bis 2 Jul 2026 (Merge `feat/temoa-os` → `main`, Produktion; Sentry aktiv; Supabase-Invites pending).

### 5.7 README.md vs. HANDOVER.md — zwei verschiedene Dokumente
- `README.md` (v5.0, 2 Jul 2026) = aktueller **Handover** für Temoa OS: Env-Var-Tabelle (10 Variablen inkl. `VITE_SENTRY_DSN` Production-only), Nutzer-Invite-Prozess über Supabase-Dashboard, Kosten „~€0,45 pro Voll-Scrape (600 Reviews × $0.75/1.000)", Tool-Flows, Deploy-Setup (Root-Dir `apps/temoa-os`, Output `dist`, Branch `main`), Kontakte (Miles Pieterse / Christoph Terner; Apify-Konto tools@temoa.de).
- `HANDOVER.md` (v1.0, 25 Mai 2026) = **historisches** technisches Assessment der reinen Root-App vor der Härtung („functional prototype…"): damals ohne Auth/Rate-Limit/CORS-Lock, `generate.js` forwardete `req.body` blind, Claude-Modell noch `claude-sonnet-4-5`. Empfahl die 7 Schritte (Auth → Rate-Limit → generate-Lockdown → CORS → Supabase → Modularisierung → Staging), die danach umgesetzt wurden. Enthält die Ziel-Architektur „temoa-platform" (core/client-profiles, keyword-engine, review-insights, competitor-intel; workflows listing/aplus/brand-story/image-concepts) und die Kernthese „keyword analysis, pain points, competitive data sind per-client, nicht per-workflow".

### 5.8 Weitere neue Detailfunde
- **Keyword-Filter-Kontext:** Der Filter-Call übergibt `The product being listed is: {brand — product}.` als Kontextzeile; System-Prompt-Ausschlusskriterien wörtlich: Competitor/Third-Party-Brands, irrelevant, falsche Suchintention, zu generische Einzelwörter ohne Kaufintention, Zubehör-/Ersatzteil-Terme; Behalten: direkte Produktbeschreibung, Synonyme/Schreibvarianten, hoch-SV-Englisch auch im DE-Markt, klare Kaufintention. Antwortformat strikt `{"excluded":[…],"reason":{…}}`; Fallback bei Parse-Fehler: alle Keywords aktiv.
- **Pain-Point-Extraktion:** max. 300 Reviews, 40.000 Zeichen Cap; Format `[{"label","description"}]`, Label max. 5 Wörter, Output-Sprache im OS aus Listing-Sprache abgeleitet (`lang.startsWith('German')`), in Root aus `uiLang`; „No generic entries like ‚poor quality'". Race-Condition-Schutz im OS via `uploadGenRef`-Generation-Counter (`KeywordCard.jsx:30,35–52`).
- **Root-App-CSV-Parsing** (Listing): naives `split(",")` ohne Quote-Handling; Temoa OS nutzt PapaParse (`csvKeywords.js`). ASIN-Spalten im Keyword-CSV triggern Review-Insights automatisch (cap 6).
- **Root-`clearSEO()`-Bug-Kandidat:** setzt Panels auf `style.display='none'`, während `parseKeywordCSV` sie via `classList.add('show')` wieder öffnet — inkonsistente Show/Hide-Mechanik (`script.js:966–977` vs. 574–577).
- **Design-System:** Navy #1B3A5C, Orange #F5A623, bg #F7F7F5, danger #D93025, success #10B981, Font Plus Jakarta Sans; Dark Mode Root via `data-theme` auf `#app`, Temoa OS auf `<html>` mit Anti-FOUC-Inline-Script, `--navy`→`#93C5FD` überschrieben, Sidebar/Topbar/out-card zurück auf #1B3A5C; localStorage `temoa-theme` + prefers-color-scheme-Default.
- **Routing Temoa OS:** `/sign-in` public; AuthGuard → Shell → `/listing` (Index-Redirect), `/sov`, `/campaign`, `/campaign/new`, `/reporting/{upload,dashboard,campaigns,sqr,placements}` (nested, Tabs disabled bis Daten geladen); alle Pages lazy + Suspense + page-fade; Wildcard → `/listing`. Vercel-Rewrite `/((?!api/).*) → /`.
- **Reporting-Charts (nur Temoa OS/Neu):** Dashboard: TACoS-Herokarte (grün ≤ 15 %), 12 KPI-Karten (KPI_ORDER ohne tacos), „Spend & Sales nach Kampagnentyp"-BarChart (Spend #F5A623, Sales #6366F1), Kampagnen-Tabelle Top 8; Campaigns: horizontales ACoS-Chart Top 10 nach Spend mit 30 %-Referenzlinie + Summenzeile (Gesamt-ACoS = Σspend/Σsales); Placements: Chart + 3 KPI-Karten (ACoS-Badge rot > 30 %) + rowSpan-Tabelle je Kampagne×Platzierung; SQR: Strong-/Weak-/Total-Karten, Filter all/strong(≥1.0)/weak(<0.8), Min-SV-Filter, Sortierung nach Suchvolumen.
- **Standalone-Deploys** (superseded, laufen weiter): campaign → `temoa-tools-beta-campaign-manager.vercel.app` (Passwort-Login), reporting → `temoa-tools-beta-reporting.vercel.app` (ohne Login). Temoa OS: `temoa-os.vercel.app` (kanonisch für alle 4 Tools); Root-App bleibt als Fallback für LG+SOV live.
