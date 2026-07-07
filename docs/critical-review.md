# Kritischer Projekt-Review (2026-07-07)

> Vollständiger Stress-Test des Projekts vor Baubeginn: alle 7 Quellen, alle Docs, alle 30 Entscheidungen. Ergebnis: Architektur hält, aber 5 strukturelle Risiken + Korrekturvorschläge. Punkte R1–R5 wurden dem Nutzer zur Entscheidung vorgelegt.

## Bestätigt (hält dem Stress-Test stand)

3-Layer-Architektur · „LLM generiert, Code erzwingt" · Import-First/API-Ready · Katalog als Rückgrat + Produkt-Tabs · Portierungs-Auswahl (SQP-Engine, buildPrompt+Byte-Enforcement, Presets, Parser). Empirisch gestützt durch temoa-audit: das Bestandstool scheitert exakt dort, wo diese Prinzipien fehlen.

## R1 — Scope-Inflation (unentschiedener Konflikt)

Jede Iteration hat Scope addiert, keine gestrichen. Der eigene Leitsatz „so einfach wie möglich" widerspricht dem 6-Säulen-Vollumfang. **Korrektur:** explizite **Nicht-Ziele-Liste für v1**: kein Market Share, keine Forecasts, kein Lagerbestand, kein API-Write-back, keine Custom Dashboards. Zielbild bleibt; v1 wird geschützt.

## R2 — Datenbeschaffung ist das ungelöste Problem, nicht Berechnung

- KPI-Berechnung: gelöst (portierbar). **Listing-Scraping: ungelöst** — Amazon blockt aktiv (Beweis: temoa-audits 4-stufige Fallback-Kaskade bis Google-Cache, `confidence: low` → daher die Fehler im Audit).
- **Market Share à la ROPT ist eine Datenquellen-Frage, keine Code-Frage.** Wir haben keine Quelle.
- **Korrektur:** (a) **Scrape-Spike** vor Kundenversprechen: Apify-Listing-Actor auf ~20 echten Kunden-ASINs testen (inkl. Bilder), Erfolgsquote messen. (b) Ehrlicher v1-Fallback: Listing-Daten per **Helium-10-Bundle-Upload** (Muster aus temoa-audit), geführt. (c) Market Share → Nicht-Ziele bis Datenquelle existiert.

## R3 — Qualitäts-These ohne Mess-Instrument (größte Lücke)

Kern-Schmerz des Nutzers = Content-Qualität. SPEC+VALIDATION fangen *formale* Fehler, beweisen aber keine *Verkaufsqualität*. Ohne Messung wiederholt sich „Output ist nicht gut" beim eigenen Tool. **Korrektur:** **Eval-Harness als gleichrangiger Teil der ersten Scheibe**: 10–15 Golden-ASINs aus echten Kundenprojekten mit den besten manuell erstellten Listings als Referenz; jeder Lauf wird gescort (deterministische Checks + Rubrik + Experten-Urteil). Kundenfreigabe erst, wenn Tool-Output die Handarbeit erreicht/schlägt. Gilt auch für Modellwechsel (siehe R6-Caveat).

## R4 — Score-Fassade 2.0 vermeiden

Titel/Bullets/Backend: deterministisch prüfbar. Bilder/A+/Brand Story: zwangsläufig Vision-/Rubrik-Urteil = automatisierte Subjektivität. **Korrektur:** Score weist **pro Dimension die Evidenz-Klasse** aus: `deterministisch` (gemessen) · `regelbasiert-LLM` (Rubrik + Konfidenz) · `manuell` (Experte). Transparent statt Fassade; verkauft sich im Kundengespräch besser.

## R5 — Auth-Entscheidung D26 revidieren (Empfehlung)

Passwort = Markenname (öffentlich bekannt!) für ein Tool mit Margen/COGS/Umsätzen der Kunden = Datenleck mit Ansage — faktisch „Benutzername = Passwort". **Korrektur (einfacher zu bauen):** Agentur-Login richtig (Supabase-Auth), Kunden-Mitschauen über **unratbare Links** (produktiv erprobtes Sales-Room-Muster), optional individuelles Passwort. → Nutzer-Entscheidung ausstehend.

## R6 — Kleinere Befunde

- **D13 ist durch D20/D22 überholt** (Hauptbild-Blaupause → Text zuerst). Im Log als „superseded" markiert.
- **D30 präzisiert:** „CR vs. Markt" existiert nur SQP-aggregiert (Marke vs. Gesamtmarkt). Wettbewerber-genauer Vergleich = neue Daten + neue Logik → nicht „vorhanden".
- **LLM-Registry-Caveat:** Prompts sind modellspezifisch kalibriert (Byte-Ziele!). Registry pinnt **pro Recipe eine Modellversion**; Modellwechsel nur durchs Eval-Harness (R3), nie ad hoc.
- Offene Bringschuld Nutzer: Hauptbild-Prompt + Referenzbilder (für Bild-Phase).

## Strategische Einordnung „bestes Tool am Markt"

Falsches Ziel als Startpunkt: Feature-Breiten-Wettlauf gegen Helium 10 & Co. ist für eine Agentur nicht gewinnbar und unnötig. Das scharfe Ziel: **das beste Betriebssystem für die Amazon-Arbeit der eigenen Agentur** — kodifiziertes Wissen + eigene Prozesse als Burggraben. Externe Öffnung wird danach ein Preisschild, kein Neubau. „Bestes Tool am Markt" führt über „unschlagbar im eigenen Laden".
