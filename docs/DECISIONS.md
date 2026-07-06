# Entscheidungs-Log & Offene Fragen

> Chronologisches Log getroffener Entscheidungen + Liste offener Punkte. Fortlaufend gepflegt.

## Getroffene Entscheidungen

### 2026-07-06 — Kick-off, Materialanalyse & Grundausrichtung

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | **Greenfield-Neubau** (neues Repo `project-hail-mary`), NICHT auf temoa-os aufsetzen. | Wunsch des Nutzers. Bedingung: Kronjuwelen (SQP-Engine, buildPrompt+Byte-Enforcement) werden **portiert, nicht neu geschrieben**. |
| D2 | **Erster Meilenstein = „Listing optimieren"-Kette** (Analyse + Content, inkl. Bild). | Der Outreach-Hook; speist direkt den Sales Room. |
| D3 | **Lebendes Strategie-Dokument** unter `docs/` (STRATEGY/SALVAGE/DECISIONS). | Über Wochen fortschreibbarer Nordstern. |
| D4 | **3-Layer-Architektur** (Wissen / Daten / Module) + 2 Oberflächen (Workbench / Sales Room). | „Skills" = Wissens- & Analyse-Layer, keine getrennten Apps. |
| D5 | **Pre-Launch- und Post-Launch-Regime trennen** (Cerebro/Potenzial vs. Amazon-Reports/Ist). | Zwei verschiedene Daten-Regime; getrennt sind beide stärker. |
| D6 | **Eine Quelle der Wahrheit pro Fähigkeit.** | Fragmentierung über 4 Repos ist das Hauptrisiko. |

## Offene Fragen (zu klären, bevor Phase 1 startet)

1. **Tech-Stack des Neubaus?** Next.js (wie sales-room/reporting) oder Vite+React (wie temoa-os)? Empfehlung folgt — beeinflusst, wie leicht sich Engines portieren lassen.
2. **Listing-Scrape:** Über welchen Weg holen wir Titel/Bullets/Beschreibung/**Bilder** einer ASIN? Apify (welcher Actor?)? Eigenes? Rechtlicher Rahmen?
3. **Persistenz:** DB (Postgres/Turso) vs. JSON-Blob. Bei Multi-Kunde/Multi-Periode ist eine echte DB nötig.
4. **Hard-Specs-Datei:** Welche Amazon-Kategorien priorisieren? Quelle für aktuelle Limits (offizielle Amazon-Doku vs. Erfahrungswerte)?
5. **Score-Modell:** Behalten wir die 6 Faktoren (SEO/GEO, Bilder, Video, A+, Brand Store, Brand Story) oder definieren wir das Score-Modell für den echten Engine neu? Gewichtung?
6. **Bild-Analyse:** Welches Vision-Modell, welche Prüfkriterien (Reihenfolge-Logik, USP-Inszenierung, Mobile-Lesbarkeit)?
7. **Legal/DSGVO für Review-Scraping:** Rahmen für internen vs. kundenseitigen Einsatz.
8. **Report-Upload-UX:** Step-by-step-geführter Upload, wenn Berichte (Cerebro, Amazon-Bulk, Review-Scrapes) manuell nötig sind. Welche Berichte sind Pflicht pro Modul?

## Ideen-Parkplatz (später)

- Multi-Marktplatz (heute DE-only im Scrape).
- API-Adapter statt CSV (SP-API / Ads-API).
- Echtes kompetitives SOV mit Ranking-Tracking.
- Sukzessive Kunden-Freischaltung einzelner Module.
- A+-Erstellung als eigenes Modul (Nutzer erwähnt).
