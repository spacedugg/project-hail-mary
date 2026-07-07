# sales-room — 100%-Vollextraktion

Quelle: `scratchpad/extracted/a53392b1-salesroommain_5/sales-room-main 5/` (im Folgenden `B/`).
Ergänzt die Kern-Analyse in `docs/SALVAGE.md §3`. Alle Referenzen als `Datei:Zeile` relativ zu `B/`.

---

## 1. Vollständigkeits-Nachweis

Tatsächlicher Bestand: **275 Dateien** (ohne node_modules/.git — die Schätzung „~618" im Auftrag lag zu hoch; gezählt via `find`, davon 35 Binär-Assets).

| Gruppe | Dateien | Abdeckung |
|---|---|---|
| `src/lib/**` | 57 | **vollständig gelesen** (jede Datei: db/{schema,queries,seed,mock,client}, 17 Runtime-Migrationen, alle Presets, pricing/4, questionnaire/3, tracking/3, i18n/9 inkl. de.ts/en.ts, sov-report(+translate), readiness, stage, marketplace, auth, utils, zip, slug, site-url, admin/2, showcase-text) |
| `src/app/admin/**` | 42 | vollständig geprüft (actions.ts, sales-rooms/[id]/{actions,reference-actions,page}, packages, references, case-studies, outreach/8, content/questions/5, analytics/2, team, bulk-translate, login/layout/error/loading/locale-action) |
| `src/app/api/**` | 16 | vollständig geprüft (11 admin-Routen, asin-image, plan-advisor, track+reset, calcom-Webhook) |
| `src/app/` Rest | 8 | vollständig (r/[slug]/{page,funnel-action}, thanks/de+en, internal-mode, layout, page, globals.css) |
| `src/components/sales-room/**` | 37 | vollständig geprüft (Volltext tracker/cal-embed; alle Kernwerte — SoV-Schwellen, Gating, LockedTile, Opt-out, PDP-Maske, Brand-Story-Maße — direkt im Quelltext verifiziert) |
| `src/components/admin/**` | 39 | vollständig geprüft (alle Editoren, Kanban, Engagement, Uploader) |
| `src/components/ui/*` | 10 | **Batch: shadcn-Boilerplate, kein Fachwert** — Stichproben bestätigt; einzige Ausnahme mit Fachwert: `marketplace-flag.tsx` (UK→GB-Alias, 22-Länder-Liste) |
| `drizzle/*.sql` | 11 | vollständig gelesen (0001 ist leer/0 Zeilen) |
| `docs/` | 2 | vollständig (sov-report-export.md, .en.md = EN-Spiegel) |
| Root-Configs | 14 | geprüft (README, .env.example, package.json, next/tailwind/vercel/tsconfig/postcss/eslint/components.json, drizzle.config, .gitignore, .DS_Store) — Fachwert nur in README/.env/package.json/next.config/tailwind/globals |
| Binär-Assets (clients/logos/profiles) | 35 | **Batch: kein Fachwert** (14 Kundenlogos, 5 Brand-Logos + Amazon-SPN-Badge, 12 Team-Fotos, Pillar-Icons) |
| Sonstiges (middleware, theme-provider/-toggle, thanks-Komponente) | 4 | vollständig |

Ohne Fachwert (Batch abgehakt): `src/components/ui/*` (außer marketplace-flag), Loading-Skeletons, locale-action, logout-Route, thanks-Wrapper, theme-provider/-toggle, postcss/eslint/tsconfig/components.json/vercel.json, alle Bilder.

---

## 2. Fachwert-Extraktion nach Themen

### 2.1 Score-System: DREI parallele Bewertungs-Skalen

1. **`computeOverall`** — `src/app/admin/sales-rooms/[id]/actions.ts:26-29`: ungewichtetes arithmetisches Mittel der 6 manuell eingetippten Faktoren (je 0–100, geklemmt via `Math.max(0, Math.min(100, n))`, Z.20-24). Faktoren (Z.53-60): `seoGeoReadiness, productImages, productVideo, aPlusContent, brandStore, brandStory`.
2. **`readinessLabel`** (persistierter Text, 4-stufig) — `[id]/actions.ts:31-36`:
   - ≥85 → „Premium-ready" · ≥70 → „Solide" · ≥50 → „Erhebliches Potenzial ungenutzt" · sonst „Dringender Handlungsbedarf".
3. **`readinessBand`** (live berechnet, 5-stufig) — `src/lib/readiness.ts:17-23`: ≥80 RetailReady · ≥60 Strong · ≥40 Foundation · ≥20 EarlyStage · sonst NeedsWork. Kommentar Z.6-8: „RetailReady" bewusst dem Top-Band vorbehalten, „damit es ein bedeutungsvoller Claim bleibt statt bei Mitte-60 vergeben zu werden".
   Plus 3-stufiger Farb-Token (Z.27-31): ≥80 good, ≥60 ok, sonst bad.

**Kundenseitige Verkaufs-Labels der 5 Bänder** (Schmerz-Dramaturgie, `src/lib/i18n/messages/de.ts:1019-1038`):
„**Verkauft nicht**" → „**Verbrennt Traffic**" → „**Verschenkt Umsatz**" → „**Luft nach oben**" → „**Retail-Ready**", je mit Insight-Headline/Sub (z. B. Foundation: „Assets da, Strategie fehlt — Bilder und Texte sind eingestellt, aber Zielgruppe und Conversion-Architektur sind nicht durchdacht. Genau dort liegt euer Wachstum.").

