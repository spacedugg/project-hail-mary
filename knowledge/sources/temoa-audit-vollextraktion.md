# temoa-audit — 100%-Vollextraktion (Ergänzung zur Kern-Analyse)

Quelle: `/tmp/claude-0/-home-user-project-hail-mary/bee7ab2f-42c9-5778-8c25-1cc058d0aeb1/scratchpad/extracted/temoaaudit/temoa-audit-main/`
Stand der Durchsicht: 2026-07-07. Alle Datei:Zeile-Angaben beziehen sich auf dieses Verzeichnis.

---

## 1. Vollständigkeits-Nachweis

Alle 14 Dateien des Repos wurden vollständig gelesen:

| Datei | Zeilen | Status |
|---|---:|---|
| `.claude/skills/temoa-listing-generator/SKILL.md` | — | bereits in Kern-Analyse (8-Dim-Audit, review-insights, image-brief, composite-spec, Reference-Fidelity-Lock, Spelling-Risk) |
| `skills/references/sov_calculator.py` | 658 | ✅ komplett, Formelwerk unten |
| `web/app.py` | 2698 | ✅ komplett (3 Inline-Templates + alle Routen) |
| `web/templates/onepager.html.j2` | 670 | ✅ komplett, alle Sektionen unten |
| `README.md` | 116 | ✅ |
| `CLAUDE.md` | 85 | ✅ |
| `.env.example` | 4 | ✅ |
| `Dockerfile` | 73 | ✅ |
| `fly.toml` | 41 | ✅ |
| `.claude/skills/.archived-temoa-image-generator/SKILL.md` | 194 | ✅ |
| `image_gen.py.unused` | 175 | ✅ |
| `requirements.txt` | 6 | ✅ |
| `.gitmodules` | 3 | ✅ |
| `.gitignore` | 36 | ✅ |

---

## 2. sov_calculator.py — Das komplette Formelwerk

CLI: `python3 -m steps.sov cerebro.csv --avg-price 80 [--main-asin B0…] [--out audit.json]` (sov_calculator.py:8, 503–536). Wird von `web/app.py` als Modul importiert (app.py:24–30).

### 2.1 CTR-Kurve — vollständig (sov_calculator.py:31–47)

Eigene Kurve, „konservativer als reines Top-3-Modell" wegen Sponsored/A+/Recos (Kommentar Z.28–30).

**Positionen 1–10 (hart kodiert, Z.31–35):**

| Pos | CTR | Pos | CTR |
|---|---|---|---|
| 1 | 0.20 | 6 | 0.040 |
| 2 | 0.13 | 7 | 0.033 |
| 3 | 0.095 | 8 | 0.027 |
| 4 | 0.070 | 9 | 0.022 |
| 5 | 0.052 | 10 | 0.018 |

**Positionen 11–20** (Z.37–38): `0.015 − i·0.0008` → 11: 0.015, 12: 0.0142, 13: 0.0134, 14: 0.0126, 15: 0.0118, 16: 0.011, 17: 0.0102, 18: 0.0094, 19: 0.0086, 20: 0.0078
**Positionen 21–30** (Z.40–41): `0.007 − i·0.00045` → 21: 0.007, 22: 0.00655, 23: 0.0061, 24: 0.00565, 25: 0.0052, 26: 0.00475, 27: 0.0043, 28: 0.00385, 29: 0.0034, 30: 0.00295
**Positionen 31–50** (Z.42–44): `0.002 − i·0.00005` → 31: 0.002 … 50: 0.00105
**Positionen 51–306** (Z.46–47): pauschal 0.0008
**Rank > 306, None oder ≤ 0** → CTR 0.0 (`ctr_for`, Z.57–62; Dict-Fallback 0.0005 praktisch unerreichbar)

**`TOP10_CTR_POOL` = Summe Pos 1–10 = 0.687** (Z.51). ⚠️ Der Code-Kommentar (Z.30) behauptet „Summe Top-10 ≈ 0.78" — der tatsächliche Wert ist 0.687. Kommentar veraltet, Code maßgeblich.

**`DEFAULT_CONV_RATE = 0.07`** (Z.54) — wird auf das Suchvolumen angewandt, wenn Cerebro-Spalte „Keyword Sales" fehlt.

### 2.2 CSV-Schema (Z.88–98)

Helium-10-Cerebro-DE-Export: `Keyword Phrase`, `Search Volume`, `Keyword Sales`, `CPR`, `Title Density`, `Position (Rank)`, `Competitor Rank (avg)`, `Ranking Competitors (count)`. Konkurrenz-Spalten werden per Header-Regex `^B[0-9A-Z]{9}$` erkannt (Z.98–102); Main-ASIN aus dem Dateinamen via `_(B[0-9A-Z]{9})_` (Z.105–107). Zahlen-Parsing toleriert deutsches Komma (Z.65–80).

### 2.3 Zwei-Pool-Modell: Shares & Revenue-Gap (`compute_shares_and_gaps`, Z.167–209)

