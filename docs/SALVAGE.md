# Salvage-Inventar — Was aus welchem Repo kommt

> Ergebnis der Tiefenanalyse der 6 hochgeladenen Pakete (2026-07-06). Referenz für den Greenfield-Neubau: was portieren, was als Wissen übernehmen, was verwerfen.

## Übersicht der 6 Quellen

| Quelle | Was es ist | Rolle im Neubau |
|---|---|---|
| **Blog_Artikel** (~82 MD) | Amazon-Wissenskorpus (DE) | Wissens-Layer (Prinzipien/Reasoning) |
| **seo-operating-system** | Gratis-Tool aus dem Netz (Handbuch + schwache Webapp) | Nur Regeln & Datenmodell als Inspiration |
| **sales-room** | Produktives Outreach-Frontend (Temoa) | Presets + Showcase-Renderer + Tease-Konzept |
| **reporting-main** | Tiefes Analyse-/Reporting-Tool (Temoa) | **Kronjuwel: SQP-Engine + Parser** |
| **Temoa-Tools-Beta** | 4-Tools-Plattform; `apps/temoa-os/` ist das zentrale Tool | **Kronjuwel: buildPrompt + Review-Insights + Campaign-Builder** |
| **marketplaceadpros-skills** | Gratis Claude-Skills-Paket aus dem Netz (11 Skills, MCP-gebunden) | Wissenstransfer + Architektur-Lehrstück (Skill-vs-Tool) |

---

## 1. Blog_Artikel — Wissens-Layer

- **Charakter:** methodikstark, spec-schwach. Liefert mentale Modelle, Heuristiken, Formeln — **bewusst KEINE harten Zahlen** (Zeichenlimits, Byte-Limits, Pixelmaße).
- **Verwertbare Regeln:** Titel-Struktur-Formel (Marke → Kernbegriff → Eigenschaften/Keywords → Nutzen → Variante; erste 60–70 Zeichen mobil entscheidend; jedes KW nur 1×). A+ nicht suchindexiert (Keywords in Titel/Bullets/Backend). CRO-Hebel-Ranking: Hauptbild > Galerie > Titel/Bullets > A+ > Reviews > Preis. Negative Keywords: nicht vor 10–15 Klicks ohne Verkauf. PPC-Formeln (ACoS/TACoS/ROAS = 1/ACoS; Break-even-ACoS = Marge). 3 Kampagnen-Rollen (Discovery/Performance/Defense) + Keyword-Trichter.
- **Artikel→Modul-Mapping:** siehe Tabelle in der Chat-Analyse (06/07/25/74 → Content; 61/21 → Competitor; 05/25/74 → Keyword; 40/39/25 → Review; 26/15 → Bilder; 01–04/11/23 → PPC).
- **Pfad:** `Blog_Artikel/Blog Artikel/` (00_Themen-Masterliste.md = Index).

## 2. seo-operating-system — nur Regeln, Code verwerfen

- **QA-Engine (`webapp/src/lib/qa-checks.ts`) NICHT übernehmen:** 16/40 Punkte hardcoded, A2 hat Logikbug (0 unerreichbar), leeres Listing scort ~23/40. Zählt `String.length` statt Bytes/Grapheme.
- **Übernehmbar als Regeln:** 40-Punkte-Scorecard-Kriterien (`checklisten/seo-content-qa.md`), Datenmodell Produkt→Keyword→Content→QA + Status-State-Machine, Content-Versionierung, CSV-Autodetect für Helium 10.
- **Dichtestes Dokument:** `optimierung/massnahmenplan.md` (7 Optimierungshebel als Feature-Blueprint).

## 3. sales-room — Presets & Tease-Konzept

- **⭐ 3 Preset-Bibliotheken portieren (das Herzstück, framework-frei, DE/EN):**
  - `src/lib/findings-presets.ts` — ~40 „Das fällt uns auf"-Findings, kategorisiert + positive Findings.
  - `src/lib/sales-room/amazon-reference-presets.ts` — ~9 Titel- + ~13 Bullet-„Vorher"-Begründungen.
  - `src/lib/listing-factor-legends.ts` — 6×5-Rubrik (Bewertungskriterien je Faktor 0–100).