**Bestseller-Sondermodus** (`schema.ts:577-586`, `de.ts:1039-1043`): `isBestseller`-Flag ersetzt Band-Texte durch positive Botschaft („ihr dominiert eure Nische bereits … **Burggraben** weiter ausbauen"), Score+Balken bleiben. Passendes positives Finding `pos_bestseller` (`findings-presets.ts:569-580`).

### 2.2 Faktor-Legenden (Scoring-Rubrik) — `src/lib/listing-factor-legends.ts`

6 Faktoren, **5–6 Stufen je Faktor** (nicht einheitlich 5!): seoGeoReadiness und productVideo je 5 Bänder; productImages, aPlusContent, brandStore, brandStory je 6. Vollständig zweisprachig. Markante Anker:
- SEO 80–90 %: „Zusätzlich semantische Begriffe für **Rufus/COSMO** integriert, Backend voll ausgeschöpft" (Z.30)
- productImages 100 %: „**Produktbilder von uns**" (Z.38) — die Bestnote ist der eigenen Arbeit vorbehalten
- A+ 90 %: „Premium A+ voll ausgeschöpft inkl. Hotspots, Video-Module, FAQ" (Z.53)
- Brand Store 90 %: „…Sponsored Brands Traffic integriert" (Z.61)
- Vollständige DE-Tabelle → Abschnitt 4.2.

### 2.3 Findings — `src/lib/findings-presets.ts` (625 Z.)

**Exakt 44 Presets**: 31 kritische in 6 Kategorien (Produktbilder 9, Produktvideo 3, A+ 6, Texte & SEO 4, Brand Store 6, Brand Story 3) + **13 positive** (Kategorie „Das macht ihr schon gut", `severity:"positive"`, grünes Checkmark, gerendert VOR den kritischen „damit der Kunde positiv eingestimmt ankommt", Z.446-450). Quelle: internes Lead-Presentation-Tool Slide 6 (Z.1-9). Bilingual de/en; Preset-Insert im Admin OHNE LLM-Call (`finding-add-form.tsx:13-25`), Severity im UI nur `critical|positive`.

Verkaufszahlen-Claims in den Texten: „Über 70 % der Käufe passieren mobil" (Z.119), „Listings mit Video erzielen bis zu **9,7 % höhere Conversion**" (Z.181), „Basic A+ steigert Conversion um bis zu **8 %**" (Z.219). Admin-Empfehlung: **3 Findings**, alle als „kritisch" (rote X-Card) gezeigt (`de.ts:394-396`).

### 2.4 Amazon-Text-Referenzen (Titel + Bullets) — von der Kern-Analyse nicht erfasst

- Schema `schema.ts:261-315`: `amazonTitleShowcase` + `amazonBulletsShowcase` — **additiv, unabhängig vom bild-basierten `referenceType`**, gerendert unterhalb der Bild-Referenz; je Vorher/Nachher + `issues[]` (Preset-ID oder Freitext); `AMAZON_BULLETS_MAX = 5` (Z.315); Bullet-Issues gelten gesamthaft, nicht pro Bullet (Z.301-304).
- Preset-Bibliothek `src/lib/sales-room/amazon-reference-presets.ts`: **9 Titel- + 13 Bullet-Begründungen** (nur DE, Übersetzung via Overlay). Fachregeln darin: Amazon indexiert Keyword nur 1× (Z.33); vordere Titel-Wörter höher gewichtet (Z.43); Mobile-Abschneidung (Z.48); „konzipiert statt entwickelt" als abmahnsichere Formulierung (Z.63); Bullets: „erste 5–8 Wörter entscheiden", Benefit-first (Z.82); Verbatim aus Top-Reviews (Z.117); Erwartungs-Management gegen Negativ-Reviews („3–4 Wochen tägliche Anwendung", Z.137); Emojis = Amazon-Richtlinienverstoß (Z.142); mehrfach **Rufus**-Bezug (Z.97, 112). Volltext-Labels → Abschnitt 4.3.
- Kombiniertes Layout: bei `referenceType==="listing"` UND aktiven Text-Referenzen rendert `r/[slug]/page.tsx:178-184,337-359` eine gemeinsame **Amazon-Produktseiten-Maske** mit gemeinsamem Vorher/Nachher-Toggle (`listing-product-page-showcase.tsx`).

### 2.5 Pricing-Engine — `src/lib/pricing/` (Kern-Analyse hatte „weglassen" empfohlen; hier steckt die komplette Kommerz-Logik)

**Listenpreise** (`calculator.ts:225-242`, dupliziert für DB-loses `comparePlans`):

| Plan | 4-Monats-Rate | Jahresvertrag | max Parent-ASINs | Marktplätze |
|---|---|---|---|---|
| Starter | 3.990 €/Mo | 3.390 €/Mo | 4 | fix `["DE"]` |
| Wachstum | 6.990 €/Mo | 5.940 €/Mo | 12 | 1 inkl., weitere zubuchbar |
| Individuell | null („Auf Anfrage", Marker = Preis 0) | null | ∞ | — |

**Aufpreise** (Single Source of Truth, `calculator.ts:38-39`): `FULL_SERVICE_CHILD_ASIN_EUR = 290` (nur Starter, Z.108-112), `FULL_SERVICE_EXTRA_MARKETPLACE_EUR = 690` **pro Extra-Marktplatz × pro Parent-ASIN** (nur Growth, Z.114-129). DB-Row-Wert gewinnt vor Konstante.

**Varianten-Faktor** (`calculator.ts:17-21`): `full-service 1.0 · content 0.6 · ppc 0.45` — skaliert NUR die Per-Unit-Aufpreise, nicht die Basis („spiegelt unsere internen Aufwands-Verhältnisse"). Content: 174 €/Child, 414 €/MP×ASIN; PPC: 130,50 / 310,50 €.

**Monatsraten-Formel** (`calculatePricing`, Z.88-208):
```
base = annual ? monthlyAnnualEur : monthlyEur
+ (Starter) childAsinCount × 290 × faktor
+ (Growth)  max(0, mp − inkl(1)) × 690×faktor × max(1, asinCount)
+ Σ Addon-Einmalpreis / contractMonths   (annual=12, sonst 4 → Umlage)
× (1 + priceOverridePct/100)             (Admin-Override −100..+100)
```
Breakdown-Kinds `base|extra|addon|discount`; Override erscheint erst ab |1 €| als „Individueller Rabatt"/„Anpassung" (Z.190-195).

**Empfehlung** (`comparePlans` Z.400-432, first match): (1) keiner passt → premium; (2) Growth-Surcharge > Growth-Basis → premium, Growth secondary; (3) beide passen → **starter** (immer günstiger), Growth secondary; (4) nur Growth → growth. Starter blockiert bei >4 Parents, >1 Marktplatz oder Nicht-DE (lokalisierte `blockedReason`-Texte Z.247-264).

**Historie** (`recommend.ts:1-19`): Bis 2026-05 Heuristik mit Revenue-Buckets → Fehlverhalten (kleinster Bucket empfahl „Individuell"). **Neu: Umsatz + Goals fließen NICHT mehr ins Pricing** — nur Parent-ASINs + Marktplätze; Revenue nur noch CRM/Tracking. Kundenlesbare Message inkl. **Headroom-Hint** („Platz für N weitere ASINs — genug für eure X geplanten Launches", Z.149-165).

**Feature-Katalog** (`default-features.ts`, 27 Zeilen, identische Row-Labels über alle Tiers für Scan-Vergleichbarkeit; `included:false` = ausgegraut statt versteckt): Differenzierer u. a. Child-ASINs (ab Growth), Brand Store/Story (ab Growth), A/B-Testing (ab Growth), Sponsored Display (ab Growth), Sponsored Brand Video + DSP (nur Premium), wöchentliche Performance-Calls + Quartals-Reviews (ab Growth), „Strategie-Review mit 3 Gründern" (nur Premium).

**Varianten-Seeding im Admin** (`packages/actions.ts:754-850`): Content-Plan = Full-Service-Klon ×0,60, PPC ×0,45; Feature-Bullets werden über **drei kuratierte Drop-Keyword-Listen** gefiltert (Z.446-533): Content droppt alles PPC/Margen/Inventar/Buy-Box/Weekly-Calls; PPC droppt alles Content **plus Monatsreport** („PPC-Kunden bekommen Weekly-Calls statt Monats-Recap"); Filter prüft DE UND EN index-aligned (Z.551-569). Bulk-Preisänderung ±% aufs ganze Profil (Z.857-892). Default-Seeds pro Profil: Starter 3990/3390 (5 ASINs), Growth 6990/5940 (10 ASINs, highlight, 690 € Extra-MP), Premium 0/0 (9999 ASINs) — Z.296-368. **ICP-Score 1–10** + **Preis-Override −50..+50 % in 0,5-Schritten** als UI-Constraints (`pricing-section.tsx:112-129`); Default-ICP bei Anlage: 6 (`admin/actions.ts:155`).

**Verkaufs-Wording zur Laufzeit** (`de.ts:1377-1382, 1466-1467`): „**4 Monate Mindestlaufzeit.** Damit unsere Maßnahmen messbar wirken und ihr unsere Qualität in belastbaren Daten beurteilen könnt." / „**12 Monate Zusammenarbeit** … messbares Wachstum über euer gesamtes Sortiment" (−15 %); Commitment-Labels „4-Monats-Pilot" / „12-Monats-Partnerschaft". Add-on-Umlage-Text: „einmalig · auf {months} Mo. umgelegt" (`de.ts:1435-1437`). Custom-Angebot: „innerhalb von 24h mit Vorschlag und Termin" (`de.ts:1417`).

### 2.6 Questionnaire-System — `src/lib/questionnaire/`

**7 Seed-Fragen mit stabilen, hartcodierten UUIDs** (`seed-questions.ts:22-30`, `8b1f0001-…`), damit `funnel_step`-Events (metadata.questionId) historisch konsistent joinen. Governance (`steps.ts:13-41`, `content/questions/actions.ts:17-28`): semantische Änderung = neue Frage + Soft-Delete; Options mit stabilen IDs; UI nudgt „Neue Frage anlegen" als Primärpfad.

| # | Tag | Typ | Frage (DE) | Optionen → numericValue |
|---|---|---|---|---|
| 1 | revenue | bucket | „Wie viel Umsatz habt ihr letzten Monat auf Amazon gemacht?" | 50–100k→75.000 · 100–200k→150.000 · 200–400k→300.000 · 400k+→500.000 |
| 2 | asin_count | bucket | „Wie viele Parent-ASINs habt ihr im Sortiment?" | 0–5→3 · 5–10→8 · 10–20→15 · 20–50→35 · >50→60 |
| 3 | marketplace_list | multi | „Auf welchen Marktplätzen seid ihr aktuell aktiv?" | DE FR UK IT ES NL PL SE BE US |
| 4 | planned_marketplaces | multi | „Auf welche Marktplätze möchtet ihr internationalisieren?" | gleiche 10 (Daten-Migration 0009.ts) |
| 5 | launches | number | „Wie viele Launches plant ihr in den nächsten 12 Monaten?" (0 valide) | — |
| 6 | none | multi | „Kunden-Ziele" — **reine Sales-Intel, geht NICHT ins Pricing** (Z.231-234) | increase_revenue, improve_profitability, gain_market_share, expand_portfolio, elevate_brand_presence |
| 7 | goal | bucket | „Wobei können wir euch unterstützen?" | full-service / content / ppc |

**Kopplungs-Falle**: ASIN-Bucket-Mittelwerte 15/35/60 liegen **über dem Growth-Limit 12** → ab Bucket „10–20" kippt die Empfehlung zwangsläufig auf „Individuell"; nur 0–5 und 5–10 können in Starter/Growth landen (Starter max 4 → nur Bucket 0–5).

`answer-mapper.ts:40-121`: routet per semanticTag in `PrePricingAnswers`; bei Tag-Duplikaten gewinnt kleinste orderIndex. `steps.ts:64-92`: 5 kanonische Steps (`revenue, asin, marketplaces, launches, goal`), Admin-Auswahl in globalContent `questionnaire_active_steps`; **Migrations-Fingerprint** (exakt alte 4er-Liste → `launches` wird auto-ergänzt); Reihenfolge immer code-fixiert. Feature-Flag `use_dynamic_questionnaire` (Default aus = hartcodierte Variante). Fragetypen: bucket/number/multi-select/text.

Zwei Fragebogen-Modi je `showPricing`: Pre-Pricing-Setup-Check (Outcome = Tarif-Empfehlung, „Tarif sehen") vs. Discovery-Bedarfs-Check (Outcome = Call-CTA; offene Frage „**Wo drückt der Schuh am meisten?**", `de.ts:1258-1261`; Submission mit `packageKey:"interest"`, `funnel-action.ts:129-168`).

### 2.7 SOV-Report — Datenvertrag, Parser, Anzeige-Schalter

- **Zwei Ebenen**: alte `sov_data`-Tabelle = schlanker Balken-Teaser; hochgeladener `sovReport` (JSON auf sales_rooms) ersetzt ihn durch 3-Tab-Vollanalyse (`schema.ts:477-489`). Beim Upload werden die Teaser-Rows **aus `sovBars` neu synchronisiert** (`admin/actions.ts:593-611`) und `showSov` automatisch auf true gesetzt (Z.586-588).
- **Payload-Vertrag** (`schema.ts:326-424` + `docs/sov-report-export.md`): pro Keyword 19 Felder (`kw, cluster, sv, ks, cpr, cprClass(Low/Medium/High), mainRank, bestCompRank, kwSOV, topCompKwSOV, kwRevPool, ownPosRev, compPosRev, fullRevGap, corridors{low,base,high}, opportunityType(Quick Win|Strategic Gap|Mature|Niche), priority, recommendedLever, oppScore`); metrics (brandSOV Pflicht!, topCompSOV/-ASIN, visibilityGapMetric, rankingCoverage, top10Coverage, quickWinCount, totalCorrLow/High, totalFullGap); coverage (total/ranked/top3/top10/rank11_20/rank21_50/unranked); Listen top2ByKS/quickWins/strategicGaps/revenueGaps(=Top-15 nach oppScore)/allKeywords.
- **Export-Doku** (`docs/sov-report-export.md`): Pflicht seit V2: `meta.ownAsin` + `meta.marketplace` (DE/US/UK/FR/IT/ES/NL/PL/SE/BE) — fürs **Amazon-Bild-Scraping pro ASIN**; Wettbewerber-Label MUSS die ASIN sein (Parser-Regex `/^B[A-Z0-9]{9}$/`); `competitorBrands`-Map sonst nur nackte ASINs; `meta.price` Default 45 €; `executiveSummary` **deprecated** („wiederholte nur die Kacheln" — war Claude-generiert im externen Tool).
- **Parser** (`sov-report.ts`): locale-robuster Zahlenparser (Z.53-86: Währungszeichen strippen, letztes Trennzeichen = Dezimal, 3 Nachkommastellen = Tausender — Bugfix „€1.234 wurde 0"); KS-Alias-Kaskade bevorzugt `ksMonthly` (= Helium10-KS-Definition, Z.120-135); **Placeholder-Filter** (Z.40-51) gegen „Generating action plan…"-Reste; brandSOV + nicht-leere sovBars sind Pflicht.
- **`sovHideRevenue`** (`schema.ts:469-475`, Migration 0011): blendet alle €-Zahlen (Korridor/Lücke/Potenzial) aus, „wenn die Umsatz-Korridore zu klein sind, um überzeugend zu wirken" — Sales-Psychologie-Schalter; invertiertes Formularfeld `sov_show_revenue` (`admin/actions.ts:209-213`).
- **EN-Overlay**: `sov-report-translate.ts` übersetzt actionPlan/executiveSummary/Levers via Claude, index-gleiche Lever-Arrays, Fehler → DE bleibt; Lazy-Backfill bei jedem Room-Save (`admin/actions.ts:330-348`).
- **Kundenseitige SOV-Didaktik** (`de.ts:1054-1170`): SoV-Definition („gewichtet nach Suchvolumen und Ranking-Position; 100 % = gesamter Sichtbarkeits-Pool"); **Quick-Win-Definition: eigener Rang 8–25 + Wettbewerber Top 10** („nah genug für Listing- oder PPC-Push"); **Strategische Lücke: >Rang 25 / ungerankt + Wettbewerber Top-10** („Backend-Keywords + Indexierung zuerst, dann skalieren"); Ranking-Bänder mit Kommerz-Interpretation (Top 1–3 höchste CVR-Wahrscheinlichkeit · 4–10 sichtbar aber unter Bestsellern · 11–20 zweite Seite marginale CTR · 21–50 praktisch unsichtbar · ungerankt = nicht indiziert); Korridor-Framing („Indikative Schätzung, keine Prognose … konservativ Low – ambitioniert High"); Glossar KS/SV/CPR/Umsatzlücke („liegt direkt ‚auf der Straße'").

### 2.8 Outreach-Modul (komplett neu ggü. Kern-Analyse)

**Datenmodell** (Migrationen 0013-0015): `outreach_macros` (Team-Vorlagen, Soft-Delete), `outreach_drafts` (genau 1 pro Room, Upsert via Unique-Index), `outreach_sent_messages` (Append-Log inkl. `connectionNote` + senderName — Audit „mit welchem Text wurde der Room übermittelt").

**Taxonomie** (`outreach/constants.ts:17-52`): Kanäle email/linkedin/other; Szenarien `cold` („Kalt – Erstausspielung": Lead hat einer Ausarbeitung bereits zugestimmt), `reconnect`, `post_call` (Alt-Werte warm/other nur Anzeige). **6 Built-in-Templates** (Z.230-374, Code = einzige Quelle der Wahrheit, DB-Seed abgeleitet) — Volltext-Kern → Abschnitt 4.5. Gemeinsame Verkaufs-DNA (Z.201-214): Anrede → konkret was gemacht/gefunden → SoV als Aufhänger → **IMMER holistischer Ausblick** („nicht nur diese eine ASIN, sondern übers ganze Sortiment") → lockerer Call-CTA mit Terminbuchung direkt im Link.

**Platzhalter-Mechanik** (Z.63-189): `{{Vorname}}, {{Marke}}, {{Produkt}}, {{Analyse-Link}}, {{Dein Name}}, {{Loom Link}}, …` — ~35 DE/EN-Aliasse tolerant gemappt; leere Werte bleiben als Token sichtbar.

**KI-Generator** (`api/admin/outreach/generate/route.ts`, 400 Z.): Modell **claude-sonnet-4-6**, max_tokens 1200, JSON-only `{subject, body, connectionNote}`. Kern-Regeln des System-Prompts (Z.135-316):
- Produkt-Naming: „Listing Scoring / Potenzialanalyse / die Analyse / der digitale Raum" — **NIEMALS „Sales Room", „Tool", „Dashboard", „Landingpage"** (Z.137-139).
- 5-Schritt-Pflichtschema; Schritt 3 = **holistischer Ausblick (PFLICHT)**; echte SoV-Zahlen nennen wenn vorhanden („stärkster Vertrauensanker"), nie erfinden.
- CTA: Empfänger ruft NICHT zurück, bucht im Raum; `CALL_HOST = "Clemens"` (Z.22) — Absender ≠ Clemens → „buch dir einen Slot mit Clemens — ich bin auch dabei" (Z.127-133).
- Anti-KI-Stil: Verbotswortliste („Slot schnappen", „reinhauen", „geflasht", „Banger", „krass"…), keine Floskeln, kein Kanal-Meta, identisch für E-Mail und LinkedIn.
- **LinkedIn-Connect-Note: hartes 200-Zeichen-Limit inkl. Link** (`LINKEDIN_CONNECT_LIMIT`, Z.15); Server rechnet Budget vor: `200 − Linklänge − 1` und teilt es dem Modell mit (Z.198-204).
- **Stil-Anker = 4 echte Versand-Texte** (Z.30-64, u. a. Casaria: „ihr habt nur 3,8 % Sichtbarkeitsanteil, der Bestseller hat 70 %"; 180-Parent-ASINs-Reconnect: „stärkster Wettbewerber 82,9 %, ihr 2,4 %") + Connect-Beispiel (Z.67). Nur Ton/Länge/Rhythmus übernehmen.
- **Grounding auf echte Room-Daten** (`getRoomOutreachContent`, `queries.ts:449-611`): Listing-Score-Existenz, max. 6 Findings-Titel („so benennen, nicht erfinden"), echte SoV-Zahlen (brandSov, topCompSov, keywordsTop3/total), Content-Piece-Label je referenceType (Premium-A+ erkannt an `spacing==="seamless"`, Z.599).
- Inputs: history-Freitext max 2000 Z., formality du/sie, locale.

### 2.9 KI-Einsätze gesamt (Modell-Split nach Kostenlogik)

| Einsatz | Modell | Ort |
|---|---|---|
| Outreach-Generator (intern, hochwertig) | claude-sonnet-4-6, 1200 tok | api/admin/outreach/generate |
| Plan-Advisor (kundenseitig, pro Plan-Karte) | claude-haiku-4-5-20251001, 600 tok | api/sales-room/plan-advisor |
| Content-Übersetzung DE→EN (jeder Admin-Save) | claude-haiku-4-5-20251001, 2000 tok | lib/i18n/translate.ts:103-110 |
| SOV-Overlay-Übersetzung | via translateFields (Haiku) | lib/sov-report-translate.ts |
| Bulk-Translate (11 Tabellen) | via translateFields (Haiku) | admin/bulk-translate-action.ts |

**Plan-Advisor-Prompt** (`plan-advisor/route.ts:188-205`): „Du bist der digitale Berater von TEMOA … max. 4 kurze Absätze … Nenne keine Preise außerhalb der unten gegebenen Zahlen" + PLAN-DATEN + PREIS-LOGIK (4/12 Monate, −15 %, inkludierte/Extra-ASINs+Marketplaces **variantenskaliert** ×0,6/×0,45, Z.236-249) + Add-ons + LEITPLANKEN („rechne konkrete Berechnungen aus … falls unsicher: sag es, empfehle den Call"). ⚠️ Route ist **öffentlich ohne Auth/Rate-Limit** (nur 600-Zeichen-Input-Cap) — Kostenrisiko.

**Übersetzungs-Prompt** (`translate.ts:36-47`): UK-Englisch (en-GB, „optimise/favour/behaviour"), Brand-Ton „pragmatic, confident, short, no marketing fluff", DE „ihr"→EN „you", Eigennamen-Schutzliste (TEMOA, Amazon, A+, Brand Story/Store, Marketplace), `{placeholder}` erhalten, STRICT JSON gleiche Keys/Array-Längen. Fail-Safe: ohne Key/bei Fehler `{}` → DE bleibt, Overlay wird nie verschlechtert. `mergeTranslationOverlay` field-by-field (User-Overrides überleben). Bulk-Pipeline-Heuristiken (`bulk-translate-action.ts`): Stat-Values nur übersetzen wenn `/[a-zäöüß]/i` matcht („+147 %" bleibt); Skip-Keys icon/tone/stage/*Eur/unit; globalContent bekommt `${key}_en`-Zwillinge.

### 2.10 Tracking, Pipeline, Analytics

**12 Event-Typen** (`tracking/types.ts`): room_view, section_view, section_dwell, cta_click, image_click, funnel_step, funnel_complete, scroll_milestone, call_booked, plan_advisor_ask, results_download, room_exit. Track-Route-Whitelist hat 11 (`api/track/route.ts:7-19` — plan_advisor_ask fehlt dort; wird serverseitig anders erzeugt).

**13 Section-Taxonomie in Room-Reihenfolge** (`tracking/sections.ts:37-51`): welcome, customers, samples, analysis, share_of_voice, case_studies, design_examples, why_temoa, process, team, pakete, questionnaire, call; `clickable` (Dialog) nur für analysis…team. Legacy-Mapping `analysis_sov→analysis`, Tile-Keys analyse/sov/referenzen/warum-wir/prozess/team (Z.59-85).

**Client-Mechanik** (`tracker.tsx`): room_view beim Mount; `first_scroll` als funnel_step ab scrollY>50 (Z.36-41); Scroll-Milestones 25/50/75/100 %; section_view ab **40 % Sichtbarkeit** (Z.99), section_dwell erst ab **>1000 ms** kumulierter Sichtzeit (Z.108); ExitTracker: genau EIN room_exit mit zuletzt sichtbarer Section (offener Dialog hat Vorrang), via pagehide+visibilitychange („zuverlässiger als beforeunload auf Mobile/Safari", Z.153-154). Transport: sendBeacon, Fallback fetch keepalive; Fehler still.

**Stealth-System für Interne**: `temoa_internal`-Cookie (non-httpOnly, 1 Jahr) via `/internal-mode` oder **Dreifach-Klick aufs TEMOA-Logo binnen 2 s** im Room-Header (`admin-logo-unlock.tsx`, `r/[slug]/page.tsx:246-250`); Events werden geflaggt (isAdmin), nicht geblockt (`api/track/route.ts:26-30`); `/api/track/reset` löscht **rückwirkend** alle Events der Session (autorisiert übers frische Internal-Cookie), damit das initiale room_view den Pipeline-Status nicht auf „geöffnet" zieht (`track/reset/route.ts:7-21`). Zusätzlich Admin-Aktion „Tracking zurücksetzen" pro Room — löscht Events, **behält Funnel-Antworten** (`admin/actions.ts:367-380`).

**Pipeline-Stage-Maschine** (`sales-room-stage.ts:60-98`, abgeleitet, nie gespeichert): archived → stageOverride „won" (manuelle Kanban-Übersteuerung, einzige erlaubte; Drop in andere Spalte = Override-Reset, `kanban-dnd.tsx:20-32`) → Kunden-`call_booked` → status won → status lost → **letzte Kundenaktivität > 5 Tage = auto-lost** (`LOST_AFTER_DAYS=5`, Z.22) sonst opened → sentAt=sent → published=created → draft. `sentAt` ≠ `publishedAt` („Übermittelt" ≠ „existiert unter URL", `schema.ts:546-551`). Kanban-Spalten created/sent/opened/won/lost (draft/archived ohne Spalte); Board = Admin-Landingpage.

**Cal.com-Integration Ende-zu-Ende**: Locale-abhängige Links (DE `cal.com/temoa-clemens/temoa-strategiegesprach`, EN `…/amazon-strategy-call`, Env-überschreibbar, `r/[slug]/page.tsx:216-238`); `metadata[salesRoomId]` + **`metadata[browserSessionId]`** in die Embed-URL injiziert (`cal-embed.tsx:43-56`) → Webhook (`api/webhooks/calcom/route.ts`) verifiziert HMAC-SHA256 (`X-Cal-Signature-256`, timingSafe; ohne Secret ungeprüft!), akzeptiert **BOOKING_CREATED + BOOKING_REQUESTED** (Bestätigungspflicht-Events; Dedup weil Analytics distinct sessionIds zählt und sessionId die Booking-UID enthält, Z.45-57), schreibt append-only ein `call_booked`-Event unter DERSELBEN Browser-Session-ID („Cross-Event-Joins: Call gebucht ohne Fragebogen-Start", Z.89-101) — **kein direkter Stage-Wechsel**, Stage wird abgeleitet. DB-Fehler → 500 = Cal-Retry. `.env.example:20-33`: Webhook muss beide Trigger für BEIDE Event-Typen (DE+EN) abonnieren, sonst werden EN-Buchungen nie getrackt.

**Analytics-Definitionen** (`analytics/page.tsx`): nur published-Rooms, nur isAdmin=false, Zählung = distinct sessionId. **Pricing-Funnel** (6 Stufen): room_view → `step='first_scroll'` → `step LIKE 'pre-pricing-%'` (LIKE robust gegen Key-Umbenennung) → `pre-pricing-complete` → **`drawer_opened` = Tier ausgewählt** → call_booked. **Discovery-Funnel** (5 Stufen, `questionnaire-%`). Cal-iframe-Grenze explizit dokumentiert: „was im iframe passiert, können wir nicht zuverlässig tracken" (`de.ts:735-738`). Section-Engagement: viewedPct/clickedPct/Exit-Verteilung; Kostprobe-Downloads bewusst **außerhalb** des Funnels. Fragen-Performance per questionId; **Teilantworten von Abbrechern** werden aus funnel_step-Events rekonstruiert (`questionnaire-answers.tsx:16-23`). Funnel-Chart zeigt Drop-off-% zwischen Stufen. Submissions-Tabelle mit Vertragswert (calculatedSetup/Monthly/TotalEur).

### 2.11 Kundenseite: Dramaturgie & Verkaufsrhetorik

**Seitenaufbau** (`r/[slug]/page.tsx`, jede Sektion eigener SectionTracker): Header (nur TEMOA-Logo, kein Kundenname) → welcome (Hero-Puzzle: TEMOA-Teil + Kundenlogo-Teil „snappen" zusammen — visuelle Partner-Metapher, `globals.css:325-358`; Logo-Slot-Aspect 70/22≈3.18 im `logo-cropper.tsx:43-45`) → customers (Logo-Marquee „immediate social proof above the fold") → Referenz-Showcase je Typ → analysis + share_of_voice (prominent ÜBER Case Studies) → case_studies → 4 Dashboard-Kacheln (design_examples, why_temoa, process, team) → KPI-Strip → **Gating-Switch `showPricing`**: Pakete-Sektion (alle 3 Varianten vorab geladen für Instant-Umschalten nach Funnel-Goal) ODER Bedarfs-Fragebogen + Call-CTA (auch Prozess-Phasen wechseln: `process_phases` vs. `process_phases_no_pricing`) → call (CalEmbed). Öffentlich per unguessable Slug (slugify + 6 Zeichen crypto-Suffix aus 55er-Alphabet ohne 0/1/l/I/O, `slug.ts`), `noindex,nofollow`, Canonical-Host-308 auf room.temoa.de (`middleware.ts`).

**Reziprozitäts-Mechanik „Kostprobe"** (`de.ts:964-986`): Vorher/Nachher-Toggle „Status quo"/„Unser Vorschlag"; „**Geschenkt für euch.** Diese Produktbilder könnt ihr ab sofort verwenden." + ZIP-Download (dependency-freier Store-ZIP-Writer `zip.ts`, `results_download`-Event); `visibleCount` 1-7 + `heroLocked` = künstliche Verknappung mit Schloss-Overlay (`schema.ts:494-504`). Bild-Kopierschutz per CSS `user-drag:none` in Referenz-Dialogen (`globals.css:311-323`).

**Meta-Framing**: DE „Euer individueller **Potenzial-Check**" / EN bewusst frei: „Your personal **Growth Audit**" (`de.ts:939`, `en.ts:924`); Hero „Hi, {name}! Hier ist euer individueller Potenzial-Check."; Footer „Persönlich erstellt für {brand}"; Default-Hero bei Anlage: „Euer Wachstumsraum, {brand}." (`admin/actions.ts:33-46`).

**Why-Us-Dialog** (4 Tabs, `de.ts:1495-1540`): Hero „**Keine Werbeagentur. Sondern Wachstumspartner.**"; 4 Leistungssäulen (Strategie/Content/Advertising/Management) mit Pitch-Wortlaut; Framework „**Organisch zuerst, danach PPC**" („Wir machen eure Listings Retail-Ready auf allen Ebenen — Produktbilder, EBC, Titel-SEO, Bullet-Point-SEO, Backend. So trifft jeder Werbe-Euro auf maximale Klick- & Kaufraten") + 5 Benefits; Inhouse-Vergleich: „fünfstellige Kosten pro Monat — plus die Punkte unten" vs. „weniger Risiko, schneller einsatzbereit, planbar abrechenbar"; im Seed konkrete Gehälter (mock.ts:1936-1965): Content Manager 5.000 € brutto/6.100 € AG-Kosten, Designer 4.500/5.500, PPC-Manager 5.500/6.700, Marketplace Consultant 6.000/7.300, vs. `temoaMonthlyEur: 6990` — „bewusst soft, ohne €-Schock". 9 Pain Points „aus 60+ Marken" inkl. „Content nicht KI-ready". USP-Text „Auch optimiert für **Rufus & COSMO sowie A10**".

**Prozess**: 7 Phasen mit `stage: sales|service`-Trennung + 5-Phasen-Variante ohne Pricing (mock.ts:1713-1755); Dialog-Rahmen „Sechs klare Phasen … Divider: Vertrag steht · wir starten" (`de.ts:1561-1570`).

**Closing-Sequenz**: „Clemens (Co-Founder) prüft eure Anfrage persönlich" (`de.ts:1415`), Bio „Co-Founder · Sales · **1.000+ Listings optimiert**" (1454), persönliche Nachricht 30-Min-Setup-Pitch (1455); Trust-Anker: Verifizierter Partner, **Amazon Service Provider Network**, Google Reviews, Trustpilot (1478-1481); Danke-Seite 3 Schritte „locker und ohne Verkaufsdruck" (1590-1604). KPI-Strip: „⌀ +30 % Profitabilitätssteigerung · 1.000+ optimierte Listings · 5+ Länder · 60+ Marken" (mock.ts:860-880). TACoS-Ziel-Default 8–12 % (mock.ts globalContent + Room-Defaults).

### 2.12 Amazon-Spezifikationen (in Editoren/Schema kodiert)

- **Brand Story**: Hintergrund **3660×1563 px** (`brand-story-editor.tsx:208-245`), Portrait-Card **814×1019**, ASIN-Grid-Card 1328×1456 mit **2×2 Sub-Bildern** + Headline + nicht-klickbarem Link-Label; **max. 19 Cards** + 1 Background (Slot-Max 20, `references/categories.ts:92-104`); echtes Amazon-Karussellverhalten dokumentiert: „View 1 = Gap links + 2 Cards + Peek von Card 3; **pro Klick slidet Amazon um 3 Cards**" (brand-story-editor.tsx:90-94; Kunden-Renderer: 3 Cards + 1 Peek).
- **A+ / Premium A+**: max. **7 Module**, Empfehlung 970 px Breite (`de.ts:371-376`); `spacing: gapped` (klassisch, ~6 mm Lücken) vs. `seamless` (Premium stapelt nahtlos); Karussell **nur bei Premium**, max. **5 Slides**, 3 Amazon-Navigationstypen `simple` (Pfeile+Dots) / `navigation` (schwarze Top-Bar, bis 5 Menüpunkte) / `regimen` (bis 5 benannte Pillars rechts) (`schema.ts:179-213`, `aplus-showcase-editor.tsx:50-62`).
- **Listing**: 1 Hero + 6 Detail-Bilder (Amazon-Galerie-Muster, 7 Slots); Hauptbild-Render max. 760 px (`de.ts:380-382`); Default-Aspects Hero 4:5, Grid 1:1.
- **Brand-Video**: 1 Slot; akzeptiert auch **lange Bilder als Pseudo-Video** (Play scrollt das Bild einmal von oben nach unten, `de.ts:539-543`).
- **Bullets**: max. 5 („Amazon gibt 5 Slots", `schema.ts:314-315`).
- Referenz-Kategorien (`references/categories.ts`): main_images→„Listings", a_plus→„EBC Content", brand_store, brand_story; Layouts listing_grid/ebc_gapped/ebc_seamless/brand_video/brand_story; getrennte **DE/UK-Sortierung** via `order_uk`-Spalte (`schema.ts:1048-1052`).
- Upload-Limits: Bilder ≤25 MB, Videos ≤100 MB, Logos ≤5 MB (inkl. SVG, Export transparentes PNG 1400 px), Produktbild ≤10 MB, SOV-JSON ≤5 MB; Multi-Uploads Browser→Vercel-Blob direkt (umgeht 4,5-MB-Server-Action-Limit / HTTP 413).

### 2.13 Case Studies — 4 echte Referenzen mit realen KPIs (mock.ts:1220-1483, seed via seed.ts)

1. **Vitaworld** (NEM, Q1'25→Q1'26): Umsatz +147 % (131k→326k €/Q) bei Adspend nur +39 %; TACoS 10,4→5,8 %; CR 18,6→27,9 % (+50 %); CTR +52 %; Bestellungen ×3,2; ACoS 30,9→21,6 %; PPC-Anteil 36→29 %. 15 Monats-Chartpunkte mit Annotation „TEMOA Onboarding".
2. **HaA** (Küche): „Cold Launch zu Top-Performance in 17 Wochen" — CR 5,5→32,5 % (+439 %), ACoS 13,5 %, Bestellungen/Woche ×14 (28→397); Badges „Bestseller in der Nische", „Recovered von Account-Sperrung in 2 Wochen".
3. **FUTUM** (Schädlingsbekämpfung): 1. volles Amazon-Jahr 392.327 € / 17.042 Bestellungen, ACoS-Tief 19,99 %, organischer Anteil bis 80 %; Positionierung „Akut-Nische: Käufer recherchieren nicht, sie wollen sofort eine Lösung".
4. **„Marke aus Gartenzubehör"** (`isAnonymized:true` — Logo aus, displayName ersetzt Brand, Bilder mit Hinweis): 4 Marktplätze, TACoS DE −35 %, CR +21 %, IT Klicks +110 % bei ACoS −18 %.

Datenmodell: 3 Story-Sektionen (Defaults „Ausgangslage/Unser Vorgehen/Ergebnis"), Stats 3-stufig (hero 1–3 / sub / **preview = die EINE Zahl der Listenkarte, max 1**), `trend: up|down|neutral` (down bei ACoS wird trotzdem grün = semantisch positiv, `schema.ts:1063-1071`), Chart = Umsatz+TACoS monatlich mit Annotationen, Badges mit Icons (Trophy/Award/Star/ShieldCheck/Globe), Akzentfarben, `showChart`-Toggle. Live-Preview im Admin rendert die echten Public-Komponenten.

### 2.14 Frontend-Verkaufsmechaniken (Komponenten-Ebene, verifiziert)

- **SoV-Interpretationsschwellen** (`dialogs/sov-dialog.tsx:293-299`): eigener Brand-SoV **<5 % rot · 5–20 % orange · >20 % grün**; Chancen-Tab kappt auf **max. 6 Quick Wins + 4 Strategic Gaps** (Z.555-556); Executive Summary wird bewusst nicht mehr gerendert („Redundanz zu den Cards"); Wettbewerber-Labels immer ASIN+Marke, nie „Competitor A/B/C"; Brand-Titel-Scraping wurde entfernt („lieferte Müll wie ‚25 kg'").
- **SoV-Gating als Conversion-Steuerung** (`dashboard-grid.tsx:200-227`): gesperrte SoV-Kachel (desaturiert, Platzhalter-Balken ohne Zahlen) scrollt beim Klick **gezielt zum Questionnaire, NIE zum Kalender** — dokumentierte Sales-Logik: „ohne SoV-Daten hat der Kunde noch keine Eingaben gemacht — wir wollen ihn ZUERST durch die Fragen schicken, damit das Strategiegespräch mit Kontext läuft"; trackt `state:"not_analysed"`.
- **„Pricing-Schock"-Architektur** (`packages-section.tsx:112-138`): Tarifkarten erscheinen erst NACH abgeschlossenem Setup-Check; Antworten persistieren in sessionStorage pro Room (`pricing-context.tsx`), prefillen den Konfigurator-Drawer; Empfehlung steuert Karten-Highlighting (primary hochgehoben, secondary Ring); im Drawer-Success direkt Cal-Iframe (Buchung ohne Kontextwechsel); Full-Service-Option im Ziel-Step dauerhaft grün als „Maximales Wachstum" inszeniert.
- **LockedTile-Verknappung** (`sample-showcase.tsx:16-94`): dominante Farben werden per 8×8-Canvas aus den ECHTEN hochgeladenen Bildern extrahiert und als geblurrte Gradient-Platzhalter mit Lock-Badge gerendert — „kommuniziert ‚wir haben schon angefangen', ohne das Artwork zu leaken"; Status-quo-Leerplätze dagegen bewusst leere weiße Kacheln (nichts „freizuschalten").
- **Analyse-Dialog-Dramaturgie**: Stärken („Das macht ihr schon gut") werden VOR den kritischen Findings gerendert; Faktor-Balken nutzen einen festen Rot→Orange→Grün-Verlauf über die volle 0–100-Skala, per backgroundSize nur ausschnittweise sichtbar (bei 30 % fast nur rot).
- **Brand-Story-Render-Maße** (`dialogs/references-dialog.tsx:1106-1178`): Live-Amazon-Vermessung Container 1464×625 → Card 362×453 (24,73 %×72,48 %), Gap 30 px, Stride 26,78 %, View 1 = Intro-Gap + 2 Cards + Peek, 3 Cards pro Klick; Brand-Store-Pseudo-Video scrollt mit ~80 px/s (min 5 s, max 14 s).
- **Opt-out-Unlock** (`admin-logo-unlock.tsx:25,64`): 3× Logo-Klick → leeres `window.prompt("")` → Passwort **„admin"** → Suppression + Internal-Cookie + rückwirkende Session-Löschung.
- **Hero-Puzzle** (`hero-puzzle.tsx`): Kundenlogo-Puzzleteil rastet in TEMOA-Teamfoto-Teil ein („Ka-Ching"-Ringe) = visuelle Partnerschafts-Metapher; Begrüßung nutzt Vorname des Ansprechpartners, sonst VOLLEN Markennamen („sonst würde ‚Vita World' zu ‚Vita'", `welcome-hero.tsx:23-28`).
- **Download-Integrität**: `results_download` wird erst NACH erfolgreichem ZIP-Download getrackt (nur echte Downloads zählen); ZIP-Dateinamen „{Brand} {ContentLabel} {n}.{ext}", A+-Slides als „Modul.Slide" (2.1, 2.2 …).

### 2.15 Architektur-/Betriebs-Muster (wiederverwendbar)

- **Runtime-Migrations-Runner statt CLI** (`api/admin/db-push`, migrations/initial+0001-0016 als SQL-Strings): idempotent — „already exists"/„duplicate column" wird geschluckt; Daten-Migration 0009 via `INSERT OR IGNORE` auf stabile UUIDs. ⚠️ `drizzle/`-Ordner ist inkonsistent nummeriert (drizzle/0002 ≠ migrations/0002); Quelle der Wahrheit = Runtime-Ordner.
- **Selbstheilendes Schema**: `ensureSchemaColumns()` via pragma_table_info vor INSERT/UPDATE; **gestaffelter Health-Check** `checkDbStatus` (`db/client.ts:45-97`) mit 11 parallelen Proben je Migrations-Stage (sequenziell hatte den Admin gegen Remote-Turso „eingefroren"); dreistufiger Selbstheilungs-Banner (Schema-Push → Seed → Unsplash-403-Sanierung).
- **Mock-Fallback überall**: ohne `TURSO_DATABASE_URL` läuft die komplette Demo aus mock.ts (Demo-Room `/r/demo-golab`); Content lebt im Code, DB ist Cache — explizite Refresh-Endpoints mit Preserve-Liste (`questionnaire_active_steps` überlebt).
- **i18n-Master+Overlay**: DE = Quellsprache in den Spalten, `translations.en` als JSON-Overlay auf 17+ Tabellen (Migration 0004); Admin-Eingabe auf EN wird **rückübersetzt EN→DE** für den Master; `__lang=en`-Edit schreibt nur ins Overlay; hartcodierte DE→EN-Fallback-Map für Seed-Defaults alter Rooms (`i18n/types.ts:102-137`); Locale-Update als **separates UPDATE-Statement** (Drizzle-Default-Bugfix, `admin/actions.ts:317-328`).
- **ASIN-Bild-Scraper** (`api/asin-image/route.ts`): 302-Redirect aufs Amazon-Hauptbild; Kaskade og:image → twitter:image → ImageBlock-State → #landingImage → Loose-Match; **Fallback Suchseite `/s?k=ASIN`** („deutlich liberaler ausgeliefert", umgeht Captcha auf /dp/) mit `data-asin`-Container-Regex; Chrome-124-Header-Tarnung, Accept-Language je Marktplatz, 6s-Timeout, 24h-In-Memory-Cache inkl. Negativ-Cache; TLD-Map DE/US/UK/FR/IT/ES/NL/PL/SE/BE; ASIN-Regex `^B[A-Z0-9]{9}$`; „Übergangslösung bis PA-API".
- **Auth**: Single-Token (`ADMIN_TOKEN`), Cookie 30 Tage, timingSafeEqual, Magic-Link `?token=`; Prod ohne Token → Zufalls-Fallback (deny all, kein Crash); Dev-Default „dev". Getrenntes Internal-Cookie ohne Admin-Rechte.
- **Performance**: Listen-Query schließt schwere JSON-Spalten aus (sovReport/Showcases „teils hunderte KB pro Raum", `queries.ts:400-411`); Kanban-Events als Group-By-Aggregat (hasBooking+lastActivity) statt Event-Liste; Banner-Health-Memo TTL 30 s mit Inflight-Dedupe; `?debug=timing`-Cold-Start-Diagnose.
- **Stack real**: Next 16.2.6 + React 19, Drizzle auf **libSQL/Turso** (README nennt veraltet Supabase/Postgres + „Next.js 15"), Vercel Blob, Recharts, dnd-kit, Caros-Hausschrift, Brand-Farben Amazon-Orange #ff9900 + Rot #ff3131, eigene Score-Farbskala + Rot→Gelb→Grün-Gradient. Env-Integrationen: ADMIN_TOKEN, TURSO_*, CALCOM_LINK(_EN) + CALCOM_WEBHOOK_SECRET, ANTHROPIC_API_KEY, HIGGSFIELD_API_KEY (Bildgen), NEXT_PUBLIC_SITE_URL.
- Kleinteile: deterministische Team-Farben mit Name-Pins (noor=rot, jonas=gelb, marvin=türkis); Owner-Auswahl filtert Design-Team per Namens-Blocklist {marina,vadim,dias} (`queries.ts:375`); Flash-Messages via URL-Param statt Cookie; `marketplace-flag.tsx`: Amazon „UK" → Unicode „GB", 22-Länder-Palette.

---

## 3. NEU gegenüber der Kern-Analyse (SALVAGE.md §3) — Abgleich

**Korrekturen an der Kern-Analyse:**
1. **findings-presets sind 44, nicht ~40** — 31 kritische + **13 positive**; die positiven (eigener Block „Das macht ihr schon gut", vor den kritischen gerendert) fehlen der Kern-Analyse als Konzept.
2. **„6×5-Rubrik" ist ungenau**: 6 Faktoren × 5–6 Stufen; 4 Faktoren haben 6 Bänder, productImages mit exklusiver 100-%-Stufe „Produktbilder von uns".
3. **`computeOverall` liegt in `sales-rooms/[id]/actions.ts:26-29`**, nicht „actions.ts:26"; direkt daneben die bisher nirgends dokumentierten **readinessLabel-Schwellen 85/70/50** (Z.31-36). Es sind sogar DREI Skalen (4-stufiges Label, 5-stufiges Band, 3-stufiger Farb-Token).
4. **Showcase-Liste unvollständig**: zusätzlich existieren die additiven **Amazon-Titel-/Bullet-Referenzen** (mit eigener 9+13-Preset-Bibliothek) und das kombinierte Amazon-Produktseiten-Layout; A+-Detail: gapped/seamless = A+/Premium-Unterscheidung, Karussell nur bei Premium.
5. **SOV präzisiert**: zwei Ebenen (sov_data-Teaser wird beim Upload aus dem Report synchronisiert); `sovHideRevenue`-Schalter; Placeholder-Filter; locale-robuster Zahlenparser; SOV-Zahlen fließen ins Outreach-Grounding; Export-Doku definiert Bild-Scraping-Pipeline (ownAsin/marketplace/ASIN-Regex) und deprecatet executiveSummary.
6. **Stack**: Next **16.2.6**, nicht 15; README dokumentiert eine veraltete Supabase-Architektur, Betrieb läuft auf Turso.
7. **„Weglassen: Pricing, Outreach, Kanban/Tracking" war als Salvage-Urteil zu pauschal** — genau dort liegt der größte Teil des kodifizierten Verkaufs-Know-hows (siehe unten).

**Komplett neu erschlossen:**
1. **Outreach-Modul**: 6 wortgetreue Best-Practice-Templates, 3-Szenarien-Taxonomie, Platzhalter-Resolver, Draft/Versand-Log, KI-Generator-Prompt (Sonnet 4.6) mit Verkaufs-Doktrin (Produkt-Naming-Verbote, Pflicht-„holistischer Ausblick", Clemens-als-Call-Host, Anti-KI-Wortliste, 200-Zeichen-LinkedIn-Budget-Arithmetik, Grounding auf echte Room-Zahlen).
2. **Pricing-Engine komplett**: 3.990/3.390 · 6.990/5.940 · 290 €/Child · 690 €/MP×ASIN · Faktoren 1.0/0.6/0.45 · Empfehlungsregeln inkl. „Surcharge>Basis→Individuell" · Drop-Keyword-Listen fürs Varianten-Seeding · −15 % Jahreslogik · Add-on-Laufzeit-Umlage · ICP 1–10 · Override ±50 %.
3. **Questionnaire-System**: 7 Seed-Fragen mit numericValues, semanticTag→Engine-Routing, stabile UUID-Governance als Tracking-Vertrag, Bucket/Plan-Limit-Kollision (ab „10–20" immer Individuell), Interest-Modus ohne Pricing.
4. **Tracking/Pipeline-Betriebslogik**: 5-Tage-Auto-Lost, stageOverride-Semantik, sentAt≠publishedAt, Cal.com-Session-Bridge + Doppel-Trigger-Falle, Stealth-Opt-out mit rückwirkender Session-Löschung, Funnel-Step-Matcher (drawer_opened = Tier-Pick), Exit-Attribution, 40 %-Viewport-/1s-Dwell-Schwellen.
5. **KI-Landschaft**: 3 Claude-Einsätze mit Modell-Split (Sonnet intern / Haiku kundenseitig+Übersetzung), vollständige Prompts, Never-Degrade-Overlay-Strategie; ungeschützter Plan-Advisor als Sicherheits-Befund.
6. **Amazon-Pixel-Spezifikationen**: 3660×1563 / 814×1019 / 1328×1456-2×2 / 970 px A+ / 760 px Hauptbild / 7-5-19-Limits / „Amazon slidet um 3 Cards"-Verhalten.
7. **Verkaufsrhetorik im Wortlaut**: 5-Stufen-Schmerz-Labels, Bestseller-„Burggraben", „Keine Werbeagentur. Sondern Wachstumspartner.", „Organisch zuerst, danach PPC", Inhouse-Gehaltsvergleich, Kostprobe-Reziprozität („Geschenkt für euch"), 4-Monats-Pilot-Begründung, SOV-Didaktik (Quick-Win = Rang 8–25 + Comp Top 10).
8. **4 Case Studies mit echten Zahlen** + Anonymisierungs-Feature.
9. **ASIN-Bild-Scraper** mit Suchseiten-Fallback und Header-Tarnung.
10. **Ops-Muster**: Runtime-Migrations-Runner, 11-Proben-Health-Check, Code-als-Content-Quelle mit Preserve-Keys, Blob-Direct-Upload gegen 4,5-MB-Limit, Bulk-Translate über 11 Tabellen.
11. **Frontend-Conversion-Mechaniken** (§2.14): SoV-Ampel <5/5–20/>20 %, gesperrte SoV-Kachel routet zum Fragebogen statt zum Kalender, „Pricing-Schock"-Gating (Tarife erst nach Setup-Check), LockedTile-Farbextraktion aus echten Uploads, Stärken-vor-Kritik-Reihenfolge, Hero-Puzzle-Metapher, Opt-out-Passwort „admin".

---

## 4. Wiederverwendbare Datenstrukturen/Presets im Wortlaut

### 4.1 Score-Schwellen

```ts
// [id]/actions.ts:26-36
computeOverall = round(mean(6 Faktoren 0-100))
readinessLabel: >=85 "Premium-ready" | >=70 "Solide"
  | >=50 "Erhebliches Potenzial ungenutzt" | sonst "Dringender Handlungsbedarf"
// readiness.ts:17-31
readinessBand: >=80 RetailReady | >=60 Strong | >=40 Foundation | >=20 EarlyStage | NeedsWork
readinessColor: >=80 good | >=60 ok | bad
// Kunden-Labels (de.ts:1019-1023):
NeedsWork="Verkauft nicht" · EarlyStage="Verbrennt Traffic" · Foundation="Verschenkt Umsatz"
  · Strong="Luft nach oben" · RetailReady="Retail-Ready"
```

### 4.2 Faktor-Legenden (DE, `listing-factor-legends.ts:24-71`)

**SEO/GEO**: 0–10 „Titel unter 80 Zeichen, kaum relevante Keywords, Backend leer" · 20–30 „Titel nutzt Zeichenlänge teilweise, Haupt-Keyword vorhanden, Bullets ohne Struktur" · 40–50 „Keywords in Titel + Bullets platziert, Backend befüllt, Bullets mit Features" · 60–70 „Titel Mobile-optimiert (USP in ersten 80 Zeichen), Bullets Benefit-first, Long-Tail abgedeckt" · 80–90 „Zusätzlich semantische Begriffe für Rufus/COSMO integriert, Backend voll ausgeschöpft".
**Produktbilder**: 0–10 „<7 Bildplätze belegt" · 20–30 „Alle 7 belegt, aber nur Freisteller/Standardfotos" · 40–50 „7 Bilder mit Infografiken, keine klare Verkaufsreihenfolge" · 60–70 „Erkennbare Bildstruktur (Hero, Benefits, Anwendung, Lifestyle), Mobile-lesbar" · 80–90 „Professionelle Galerie mit psychologischer Verkaufsstruktur, USP-Hauptbild, Mobile-optimiert" · **100 „Produktbilder von uns"**.
**Produktvideo**: 0 „Kein Video" · 10–20 „vorhanden, schlechte Qualität/ohne Nutzen" · 30–40 „solide, Produkt in Anwendung, kein klarer Aufbau" · 50–60 „professionell, Nutzen erkennbar, gute Länge" · 70–90 „Starker Einstieg, klare Nutzen-Kommunikation, emotionaler Trigger, CTA".
**A+**: 0 „kein A+" · 10–20 „Basic, Module wiederholen Bullets" · 30–40 „Basic mit Struktur + Vergleichstabelle" · 50–60 „Premium vorhanden, nicht strategisch" · 70–80 „Premium strategisch, Mobile-optimiert, Cross-Sell-Module" · 90 „voll ausgeschöpft inkl. Hotspots, Video-Module, FAQ".
**Brand Store**: 0 · 10–20 „eine Seite ohne Kategorien" · 30–40 „Kategoriestruktur, Inhalte veraltet" · 50–60 „Kategorieseiten, aktuelle Produkte, Grunddesign" · 70–80 „Professionelles Design, klare Navigation, Lifestyle, Promotions" · 90 „Durchgängiges Markenerlebnis, regelmäßig aktualisiert, Sponsored-Brands-Traffic integriert".
**Brand Story**: 0 · 10–20 „generischer Platzhaltertext" · 30–40 „eigene Inhalte, austauschbar, ohne Store-Link" · 50–60 „erkennbare Positionierung, Store verlinkt" · 70–80 „konsistent über alle ASINs, hochwertig" · 90 „Premium-Branding, Cross-Selling-optimiert".

### 4.3 Amazon-Referenz-Presets (`amazon-reference-presets.ts`)

**Titel (9)**: title-duplication (Keyword nur 1× indexiert — Dopplung verschenkt Zeichen) · title-keyword-stuffing (Amazon bewertet negativ) · title-keyword-late („Amazon gewichtet die vorderen Wörter höher") · title-mobile-truncation (Kaufauslöser hinter der Abschneidung unsichtbar) · title-no-reach (Füllmenge ohne Reichweite = Conversion-Killer bei Premium-Preisen) · title-weak-trigger · title-compliance („konzipiert" statt „entwickelt" = abmahnsicher) · title-filler (Zahlen/Fakten > Adjektive) · title-unclear-audience (in Sekunden erfassbar).
**Bullets (13)**: bullet-feature-first („erste 5–8 Wörter entscheiden — Benefit zuerst, Feature als Beleg") · wall-of-text · no-hierarchy (2-Sekunden-Scan) · keyword-stuffing („verlieren bei Käufer, bei Rufus und beim Ranking gleichzeitig") · vague (Menge/Maß/Reichweite/Dosierung schaffen Vertrauen) · unproven-claims (von Reviews widerlegt + rechtlich riskant) · no-use-case (hilft auch Rufus bei der Einordnung) · no-customer-language (Verbatim aus Top-Reviews) · inconsistent-headline (Versalien-Muster durchziehen) · unused-slots (jeder Slot = eigenes Argument) · written-for-algorithm („gutes Ranking ist die Folge guter Lesbarkeit, nicht ihr Ersatz") · no-expectation-mgmt („3–4 Wochen tägliche Anwendung" — sonst Negativ-Review) · emoji-spam (Richtlinienverstoß).

### 4.4 Pricing-Konstanten

```ts
// calculator.ts
VARIANT_SURCHARGE_FACTOR = { "full-service": 1.0, content: 0.6, ppc: 0.45 }
FULL_SERVICE_CHILD_ASIN_EUR = 290        // nur Starter, pro Child/Monat
FULL_SERVICE_EXTRA_MARKETPLACE_EUR = 690 // nur Growth, pro MP × Parent-ASIN/Monat
PLAN_PRICING = {
  starter: { baseMonthlyEur: 3990, baseAnnualEur: 3390, maxParentAsins: 4, fixedMarketplaces: ["DE"] },
  growth:  { baseMonthlyEur: 6990, baseAnnualEur: 5940, maxParentAsins: 12, includedMarketplaces: 1 },
}
contractMonths = annual ? 12 : 4   // Add-on-Umlage; Jahresrabatt 15 %
// Add-ons (Seed): Brand Store 3.900 € einmalig · Brand Story 1.400 € einmalig (availableIn: ["starter"])
// Empfehlung: beide passen→starter; growthSurcharge>growthBase→premium(+growth secondary); keiner→premium
```

### 4.5 Outreach-Kern (Auszug; alle 6 Templates in `outreach/constants.ts:230-374`)

Template „Kalt · Analyse + neues Konzept" (Betreff „{{Marke}} – eure Analyse ist fertig"):
> Hallo {{Vorname}}, wie besprochen – hier kommt die Analyse für {{Marke}}: {{Analyse-Link}} · Wir haben uns euer Listing zum {{Produkt}} genau angeschaut und ein paar Sachen gefunden. Allen voran beim Content – dazu habe ich euch direkt ein neues Konzept erstellt. · **Das betrifft natürlich nicht nur die eine ASIN, sondern zieht sich durch die Mehrheit eurer Produkte.** · In der Share-of-Voice-Analyse im Raum seht ihr außerdem eine erste Einschätzung eurer Keyword-Performance im Vergleich zu Wettbewerbern und die möglichen Umsatzlücken pro Keyword. · Wenn das interessant klingt, lass uns gerne kurz sprechen – einen freien Termin findest du direkt im Link. …

Weitere: „Kalt · Sichtbarkeit/SoV" (Hauptbild als Einstieg — „CTR ist neben der Conversion Rate der zweitwichtigste Hebel"), „Reconnect" („der größere Hebel ist, mit euren Produkten überhaupt in die Sichtbarkeit zu kommen"), „Nach Telefonat" (+Loom), „Kalt förmlich (Sie)", „Cold · English". Generator-Regeln: Produkt heißt nie „Sales Room"; LinkedIn-Connect ≤200 Zeichen inkl. Link; Call-Host immer Clemens.

### 4.6 Stage-Maschine & Tracking-Taxonomie

```
Stages: draft → created → sent → opened → won | lost | archived
won:  stageOverride="won" ∨ Kunden-call_booked ∨ status=won
lost: status=lost ∨ (Kundenaktivität existiert ∧ >5 Tage alt ∧ keine Buchung)
sent: sentAt gesetzt · created: published ohne sentAt/Aktivität
Events (12): room_view, section_view(≥40% Viewport), section_dwell(>1s),
  cta_click, image_click, funnel_step, funnel_complete,
  scroll_milestone(25/50/75/100), call_booked, plan_advisor_ask,
  results_download, room_exit(letzte Section, Dialog vor Scroll)
Sections (13, Reihenfolge): welcome, customers, samples, analysis, share_of_voice,
  case_studies, design_examples, why_temoa, process, team, pakete, questionnaire, call
Pricing-Funnel: room_view → first_scroll → pre-pricing-%* → pre-pricing-complete
  → drawer_opened (=Tier-Pick) → call_booked
```

### 4.7 SOV-Keyword-Vertrag (Kurzform)

```ts
{ kw, cluster, sv, ks /*Helium10 ksMonthly*/, cpr, cprClass: "Low|Medium|High",
  mainRank, bestCompRank, kwSOV, topCompKwSOV, kwRevPool, ownPosRev, compPosRev,
  fullRevGap, corridors: {low, base, high},
  opportunityType: "Quick Win|Strategic Gap|Mature|Niche", priority, recommendedLever?, oppScore? }
// Quick Win = eigener Rang 8–25 ∧ Wettbewerber Top 10
// Strategische Lücke = eigener Rang >25/ungerankt ∧ Wettbewerber Top 10
// revenueGaps = Top-15 aus (quickWins ∪ strategicGaps) nach oppScore
```