Pro Keyword-Zeile:

- **Pool 1 (SOV-Bars):** `player_pool = main_ctr + Σ comp_ctrs` — nur die getrackten Player, addiert sich zu 100 %. `main_share = main_ctr / player_pool` (Z.173–183).
- **Leader** = getrackter Konkurrent mit niedrigstem (bestem) Rank (Z.185–197); `leader_share = leader_ctr / player_pool`.
- **Pool 2 (€-Gap):** gegen `TOP10_CTR_POOL` (0.687), weil Sales an alle Top-Plätze fließen (Kommentar Z.199–200).

**Revenue-Gap-Formel (Z.201–209):**
```
total_sales      = kw_sales                    (wenn Cerebro „Keyword Sales" > 0)
                 = sv × 0.07                   (sonst)
main_sales_share = main_ctr   / 0.687
leader_share     = leader_ctr / 0.687
monthly_gap_eur  = −round((leader_share − main_sales_share) × total_sales × avg_price)
```
Negativ = wir verlieren gegen den Leader. Default-`avg_price` im CLI 80 €, in der Web-UI 45 €.

### 2.4 Brand-SOV & Konkurrenz-SOV (Z.212–250)

- **Brand SOV** = SV-gewichtetes Mittel von `main_share` über alle KWs mit SV > 0: `Σ(main_share·sv) / Σ sv × 100`, auf 1 Dezimale (Z.212–223).
- **`compute_competitor_sov`**: gleiche SV-Gewichtung pro getracktem ASIN (`comp_ctr/total_ctr_in_pool` gewichtet mit SV), Main zuerst als `{"asin":"main","label":"Main ASIN","is_main":true}`, dann absteigend nach pct sortiert (Z.226–250).

### 2.5 Keyword-Tags (`tag_row`, Z.253–263)

| Bedingung | Tag |
|---|---|
| kein Rank, SV ≥ 500 | **Reach** |
| kein Rank, SV < 500 | **Saturated** |
| Rank ≤ 10 | **Defense / Scale** |
| Rank ≤ 30 | **Near-Win** |
| Rank ≤ 60 | **Stretch** |
| Rank > 60 | **Long-Shot** |

### 2.6 Quick-Win-Score — exakte Gewichte (Z.266–314)