- **⚠️ Der Score ist Fassade:** 6 Faktoren (SEO/GEO, Produktbilder, Produktvideo, A+, Brand Store, Brand Story) werden **manuell 0–100 eingetippt**; Gesamtscore = ungewichtetes Mittel (`actions.ts:26 computeOverall`). **Keine Engine.** → Im Neubau durch echte Score-Engine ersetzen; die Faktor-Legenden liefern die Kriterien dafür.
- **Zwei divergierende Label-Systeme** (`readinessLabel` 4-stufig vs. `readinessBand` 5-stufig) — im Neubau vereinheitlichen.
- **Showcase-Typen** (Vorher/Nachher durchgängig via `previous*`): A+ (Karussell simple/navigation/regimen), Brand Story (2×2 asin_grid), Main Image, Sample (1 Hero + 6 Grid), Titel-/Bullet-Referenz mit `issues[]`. Renderer detailgetreu — wertvoll, wenn Neubau Amazon-Optik zeigt.
- **SOV-Report:** Repo **berechnet nichts**, zeigt nur JSON aus externem Tool (`SovReportPayload`, schema:352). Vertrag in `docs/sov-report-export.md`.
- **Weglassen:** Pricing-Engine, Outreach, Kanban/Tracking, Auth-Boilerplate (~60 % sind Sales-Ballast).
- **Stack:** Next.js 15, Drizzle/libSQL/Turso, Vercel Blob, Claude für Übersetzung + Plan-Advisor (Haiku).

## 4. reporting-main — ⭐ KRONJUWEL: Analyse-Engine

Reine, unit-getestete Funktionen ohne DB-Kopplung → **1:1 portierbar**. Pfade unter `src/lib/`.

- **Parser (`{sqp,ads,business,searchterm}/parser.ts`):** DE/EN-Header-Aliasing, Zahlenformat aus Daten erkannt (nicht Header-Sprache), Kennzahlen aus Rohcounts neu berechnet (nie aus Datei gelesen). Der teuerste, am meisten unterschätzte Teil — hier gelöst.
- **SQP-Engine (der USP):**
  - `sqp/metrics.ts` — rekonstruiert marken-eigene CTR/CVR (Amazon liefert nur Marktraten); Revenue-Potenzial = verlorene Käufe bei Markt-CVR.
  - `sqp/tier1.ts` — Funnel-Bottleneck (negativster relativer Gap, ab MIN_CLICKS=5).
  - `sqp/tier2.ts` — Opportunity-Matrix (bleeder/easyWin/fixListing/scale/defend/…), datensatz-relative Median-Schwellen; Branded vs. Generic Split.
  - `sqp/scenario.ts` — Potenzial = Conversion-Hebel + Sichtbarkeits-Hebel; „von 5% auf 25% Sichtbarkeit = +X€".
  - `sqp/cluster.ts` — deterministisches Head-Term-Clustering (leichtes DE-Stemming, keine Embeddings) + Cluster-Trend über Perioden.
- **N-Gram (`searchterm/ngram.ts`):** 1/2/3-Wort-Roots, `topConverting` (Scale-Kandidaten) vs. `negativeCandidates` (verbranntes Budget). Stärkste direkt umsetzbare PPC-Analyse.
- **Action-Plan (`actionplan/build.ts`):** **regelbasiert, kein AI.** Priorisierte Todo-Liste mit €-Impact. Schwellen: Negativ-KW high wenn wastedPct ≥30 %; Kampagne über ACoS-Ziel high wenn overspend ≥200€; Kampagne ohne Umsatz high wenn ≥200€. Schwellen im Neubau konfigurierbar/kategorie-adaptiv machen.
- **Margin (`margin/{calc,fees}.ts`):** Amazon.de-Gebühren, `breakEvenAcosPct = margin/gross×100`.
- **AI-Assistent „Christoph":** nur Onboarding/Berechtigungen, KEINE Datenanalyse. Modell claude-opus-4-8 + web_search.
- **Grenzen:** kein echtes SoV (nur Impression-Share), PPC nur Kampagnen-Ebene, Placement-Report NICHT geparst, JSON-Blob-Persistenz skaliert schlecht.

## 5. Temoa-Tools-Beta — ⭐ `apps/temoa-os/` ist das zentrale Tool

`apps/temoa-os/` vereint bereits 4 Tools unter Supabase-Login; 9-Tab-Roadmap dokumentiert. Root-App + `apps/campaign` + `apps/reporting` sind **Legacy/redundant** → verwerfen, nur temoa-os als Referenz.

