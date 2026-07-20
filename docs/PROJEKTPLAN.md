# temoa OS — Projektplan

> **Status:** v1, beschlossen mit Scope-Session 2026-07-20. Fortschreibung: nach jedem Sprint.
> Fundament: `docs/product-scope.md` (Scope-Session 07.07.) + realer Baustand `docs/DECISIONS.md` (D1–D103).
> **Das ist das Accountability-Dokument:** Jeder Sprint hat ein Ziel und eine prüfbare Abnahme. Gebaut wird, was hier steht — nicht, was gerade einfällt.

## 1 · Vision (ein Absatz)

**temoa OS ist das interne Amazon-Betriebssystem der Agentur:** Alle verstreuten Datenquellen (Seller Central, Ads-Konsole, Helium 10, Reviews, Listings) fließen in EIN Tool, das sie in priorisierte Maßnahmen und fertigen Content übersetzt — vom Account bis zur ASIN. Jede Zahl trägt Formel und Quelle (Anti-Blackbox), jeder generierte Text besteht ein deterministisches Prüf-Gate („LLM generiert, Code erzwingt"), keine Fassaden-Daten. Zuerst intern für die Kundenbetreuung; Kunden-Accounts und Monetarisierung sind Zielbild, nicht v1.

## 2 · Die sechs Säulen und ihr Ist-Stand

Status: ✅ fertig & im Einsatz · 🔶 teilweise · ⬜ offen · 🔒 blockiert (braucht Input/Quelle)

| # | Säule | Fertig ✅ | Teilweise 🔶 / Offen ⬜ / Blockiert 🔒 |
|---|---|---|---|
| 1 | **Performance & Wirtschaftlichkeit** | Cockpit (KPI-Kacheln, Trend-Linien, Ampel), Business-/Ads-Parser, Perioden-Diagnose, Margen-Rechner + Break-even-ACoS, Gebühren-Update per PDF | ⬜ Retourenquote (braucht Retouren-/Payments-Bericht) · ⬜ Forecasts, Lagerbestand (v1-Nicht-Ziel) |
| 2 | **Sichtbarkeit & Wettbewerb** | SOV-Audit aus Cerebro (Quick-Wins, Umsatzlücken, Opportunity), Keyword-Basis mit Relevanz-Filter (Marken/Maße/Anzahl/Farbe/Form), Tiering, Merge/Löschen | ⬜ SQP-Szenario-Rechner · ⬜ Market Share/Pricing (v1-Nicht-Ziel, keine Datenquelle) |
| 3 | **Content-AI** | Titel/Bullets/Highlights/Backend/Beschreibung/Q&A mit Validation-Gate, Begründungspflicht, Fremdmarken-Blacklist, Review-Insights im Prompt; Flat-File-Vorlagen | 🔒 Bilder (Haupt/Listing/A+) — braucht euer Hauptbild-Prompt + Quellen-Doku · ⬜ Content-Performance-Monitoring (hilft die Titeländerung?) |
| 4 | **Listing-Diagnose** | Tiefen-Audit (8 Dimensionen, Fakten abgeleitet statt getippt), Analyse-Seite, Bild-Briefs | ⬜ Bild-Audit (visuelle Prüfung) · 🔶 Score-Verdichtung |
| 5 | **Advertising / PPC** | Search-Term-Report (Wasted Spend, Negativ-Kandidaten, N-Grams), Ziel-ACoS aus Portfolios, Überspend-Hebel | ⬜ Kampagnen-Templates → Upload · ⬜ Gebots-/Negativ-Empfehlungen als Workflow |
| 6 | **Reviews / Voice of Customer** | Scrape je ASIN × Sterne-Klasse (ASIN-Chips, ehrliche Ausbeute), Findings-Dashboard (Pain Points, Kaufauslöser, O-Töne), fließt in Content & Briefs | 🔒 Review-Actor ersetzen — Axesso liefert zu wenig; braucht von euch Actor-Name + Input-JSON (Env vorbereitet) |
| — | **Intelligenz-Schicht** (über allen Säulen) | Handlungs-Hebel in € je Maßnahme, Maßnahmen-Status | ⬜ AI-Advisor (Actions nach Uplift sortiert) · ⬜ Alerts (Buybox, Ausreißer, Policy-Änderungen) · ⬜ Market Intelligence (Kontext: Prime Day, Saison) |
| — | **Fundament** | Auth + Team, Marken/Produkte, Fehlercode-Popups, globale Fehler-Grenze, Daten & Formeln (Anti-Blackbox-Register), Demo-Daten, 128 Tests | ⬜ Marketplace-Switcher auf Markenebene · ⬜ kategoriedynamische Fakten-Felder · ⬜ SP-API-Adapter („Import-First, API-Ready") |

## 3 · Sprint-Plan

Rhythmus: **1 Woche pro Sprint**, ein Outcome pro Sprint. Abnahme = der beschriebene Test gelingt klickend im Tool, ohne Fehlercode. Reihenfolge 3–6 ist Vorschlag — wird je Sprint-Wechsel gemeinsam bestätigt.

| Sprint | Outcome (das können wir danach) | Inhalt | Abnahme-Test |
|---|---|---|---|
| **S1 — Optimizer verlässlich** | Ein echtes Kundenprodukt wird komplett durchoptimiert, ohne dass irgendwo etwas hakt | 🔒 Review-Actor tauschen (euer Input!), End-zu-End-Härtung Werkbank (Import → Keywords → Reviews → Audit → Content → Flat File), Restfehler aus dem Praxistest | 3 echte ASINs von Import bis freigegebenem Content ohne Fehlercode; Review-Ausbeute plausibel vs. Amazon-Seite |
| **S2 — Monats-Rhythmus Reporting** | Der Monatsbericht eines Kunden entsteht komplett im Tool | Retouren-/Payments-Bericht + Retourenquote, SQP-Szenario-Rechner, Berichts-Workflow glätten (geführter Monats-Upload) | Ein kompletter Kundenmonat (Business + Ads + SQP + Retouren) hochgeladen → Cockpit, Diagnose und Hebel-Liste stimmen mit Handrechnung überein |
| **S3 — Content Phase 2: Bilder & A+** | Bild-Briefs werden zu fertigen Bild-Prompts; A+ wird generiert wie Bullets | 🔒 braucht Quellen: euer Hauptbild-Prompt + A+-Regeln (Blogtexte reichen — D97-Weg), dann: Prompt-Recipes + Gates wie bei Texten | Für 1 Produkt: Hauptbild-Prompt + A+-Modul-Entwürfe aus echten Daten (Keywords, USPs, Pain Points), regelkonform geprüft |
| **S4 — Intelligenz-Schicht v1** | Das Tool sagt pro Marke die 3 wichtigsten Maßnahmen mit €-Hebel | AI-Advisor (bestehende Hebel nach Uplift priorisiert + begründet), Alerts v1 (Ausreißer zwischen Perioden, Buybox-Einbruch aus Business-Report) | Advisor nennt für eine Demo-Marke 3 Maßnahmen; jede trägt Quelle, Formel und €-Korridor; Alert feuert auf präparierten Ausreißer |
| **S5 — PPC-Ausbau** | Search-Term-Findings werden zu umsetzbaren Kampagnen-Änderungen | Negativ-/Gebots-Empfehlungen als Checkliste mit Export, Kampagnen-Templates (Struktur-Vorschlag aus Keyword-Tiering) | Aus einem echten Search-Term-Report entsteht eine Negativliste + Struktur-Vorschlag, exportierbar für die Ads-Konsole |
| **S6 — Skalierung** | Mehrere Marktplätze, weniger Handarbeit | Marketplace-Switcher (Markenebene), kategoriedynamische Fakten-Felder, SP-API-Spike (getMyFeesEstimate als erster Adapter) | Ein Produkt auf amazon.fr angelegt und importiert; Gebühren-Schätzung per API gegen PDF-Tabellen geprüft |

## 4 · Arbeitsregeln (gelten in jedem Sprint)

1. **Keine Annahmen ohne Herleitung** (D92): Parser, Kategorisierungen und Content-Regeln nur mit echter Beispieldatei bzw. Quellen-Dokument. Blockiert = ehrlich 🔒, nicht improvisiert.
2. **LLM generiert, Code erzwingt:** Jede LLM-Antwort läuft durch erzwingende Normalisierung + deterministisches Gate (D103).
3. **Ehrliche Daten:** keine Fassaden-Scores, Stichprobe ≠ Gesamtzahl wird ausgewiesen, Regeln filtern nicht ohne bekanntes Produkt-Attribut.
4. **Jeder Fehler als Popup mit Fehlercode** (D101), nie eine nackte Fehlerseite; jede Aktion nur klickbar, wenn sie Neues erzeugen kann (D79).
5. **Anti-Blackbox:** Neue Formel/Regel ⇒ Eintrag in Daten & Formeln im selben Commit.
6. **Ein Feature = ein Commit** mit Tests; DECISIONS.md wird fortgeschrieben.

## 5 · Was das Tool bewusst NICHT verspricht (v1)

Market-Share-/Pricing-Intelligence, Forecasts, Lagerbestand, API-Write-back zu Amazon, Custom Dashboards, externe Kunden-Accounts/Abrechnung, Multi-Marktplatz jenseits DE (bis S6). Bleibt Zielbild — blockiert nichts.

## 6 · Offene Entscheidungen (bei dir)

| # | Entscheidung | Blockiert |
|---|---|---|
| E1 | Review-Actor: Name + Beispiel-Input-JSON (wie beim Listing-Crawler) | S1 |
| E2 | Hauptbild-Prompt + A+-/Bild-Regeln als Quellen-Material | S3 |
| E3 | Tier-Schnitte 3/13/18 und Cluster-Gewichte bestätigen oder ändern (D92) | — |
| E4 | Sprint-Reihenfolge S3–S6 bestätigen oder umsortieren | Planung |