Composite 0–100:
```
score = 30·rank_score + 20·sv_score + 15·td_score + 15·cpr_score
      + 10·(relevance/100) + 10·(content_fit/100)
```
- **rank_score** (Rank-Proximity): Rank 0 → 0; ≤10 → **0.6** („schon oben — Quick-Win für andere KWs spannender"); ≤20 → **1.0**; ≤30 → **0.9**; ≤50 → 0.5; ≤100 → 0.2; sonst/kein Rank → 0.05
- **sv_score**: `min(log10(sv) / log10(30000), 1.0)` — log-normalisiert auf 30k
- **td_score** (Title Density, niedrig = wenig Title-Konkurrenz): `max(0, 1 − td/50)`, Default td = 30 wenn fehlend
- **cpr_score** (CPR niedrig = wenig Sales zum Aufstieg nötig): `max(0, 1 − cpr/100)`, Default cpr = 50
- **relevance** und **content_fit**: beide Default 70 („später User-tunable")

Ergebnis geclamped auf [0,100], gerundet.

### 2.7 Quick-Win-Auswahl & weitere Kriterien

- **Quick-Wins** (build_audit, Z.460–468): Pool = Tags `Near-Win` **oder** `Stretch`, absteigend nach QW-Score, **Top 10**. Jeder mit fixem Action-Text: „Integrate keyword intent into listing content, add to exact/phrase campaign, monitor rank over 14–30 days."
- **Invisible-KWs** (`invisible_high_sv`, Z.323–333): `main_rank` None/≤0/>306 **und** `sv ≥ 500` (Default `min_sv=500`); sortiert nach SV absteigend; Felder: keyword, sv, cpr, leader_rank, leader_asin.
- **Keywords-Ranked-Zählung** (Z.317–320): Rank vorhanden und 0 < rank ≤ 306.

### 2.8 Opportunity-Korridor (Z.336–343)

```
losses = Σ aller |negativen| monthly_gap_eur
korridor = (round(losses × 0.4), round(losses × 1.0))   # (low, high)
```
⚠️ Zweiter Kommentar/Code-Widerspruch: Kommentar sagt „Range: 60% (konservativ) bis 100%", der Code multipliziert mit **0.4**. Es gibt keinen „base"-Wert — nur low/high (2er-Tupel `est_monthly_opportunity_eur`).

### 2.9 Outreach-Hook (Z.346–375)

Englischer Cold-Mail-Baustein direkt im audit.json: „Hey {Name}, We analysed your niche…", Hook-Varianten je nachdem ob Invisible-KWs existieren, dann „leaking approximately **€low–€high/month**", plus Markdown-Tabelle der Top-5-Gaps (Keyword | SV | Your Rank | Leader Rank | Monthly Gap). Tausendertrennzeichen per `replace(",", ".")` eingedeutscht.

### 2.10 Executive-Summary-Logik (Z.378–422)

1. Wenn `ANTHROPIC_API_KEY` gesetzt: Claude-API-Call, Modell **`claude-sonnet-4-5`**, max_tokens 400. Prompt: „Du bist Amazon-Marketplace-Analyst. Schreib ein faktisches Executive Summary (1 Absatz, ~4-6 Sätze, deutsche Geschäftssprache, kein Marketing-Sprech) … Konkret bleiben, kein Bullshit-Bingo, Bezug auf die Zahlen." Übergeben werden: Brand SOV, ranked/total, Invisible-Count, Opportunity-Range, Near-Win-Anzahl, Top-3-Gaps mit Rank + €/Mo.
2. Fallback-Template (Z.415–422): fester deutscher Absatz mit denselben Zahlen + Standard-Empfehlung „A+-Content und Backend-Keyword-Audit für die Top-3-Themen-Cluster, gefolgt von Konversions-Optimierung".

### 2.11 audit.json-Schema (`build_audit`, Z.429–496)

`schema_version: 1`, `csv_source`, `main_asin` (Override > Dateiname > "unknown"), `competitor_asins`, `avg_price_eur`, `brand_sov_pct`, `keywords_ranked_count`, `keywords_total`, `invisible_high_sv_count`, `invisible_keywords`, `est_monthly_opportunity_eur: [low, high]`, `sov_breakdown`, `revenue_gaps` (aufsteigend nach gap = größter Verlust zuerst; je: keyword, sv, main_rank, leader_asin/rank, main/leader_share_pct, monthly_gap_eur, qw_score, tag, cpr), `keyword_table` (nach SV absteigend), `quick_wins`, `executive_summary`, `outreach_hook`.

### 2.12 `render_sov_markdown_block` (Z.551–654)

Deutscher Markdown-Block, wird **oben in audit.md** eingebettet (vor der 8-Dim-Score-Tabelle) und auf der Detail-Seite gerendert. Struktur:
1. `## 🎯 Share of Voice & Money on the Table` + Datenbasis-Zeile (CSV, Main-ASIN, Tracked Competitors, Avg-Price)
2. `### Executive Summary`
3. `### Kennzahlen` — 4-Zeilen-Tabelle (Brand SOV, Keywords gerankt, Unsichtbar SV≥500, 💰 Verlorene Umsätze low–high/Monat)
4. `### SOV-Verteilung (KW-volumengewichtet)` — ASCII-Balken: `bar_len = min(25, round(pct/2))`, `█`·bar_len + `░`·Rest, „← MAIN"-Marker
5. `### 💸 Top-Revenue-Gaps` — Top **8** (Keyword | SV | Wir-Rang | Leader-Rang | Gap | Tag)
6. `### ⚡ Quick-Wins (Near-Win + Stretch, nach Score)` — Top **8** (… | QW-Score **x/100** | Recovery €/Mo)
7. `### 👻 Unsichtbar trotz hohem Volume` — Top **10** (Keyword | SV | Leader-Rang | Leader-ASIN)
8. Abschluss `---` (dient als Idempotenz-Endmarker beim Re-Embed, siehe app.py:1411–1424)

€-Format via `_fmt_eur`: `€1.234` / `-€1.234` (Z.543–548).

---

## 3. onepager.html.j2 — Alle Sektionen im Detail (670 Zeilen)

Print-optimierte, helle Kundenansicht (Hintergrund `#fafaf7`, Akzent-Grün `#1f5f4a`, `meta robots noindex,nofollow`, `lang="de"`). Route: `/listing/<slug>/onepager` (+ `?name=Vorname`). Reihenfolge:

1. **Topline** (Z.292–298): „temoa"-Brandmark + „Potenzialanalyse · ASIN {asin} · {marketplace}".
2. **Persönliche Anrede** (Z.300–302): `Hi {first_name} 👋` — nur wenn `?name=` gesetzt.
3. **H1 + Lead** (Z.303–309): „{Brand} — Eure Amazon-Potenzialanalyse". Lead-Verkaufstext: „Basierend auf Helium-10-Daten, Listing-Audit und **947 Reviews**. Konkrete Zahlen, konkrete Hebel — **kein Marketing-Bullshit**." ⚠️ „947 Reviews" ist **hart kodiert** — Kunden-spezifischer Restbestand, für jeden Kunden falsch außer dem einen.
4. **KPI-Grid** (Z.312–333): Brand SOV, Keywords Ranked x/y, Est. Monthly Opportunity €low–€high (rot, Klasse `err`), Listing-Score x/100 (Farbe: <45 rot, <70 orange, sonst grün).
5. **Produkt-Card** (Z.336–348): Title, ASIN, ⭐ Rating (+Review-Count), Preis, „amazon ↗"-Link.
6. **„Euer Listing aktuell auf Amazon"** (Z.351–363): Original-Listing-Bilder aus `~/nicimages/brands/{slug}/product-images/` — nur wenn nicimages gescraped hat.
7. **Executive Summary** (Z.366–373): aus `sov-audit.json.executive_summary`.
8. **Listing-Audit x/100** (Z.376–406): SVG-Donut (Radius 44, Umfang 276.46, `stroke-dasharray = total/100·276.46`; Farbe ≥70 grün / ≥45 orange / sonst rot) + Status-Text + pro Dimension Score-Bars mit Rot→Orange→Grün-Gradient.
9. **„Das fällt uns auf"** (Z.409–423): Findings-Cards mit rotem ✕ — gespeist aus den Top-3-SOV-Revenue-Gaps (Titel: „€X/Mo Verlust bei ‚keyword'", Dimension: „Wir-Rang X vs. Leader-Rang Y · SV Z").
10. **Share of Voice · Konkurrenz-Bild** (Z.426–443): horizontale Balken, relativ zum größten Wert skaliert; Main-Zeile grün + fett. Lead: „Gewichteter Klick-Anteil gegen die drei Top-Konkurrenten in eurer Niche."
11. **Top Revenue-Gaps** (Z.446–473): Top 8, **nur negative Gaps**; roter Betrag `€X/Mo` rechts; Tag-Pill (Near-Win orange); Meta-Zeile SV · Eure Position · Leader · CPR. Lead: „Geschätzter Monats-Umsatz, der euch entgeht — basierend auf Position-Delta × Keyword-Sales."
12. **Vorher → Nachher** (Z.476–517): zweispaltig „HEUTE (Ist-Zustand)" (orange getönt) vs. „NACH OPTIMIERUNG (Empfehlung)" (grün getönt); Title + Zeichenanzahl + je 3 Bullets + Ø Zeichen/Bullet. Nur wenn `listing.json` (optimiert) **und** `listing-original.json` beide Titles haben. Lead: „Konkrete Title- und Bullet-Empfehlung auf Basis der KW-Daten + VoC + Brand-Voice."
13. **Pain Points** (Z.520–538): „Was eure Käufer kritisieren · N Pain-Points" — rote Insight-Cards: Frequenz-%, Label, „X Erwähnungen · Y% der Reviews", 1 Originalzitat, „**Vermutete Ursache:** {root_cause}". Lead: „Aus echten Reviews extrahiert…".
14. **Buying Triggers** (Z.541–558): „Was eure Käufer lieben · N Kaufauslöser" — grüne Cards, gleiche Struktur ohne Root-Cause. Lead: „Diese Themen müssen in Title, Bullets und Bildern prominent ankommen — Kunden suchen genau danach."
15. **Compliance** (Z.561–574): „N offene Punkte", Status-Pill, ⚠-Liste. Verkaufsdruck-Text: „Risiko für Suspension, Cease-and-desist oder Vertrauensverlust."
16. **VoC Legacy-Fallback** (Z.577–608): themes-Karten (loved/pain, Top 6) + bis zu 4 kursiv gesetzte Zitate mit „↳ Thema: …" — nur beim alten Datenformat.
17. **Vorschlag-Bilder** (Z.611–623): „So könnte euer Listing aussehen" — vom Betreiber hochgeladene `onepager-images/`; Lead: „Bild-Vorschläge basierend auf VoC-Daten + Keyword-Strategie + Premium-DE-Tonalität."
18. **Quick Wins** (Z.626–653): „diese Woche umsetzbar" — Zeilen mit Tag/SV/Rang/CPR/„Recovery €X/Mo" + grünem QW-Score-Badge (b/100-Optik).
19. **CTA** (Z.656–662, grüner Block): „**20 min Strategiegespräch — kostenlos & unverbindlich** — Wir gehen alle Hebel mit euch durch und zeigen genau, womit ihr am schnellsten den größten ROI holt. Antwortet einfach auf meine Nachricht{, first_name}."
20. **Footer** (Z.664–667): „Erstellt von temoa · Daten-Stand {Datum} · **Vertraulich — bitte nicht weiterverteilen.**"

---

## 4. web/app.py — Architektur & Flows (2698 Zeilen)

### 4.1 Grundgerüst

- Flask, Port **5153**, `.env` via python-dotenv (Z.15–19). `sov_calculator` wird aus `skills/references/` importiert (Z.24–30).
- Pfade: `listings/`, `runs/`, `runs.csv`, `NICIMAGES_BRANDS = ~/nicimages/brands` (Z.32–53). `_ensure_dir` legt Symlink-Targets an (Fly-Volume-Fix, Z.40–50).
- Drei **Inline-Templates** per `render_template_string`: `INDEX_HTML` (Dashboard, dunkles Navy `#0F1419` + temoa-Orange `#F59E0B`), `DETAIL_HTML`, `SALESROOM_PREVIEW_HTML` (hell). Nur der Onepager ist eine echte Template-Datei.
- Live-Run-Status im Prozess-Dict `RUNS = {asin: {status, log[], started}}` mit Lock (Z.55–57).

### 4.2 Routen-Übersicht

| Route | Zweck |
|---|---|
| `GET /` | Dashboard: Run-Formular (ASIN/URL + Mode A/B/C + 4 Upload-Slots) + Listings-Tabelle + 6-Schritte-Hilfe-Modal |
| `POST /run` | Uploads speichern, Cerebro-SOV **vorab** rechnen, Claude-Pipeline im Thread starten |
| `GET /listing/<slug>` | Detail-Seite: Live-Log (3s-Auto-Refresh), alle Artefakt-Karten |
| `POST /listing/<slug>/upload-cerebro` | SOV neu rechnen + `sov-audit.json` + SOV-Block idempotent in `audit.md` einbetten |
| `POST …/upload-images`, `POST …/delete-image/<f>` | Onepager-Bilder (max jpg/png/webp/gif, auto-nummeriert `img-01…`) |
| `POST …/upload-datasheet`, `POST …/delete-datasheet/<f>` | Compliance-PDFs; Delete-Routen mit Pfad-Traversal-Check |
| `GET /listing/<slug>/onepager` | Onepager rendern (op-Objekt, s.u.) |
| `GET /onepager-images/…`, `/listing-images/…`, `/datasheets/…`, `/raw/<slug>/<rel>` | Statisches Serving (listing-images aus `~/nicimages/brands/<slug>/product-images/`) |
| `GET /api/runs` | Run-Status JSON |
| `GET /listing/<slug>/salesroom-preview` | Visuelle Vorschau der Salesroom-Daten (ohne Auth) |
| `GET /api/salesroom/<slug>.json` | Widget-JSON für externen Salesroom-Builder (Token + CORS `*` + Cache 300 s) |

### 4.3 Claude-Pipeline (`run_claude_pipeline`, Z.153–244)

Headless-Aufruf: `claude -p <prompt> --permission-mode bypassPermissions --output-format stream-json --verbose` als Subprocess in Hintergrund-Thread; stream-json-Events werden zu Log-Zeilen formatiert (`⚙ init`, `💬 Text`, `🔧 Tool(preview)`, `↳ Ergebnis`, `✅ done — turns/s/$`; Z.103–150). Prompts pro Mode:
- **A audit**: „Nutze den Skill 'temoa-listing-generator' … (Mode A: Audit + Optimize) für ASIN {asin}. Marketplace: amazon.de. Tone: Luxury. … inklusive Phase 6 image-brief.md."
- **B create** / **C competitors** analog mit Specs/Wettbewerber-ASINs.
- **CSV-Hints** werden angehängt (Z.160–178): Helium10-Bundle-Mapping (`ASIN_comparison_summary*.csv → listing-original.json (PRIMARY)`, `Competitor_Analysis* → competitors.json`, `Keyword_Analysis* → keywords.json`, `Listing_Score* → audit.md-Dimension`, eigene JSON direkt) + Anweisung „KEINE '(vermutet)'-Marker im Audit, da harte Daten vorhanden. confidence: high." Reviews-CSV → „PRIMARY review source, Web-Search nur Validierung".

### 4.4 `/run`-Datenfluss (Z.1151–1259)

1. ASIN-Parsing (auch aus `/dp/`- und `/gp/product/`-URLs); Mode B ohne ASIN → Slug aus Text.
2. **Selektiver Cleanup** vor Re-Run: Skill-Outputs werden gelöscht, User-Uploads bleiben — `KEEP_PATTERNS = reviews-uploaded.*, listing-data-uploaded.*, cerebro.csv, sov-audit.json`; `KEEP_DIRS = helium10-bundle, images, datasheets, onepager-images`.
3. Uploads: `reviews-uploaded.csv`; Helium10-Bundle (Mehrfach-Upload, alter Bundle wird ersetzt, sonst Re-Use des vorhandenen); **Cerebro-CSV wird VOR dem Hauptlauf durch `sov_calculator.build_audit` gejagt** (Default avg_price 45 €), damit `sov-audit.json` den Phase-2-Skills als Primary-KW-Pool dient; Datenblätter nach `datasheets/`.

### 4.5 `upload_cerebro` — idempotentes audit.md-Embedding (Z.1373–1427)

Schreibt `sov-audit.json`, rendert `render_sov_markdown_block` und ersetzt in `audit.md` einen evtl. vorhandenen Block zwischen Marker `## 🎯 Share of Voice & Money on the Table` und dem ersten `\n---\n`; sonst wird der Block vorangestellt bzw. audit.md neu angelegt.

### 4.6 Onepager-Datenaufbereitung (`onepager_view`, Z.1500–1641) — das `op`-Objekt

Quellen: `meta.json`, `sov-audit.json`, `listing-original.json`, `review-insights.json` (Fallback `reviews-mining.json`), `listing.json`, `compliance.json`, `helium10-bundle/Listing_Score*.csv`, `onepager-images/`, nicimages-`product-images/`.

Felder: `asin`, `marketplace` (Default amazon.de), `brand`/`title`/`url`/`price`/`rating`/`reviews_count` (meta → original → reviews.stats), `first_name` (Query `?name=`), `generated_at` (UTC-Datum), `sov` (komplettes audit-JSON), `listing_score` {total aus Listing_Score-CSV Zelle [1][1]; Status: <70 „Optimierungsbedarf", <85 „Solide", sonst „Stark"; rows bleiben leer}, `executive_summary` (aus sov), `quick_wins` (Top 6), `voc.quotes` (Top 6 aus `language_to_borrow_from_real_reviews`, sonst je 2 Quotes der Top-3-Pain-Points), `findings` (Top-3-Revenue-Gaps), `admin_images`, `listing_images`, `original`/`optimized` (Title, je 3 Bullets, Char-Counts), `pain_points` (Top 5), `buying_triggers` (Top 5), `compliance_status` + `compliance_open_items` (Top 5, dict- oder string-Schema).

### 4.7 Auth & Deployment

- **HTTP-Basic-Auth** optional via `TEMOAAUDIT_AUTH_USER`/`_PASS`; **ausgenommen**: `/api/salesroom/*` und `*/salesroom-preview` (bewusst öffentlich für Builder/„Chef"; Z.1110–1127). Salesroom-API zusätzlich per `TEMOAAUDIT_SALESROOM_TOKEN` + `?key=` absicherbar; Antwort mit `Access-Control-Allow-Origin: *` und `Cache-Control: public, max-age=300`.
- **Dockerfile**: Multi-Stage node:20-slim (installiert `@anthropic-ai/claude-code` global) → python:3.12-slim; claude-CLI wird rüberkopiert. `listings/`+`runs/` als Symlinks auf Fly-Volume `/data`. **Non-Root-User `app`, weil die claude-CLI sich weigert, `--dangerously-skip-permissions` als root zu laufen**; Entrypoint chownt `/data` zur Laufzeit per sudoers-Regel nur für `/bin/chown`. Gunicorn: 1 Worker, 4 Threads, **Timeout 600 s** („Claude-Pipeline kann 8 min laufen").
- **fly.toml**: App `temoa-audit`, Region `fra`, Volume `temoaaudit_data` → `/data`, `auto_stop_machines = off`, `min_machines_running = 1`, shared-cpu-1x / 1 GB.
- **requirements.txt**: flask, python-dotenv, markdown, gunicorn, **gspread + google-auth** (optionale Google-Sheets-Integration, laut README nur mit `GOOGLE_CREDENTIALS`-Secret).
- **.gitmodules**: `skills/nexscope` → `https://github.com/nexscope-ai/Amazon-Skills.git` (50 MIT-Skills als Symlink-Farm in `.claude/skills/`).
- **.env.example**: nur `FAL_KEY` (für nicimages); `ANTHROPIC_API_KEY` läuft über Claude Code direkt.

### 4.8 Salesroom-Payload (`_build_salesroom_payload`, Z.1680–2237) — zweiter Sales-Kanal

Kompakte „look-ready" Widget-JSON für einen externen Salesroom-Builder:

- **`audit_score`**: Helium10-Listing_Score-Total; Status ok ≥ 80 / warn ≥ 55 / critical; Taglines „Stark — wenig Hebel" / „Solide, Luft nach oben" / „Optimierungsbedarf".
- **`money_on_table`**: nur wenn `opp[1] > 0` (kein 0–0-Platzhalter); Status critical > 2000 € / warn > 500 €; Tagline „Verloren an Konkurrenten · Schätzung über N KW".
- **`sov_bar`**: nur wenn ≥ 2 Player mit pct > 0 („Eure Marke" für Main).
- **`strengths`** („Das macht ihr gut", max 5): primär aus **Helium10-Yes/No-Flags** der Listing_Score-CSV — 12 Flag-Mappings mit deutschen Verkaufstexten (z.B. „Title contains 150+ characters" → „Title nutzt das Suchvolumen-Potential… Amazons 200er-Limit voll ausgeschöpft"; „7+ images", „Includes video", „20+ reviews" → „Social-Proof-Schwelle", „4+ average star ratings"). **Fallback-Heuristiken** ohne CSV: Title 140–200 Zeichen, 5 Bullets, Ø ≥ 150 Zeichen/Bullet, Description ≥ 500, ≥ 6 Bilder, Rating ≥ 4.3 bei ≥ 50 Reviews. Zusätzlich immer: **Trust-Marker-Scan im Title** (Dict: zertifiziert/TÜV/EN-ISO/OEKO/CE/Made in Germany/BPA/vegan/nachhaltig/recycelt/FSC/ISO), Niche-Score ≥ 7/10, Marge ≥ 25 %, Monatsumsatz ≥ 5000 € („jede %-Verbesserung greift sofort"), Compliance sauber, Brand-SOV ≥ 30 % → „Marktführer in der Keyword-Nische", H10-Score ≥ 7.0 → „Top-Quartil".
- **`improvements`** („Mit X verbessern wir eure Performance, weil Y", max 4): Top-2-Pain-Points mit **quantifiziertem Versprechen** „Conversion-Lift potenziell min(freq,12)–min(freq+5,18)%"; Top-2-Quick-Wins mit echtem Gap („€X/Mo Recovery wenn wir in Top-3 kommen"); Money-on-Table-Sammelpitch „**~50% Recovery in 60–90 Tagen realistisch = +€min/2–€max/2/Mo**"; Invisible-KWs ≥ 3 → Backend-KW-Pitch („Erstes Ranking auf min(n,5)–min(n,8) Keywords innerhalb 30 Tagen"); offene Compliance-Punkte → „Suspension-Risiko sinkt von relevant auf vernachlässigbar".
- **`concrete_recommendations`**: Regex-Parser über `audit.md` — splittet an `### Dimension N:`, extrahiert Score aus Header (`— 5/10`) oder `**Score:**`-Zeile, Action aus `**Action:**`/`**Empfehlung:**`-Block; Status critical ≤ 4 / warn ≤ 7 / ok; sortiert niedrigster Score zuerst (= größter Hebel), Top 4; Markdown → HTML für Expand.
- **Kompat-Widgets**: `was_laeuft_gut` (Buying Triggers Top 3), `was_besser` (Pain Points Top 3), `vorher_nachher` (Title + 3 Bullet-Paare), `quick_wins` (Top 3), `facts` (Rating ≥ 4.3 ok, SOV ≥ 30 ok / ≥ 15 warn / sonst critical, Invisible 0 ok / < 5 warn / sonst critical, Compliance-String-Matching).

Die `salesroom-preview`-Route rendert dieselben Daten als helle Vorschau-Seite mit Banner „Diese Daten geben wir dem Salesroom-Builder" und einklappbarem Raw-JSON mit Copy-Button.

---

## 5. Archivierter Bild-Skill + image_gen.py.unused — die Bild-Evolution

Drei Generationen, dokumentiert durch die Artefakte:

**Generation 1 — `image_gen.py.unused` (automatisches Pixel-Rendering):** Liest `listings/{ASIN}/image-prompts.json` (damals vom Skill geschrieben), feuert **parallele FAL-API-Calls** (ThreadPoolExecutor, Default 4) und speichert PNGs nach `listings/{ASIN}/images/{slot:02d}-{name}.png` + `image-run.json`-Summary. **Modell-Routing per Quality-Tier** (`QUALITY_MAP`, Z.36–52): high = flux-pro/v1.1, ideogram/v3, gpt-image-1 (BYOK); medium = flux/schnell, ideogram/v2a; low = flux/schnell, ideogram/v2a-turbo. Model-spezifische Args (flux: width/height + negative_prompt; ideogram: aspect_ratio), CLI `--asin --quality --only 1,3,5 --parallel`. Kosten laut README ~2 $ / Bilderpaket, weshalb es den **ICP-Cut** gab (icp_rating == 0.0 aus temoa-pitch ⇒ Phase 5 abbrechen, „kein $2 verbrennen").

**Generation 2 — archivierter Skill `.claude/skills/.archived-temoa-image-generator/SKILL.md`:** Bereits selbst der Rückzug vom Rendering — Frontmatter: „Image-Brief-Generator (**KEIN Pixel-Rendering**) … Kein Subprocess-Call zu FAL. Kein Trigger zu nicimages." Konsolidiert alle Recherche-Outputs (listing.md, audit.md, competitors.json, keywords.json, review-insights, voice-of-customer, shotlist.md) zu drei Dateien: **`image-brief.md`** (copy-paste-ready), **`voc-bridge.json`** (strukturiert für UI), **`image-strategy.md`** (~30 Zeilen Reasoning „für menschliche Kontrolle"). Der Brief hat **10 fixe Sektionen**: 1 Produkt-Wahrheit (neuer Title + Bullets verbatim, „überschreibt Original-Listing"), 2 Top-3-Audit-Findings mit „Bild-Konsequenz", 3 Shotlist gemappt auf nicimages-Templates T1–T7 (T1 Hauptbild ohne Text, T2 top-benefit, T3 big-spec-callout, T4 kit-overview, T5 use-case, T6 family-aspirational, T7 trust-quality; je Headline verbatim + Borrowed Phrase), 4 Differentiation-Hooks vs. Konkurrenz (**ohne Markennamen** — Amazon-TOS), 5 Pain Points als Szene-Ideen, 6 Borrowed Phrases verbatim, 7 Sprache zum VERMEIDEN (keine englischen Marketing-Begriffe wie „LIFESPAN"), 8 **ABSOLUTE FORBIDDEN** (T1 pure white, keine Konkurrenz-Marken, kein englischer Text, kein erfundenes Klein-Print, keine Third-Party-Badges wie „Stiftung Warentest/SEHR GUT 1,X/SaferBuy"), 9 Brand-Voice (Versalien-Substantiv-Headlines, Microcopy ≤ 4 Wörter, kein Punkt am Ende), 10 Wirtschafts-Kennzahlen (explizit „NICHT für die Bilder"). Plus nicimages-Einbindungs-Anleitung: Brief als `inspiration.md` → „AUTHORITATIVE, überschreibt alle nicimages-Defaults". Graceful Degradation bei fehlenden Inputs definiert.

**Generation 3 — heute:** Der eigenständige Skill wurde archiviert (Punkt-Präfix `.archived-`), weil die Brief-Generierung als **Phase 6 in den Haupt-Skill** gewandert ist (Run-Prompt in app.py:184: „inklusive Phase 6 image-brief.md"); die Detail-Seite zeigt den Brief mit „📋 Copy to Clipboard"-Button („Brief für nicimages") und rendert `voc-bridge.json` weiter.

**Warum archiviert / Lehren** (CLAUDE.md Z.7–8, 16–20): „**Nur Text/Strategie — keine Bildgenerierung.** Bilder macht der User separat in nicimages mit den Audit-Outputs als Brief-Material. … image_gen.py.unused und temoa-image-generator/ — alte Bridge-Versuche, archivierte Referenz. Nicht von Web-UI getriggert." Motive erkennbar: Kostenkontrolle (~2 $/Run), Stil-/Qualitätskontrolle durch Menschen (User fügt „Style-Preferences/Aesthetik" in nicimages hinzu), TOS-Risiken bei vollautomatischen Bildern, und Entkopplung der Tools (temoaaudit ↔ nicimages ↔ temoa-pitch als separate Werkzeuge, README „Verwandte Tools").

---

## 6. NEU gegenüber der Kern-Analyse (SKILL.md-Audit)

1. **Exaktes CTR-/Gap-Formelwerk** inkl. zweier Kommentar/Code-Widersprüche: `TOP10_CTR_POOL` ist real **0.687** (Kommentar behauptet ≈ 0.78); Opportunity-Low ist **×0.4** (Kommentar behauptet 60 %). Für Reimplementierung gilt der Code.
2. **Quick-Win-Score-Gewichte exakt**: 30/20/15/15/10/10 mit Rank-Proximity-Stufen (Sweet-Spot Rank 11–20 = 1.0; Top-10 nur 0.6), SV-log-Norm auf 30k, TD/50- und CPR/100-Inversion, Relevance/Content-Fit als feste 70er-Defaults („später User-tunable" — nie gebaut).
3. **Salesroom-Kanal komplett** (`/api/salesroom/<slug>.json` + Preview): eigenes Widget-Schema, Strengths-Engine aus Helium10-Yes-Flags mit fertigen deutschen Verkaufstexten, Improvements-Generator mit **quantifizierten Versprechen** („Conversion-Lift 5–18 %", „~50 % Recovery in 60–90 Tagen" = mechanisch halbierter Opportunity-Korridor) und einem Regex-Parser, der audit.md-Dimensionen in Pitch-Karten verwandelt. Bewusst **ohne Basic-Auth** + CORS `*`.
4. **Hart kodierte „947 Reviews"** im Onepager-Lead (onepager.html.j2:308) — kundenindividueller Restbestand, der bei jedem anderen Kunden falsche Zahlen ausliefert.
5. **`outreach_hook`** (englischer Cold-Mail-Baustein mit Top-5-Gap-Tabelle) steckt in jedem audit.json — obwohl CLAUDE.md Outreach explizit nach `temoa-pitch` verbannt („❌ Coldmail/Outreach-Drafts").
6. **Executive Summary ruft direkt die Claude-API** (`claude-sonnet-4-5`, 400 Tokens, „kein Bullshit-Bingo"-Prompt) mit Template-Fallback — d.h. der SOV-Calculator ist nicht rein deterministisch.
7. **Betriebsdetails**: Claude-CLI headless mit `bypassPermissions` als Subprocess in der Fly-Maschine; Docker-Non-Root-Zwang (CLI verweigert Skip-Permissions als root) + sudo-chown-Entrypoint; SOV-Berechnung läuft **vor** dem Hauptlauf, damit Skills sie als Primary-KW-Pool nutzen; Re-Runs löschen Skill-Outputs, erhalten aber alle User-Uploads (KEEP-Listen).
8. **Bild-Pipeline-Historie in drei Generationen** (FAL-Direkt-Rendering → Standalone-Brief-Skill → Phase 6 im Haupt-Skill) mit dokumentierten Gründen — nützliche Blaupause für „Mensch-im-Loop statt Vollautomatik" bei Bildgenerierung.