- **⭐ Listing-Generator (`src/lib/listing/`) — portieren:**
  - `buildPrompt.js` — Keyword-Tiering (PRIMARY 3–4→Titel, SECONDARY 8–12→Bullets, TERTIARY→Beschreibung, Rest→Backend); Slot-Bullets (Hook/Problem+Benefit/Trust/Usage/Close); sektionsweise Generierung (Title→Bullets→Backend→Description→Q&A) mit Approval-Gate.
  - `byteEnforcement.js` — **deterministische Byte-Durchsetzung per TextEncoder** nach dem LLM-Call (Umlaute = 2 Byte). Title 200 Zeichen (erste 80 mobil), Bullets 250–300 B, Backend 249 B (Einzelwörter, keine Kommas), Description 1.999 B, Q&A 5 Paare.
  - `filterKeywordsApi.js` — Claude filtert Cerebro-Pool vorab (temp 0), JSON `{excluded, reason}`, robuster Fallback.
  - Title-Auto-Expand wenn <190 Zeichen (zweiter Call).
- **⭐ Review-Insights (`src/lib/listing/reviewInsightsApi.js` + `api/reviews.js`):**
  - Apify Actor `axesso_data~amazon-reviews-scraper`, `run-sync-get-dataset-items`, `domainCode:'de'` (hartcodiert), maxPages 10 (~100/ASIN), max 6 ASINs, Rate-Limit 3/60s, ~€0.45/Voll-Scrape.
  - Output normalisiert `{asin, rating, title, body}`; Rating aus „5,0 von 5 Sternen" geparst; Filter rating 1–4 + body>10.
  - `extractPainPoints` → bis 300 Reviews an Claude → 10–12 Pain Points JSON `[{label, description}]`.
  - **⚠️ Kein Rechts-/DSGVO-Handling, DE-only.** Im Neubau adressieren.
- **⭐ Campaign-Builder (`src/lib/campaign/`) — portieren:**
  - Nur Sponsored Products, 1 Ad-Group/Kampagne. Max-CPC = Preis × (ACOS/100) × (CVR/100).
  - Kampagnenfamilien: AUTO, COM-CAT, GEN-KW-EXACT/PHRASE, COM-KW-EXACT, COM-ASIN, BRA-KW-EXACT/ASIN. Namensschema `TE-{country}-{product}-SP-{family}`. Dynamic bids down-only, Placement-Boosts +15/+15/+10 %.
  - Cross-Negation (Exact-KWs als negativExact in Phrase-Kampagne), Brand-Protection-Negation.
  - **Excel-Export** mit exakten dt. Amazon-Bulk-Spaltenköpfen (52 Spalten) — SheetJS.
- **Reporting-Sub-App (`apps/reporting/src/lib/`):** überschneidet sich mit reporting-main → NICHT doppelt portieren. sqrBenchmark (sqrRatio = purchaseShare/clickShare; ≥1,0 Strong), campaignClassifier (verbindet mit Builder-Namenskonvention).
- **Architektur-Prinzip (gut):** „Import-First, API-Ready" — Parser getrennt, reine Logik in `lib/`, dünne Pages, Zustand-Stores.
- **Stack:** React 18 + Vite, Zustand, Supabase Auth, Claude claude-sonnet-4-6, Apify, Upstash Rate-Limit, Sentry, SheetJS. Server-Proxies für alle AI/Scrape-Calls (Keys nur in Env).

## 6. marketplaceadpros-skills — Wissenstransfer + Architektur-Lehrstück

11 Claude-Skills, alle **dünne Instruktions-Layer um einen proprietären MCP-Server** (MAP). Kein Skill rechnet selbst — er dirigiert Tool-Calls + trägt Domänenwissen. Die Ausführung (MCP-Tools, JSX-Assets) ist an MAP gebunden → **für uns wertlos; nur der Wissensinhalt + die Muster zählen.**

- **Format-Lehre:** SKILL.md hat nur EIN Frontmatter-Feld (`description`, sehr trigger-lastig; Name = Ordnername). Body: Titel → Tools-Tabelle → Fachsektionen → „Common workflows" (wörtliche Prompt-Vorlagen) → „Pitfalls" + „Tips". ~120–185 Zeilen. Progressive Disclosure kaum genutzt (nur reorder-planning hat `references/`).
- **⭐ Übernehmenswertes Fachwissen (→ Wissens-Layer / Hard-Specs), nicht die Ausführung:**
  - **Listing/Titel:** RUFUS-3-Fragen für Bullets („Is this right for me? / What's different? / How do I use it?"). Banned-Claims-Liste + compliant-Ersatz („FDA approved" → „made in an FDA-registered facility"). 75-Zeichen-Titel + 14-Tage-Fenster (US; DE-Limit abweichend). 6 Kategorie-Titel-Playbooks (Priorisierungs-Reihenfolge, z.B. Supplements: Brand→Hero ingredient→Strength(mg)→Count→Benefit→Form). Prinzip „gekürzte Keywords umlagern statt löschen". Hijacking-Signal: CVR-Drop ohne Preisänderung/Stockout.
  - **Ads:** 3–5× mehr Negatives als Positives; Term mit ≥20 Klicks & 0 Orders → negative exact; Bid = Revenue-per-Click × Ziel-ACoS (Floor/Cap); 80/20-Budget-Pyramide; Saison-Playbook (≥2 Orders/30d, 2 Wochen vorher, Floor +25%).
  - **Waste-Definition:** purchases14d=0 AND clicks≥5; Kosten-Tiers ≥$100 CRITICAL / $60–100 HIGH / <$60 ELEVATED; Waste <2% gesund, >5% echtes Geld. Eigen-Marken-Terme mit 0 Conv = Listing-Problem, nicht Keyword-Problem.
  - **Harvest:** BROAD/PHRASE (exclude EXACT), impressions≥100 & clicks≥3; PRIME (clicks≥30 & ACOS≤0.40) / STRONG (clicks≥10 & ACOS≤0.55).
  - **DSP:** NTB% = newToBrandPurchases14d/totalPurchases14d; Prospecting NTB>40 %.
- **⚠️ Anti-Patterns (bewusst NICHT übernehmen):** NL→SQL-Prompt-Choreografie um unzuverlässigen `ask_report_analyst` (gibt selbst zu: „~1 von 3 Calls droppt Rows"); Google-Fonts-Runtime-Injection (CSP-fragil); dreifach kopiertes Design-System in den JSX-Templates.
- **⭐ Muster: „Dashboard-als-Datenkontrakt"** — Skill befüllt nur einen deklarierten `RAW`-Array + Masthead-Konstanten in ein styling-eingefrorenes Template („Do not modify the styling"). Fachlogik (Tiering, Effective-DOS) lebt im Template. **Bessere Version für uns: ein versioniertes Template als geteilte Komponentenbibliothek**, nicht pro-Feature kopiert.
- **Lücke im Nutzer-Portfolio (Wissen sichern, NICHT Phase 1):** reorder-planning (Formeln inkl. AWD-`replenishment_quantity`-Doppelzähl-Falle: on-hand = FBA fulfillable + AWD onhand; inbound = FBA + AWD inbound; replenishment NICHT separat addieren), fba-inventory-risk (Effective-DOS = (fulfillable+inbound)/avg daily; Tiers <2 CRITICAL/<7 HIGH/<14 ELEVATED), experiments (State-Machine proposed→started→complete, ändert nie autom. in Amazon). **Domäne = Operations, nicht Listing → Ideen-Backlog.**
- **Redundanz-Fazit:** listing-audit/title redundant im Zweck (aber fachlich detaillierter → Content übernehmen); ads/waste/harvest überlappend mit reporting-repo (dort haben wir echte Pipelines statt NL-Prompts → nur Schwellenwerte übernehmen); FBA/reorder/experiments neu (parken).

---

## 7. temoa-audit — das aktuelle Listing-Analyse-Tool (Struktur GOLD, Umsetzung schwach)

Skill-orchestriertes Audit-/Generierungs-Tool: `.claude/skills/temoa-listing-generator` steuert die **nexscope Amazon-Skills** (Git-Submodul `github.com/nexscope-ai/Amazon-Skills`, verwandt mit marketplaceadpros) und überlagert sie mit temoa-Brand-Voice. Schreibt einen Ordner strukturierter JSON/MD-Artefakte pro ASIN und rendert einen Flask-Onepager (≈ Sales-Room-Tease). Deploy: Fly.io. **Nutzer-Urteil: Output hat „unfassbar viele Fehler", NICHT unser Standard — aber die Output-STRUKTUR ist stark.**

### ⭐ Übernehmenswerte Strukturen (als Output-Kontrakt, NICHT der Code)

- **Artefakt-Schema pro ASIN** (gutes Datenmodell einer Listing-Analyse): meta · audit(8-Dim) · keywords · competitors · listing(md+json) · backend-keywords(250B) · a-plus-plan · shotlist · **review-insights.json** · sov-audit · image-brief · composite-spec.
- **`review-insights.json`-Schema** (direkt als Kontrakt unseres Review-Moduls nutzen):
  ```
  data_basis, confidence, sources, stats{reviews_total, rating_avg},
  pain_points[{label, frequency_pct, mention_count, quotes[]}],
  buying_triggers[{label, frequency_pct, mention_count, quotes[]}],
  language_to_borrow_from_real_reviews[], language_to_avoid_per_voice[]
  ```
  → deckt „Kaufauslöser + Kundenbeschwerden → Content" mit verbatim-Quotes ab.
- **8-Dimensionen-Audit:** Title · Bullets · Description · Backend-KW · Bilder · A+ · Reviews · Preisstrategie — je „Aktuell / Probleme / Empfehlung". → Kandidat für unsere Listing-Diagnose-Dimensionen (mit echtem Score-Engine statt Prosa).
- **Profit-Hebel-Keywords (sov_calculator.py):** Quick-Wins + Top-Revenue-Gaps als KW-Pool für Title/Bullets. Score-Combo Rank-Proximity × SV × CPR × Title-Density; eigenes CTR-Kurven-Modell (Pos→CTR, Top-10 ≈ 0,78) für Revenue-Gap-Schätzung („Geld auf der Straße"). Ähnlich, aber unabhängig vom reporting-repo-SOV.
- **Onepager-Narrativ (Tease-Struktur):** Listing aktuell → Executive Summary → Audit-Score/100 → „Das fällt uns auf" → Share of Voice → Top Revenue-Gaps → Vorher→Nachher → Pain-Points → Kaufauslöser → Compliance → O-Töne → „So könnte euer Listing aussehen" → Quick Wins → CTA. ≈ deckungsgleich mit Sales-Room-Showcase.
- **⭐⭐ Zwei hart erarbeitete Bild-Brief-Regeln — beantworten direkt die „fehlerhaften Briefings"-Klage:** siehe `content-knowledge-system.md` (Reference-Fidelity-Lock + Spelling-Risk). Diese gehören in unsere VALIDATION-Schicht.

### Warum der Output fehlerhaft ist (bestätigt unsere Architektur-These)

- **LLM-orchestrierte Skill-Pipeline** (Claude ruft 11+ Skills nacheinander, jeder schreibt eine Datei) → nicht-deterministisch, kein harter Validierungs-Gate.
- **Datenbasis oft gescrapt mit Fallbacks** (Amazon blockt Premium-Marken → Herstellerseiten/idealo/Google-Cache → `confidence: low`). Wackeliges Fundament.
- **Bild-Brief = Prosa an externes Bildgen-Tool**, das Referenzen ignoriert; sie bekämpfen das mit Prosa-Warnungen (Reference-Fidelity-Lock) statt mit deterministischer Durchsetzung — ein Verlustgeschäft.
- Alles Markdown/Prosa statt erzwungener, validierter Strukturdaten (das Schema-Kommentar „NICHT abweichen — UI-Cards hängen dran" verrät die Fragilität).

**Fazit:** temoa-audit ist die beste **Spezifikation, WAS eine Listing-Analyse ausgeben soll** (Schemas, Audit-Dimensionen, Onepager-Narrativ, Profit-Hebel-Logik, Bild-Brief + Validierungsregeln). Es ist eine schwache **Umsetzung** (LLM-Skills über gescrapte Daten, keine Validierung). → Struktur portieren, Code nicht.

## Redundanz-Warnung (das Hauptrisiko)

Gleiche Logik liegt heute mehrfach: **Listing-Generierung** (seo-os-webapp + temoa-os), **Reporting/KPIs** (reporting-main + temoa-os/apps/reporting + Temoa-os SOV), **Campaign** (apps/campaign + temoa-os). Im Neubau gilt: **eine Quelle der Wahrheit pro Fähigkeit.** Auswahl oben ist bewusst getroffen (temoa-os für Generierung/Campaign/Reviews, reporting-main für Analyse-Engine).
