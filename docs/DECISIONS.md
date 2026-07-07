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
| D7 | **Skill-vs-Tool aufgelöst: deterministische Logik = Tool-Modul; Skill = dünner Wissens-/Orchestrierungs-Layer darüber.** | Bestätigt durch marketplaceadpros-Analyse: deren NL-Prompt-Choreografie um ein NL→SQL-Interface ist fragil („~1/3 Calls droppt Rows"). Formeln/Definitionen/Queries/Rendering gehören in getestete Module. |
| D8 | **Reporting/Dashboards nach „Datenkontrakt + geteiltem Template" bauen** (Logik befüllt deklarierte Daten, Template rendert deterministisch), Template als **geteilte Komponentenbibliothek**. | Übernahme des starken „Dashboard-als-Asset"-Musters, aber ohne dessen Copy-Paste-Design-System-Schwäche. |
| D9 | **Operations-Domäne (FBA/Reorder/Inventory/Experiments) NICHT in Phase 1.** Wissen gesichert, im Backlog. | Andere Domäne als Listing-Optimierung; Aufnahme wäre Scope-Creep und Fragmentierungsrisiko. |
| D10 | **Mission geschärft: Konsolidierung ist Pflicht, aber das Ziel ist ein höheres Qualitätsniveau als jedes Bestandsteil.** | Nutzer-Korrektur: Einzelteile sind auch für sich zu flach (z. B. Bild-Briefings mit USP-Wiederholung/falscher Reihenfolge). |
| D11 | **Content-Generierung als 5-Baustein-Wissenssystem** (SPEC / RECIPE / REFERENCES / GENERATION / VALIDATION). Bestandstools haben nur GENERATION → Qualitätslücke = fehlende SPEC + VALIDATION. Siehe `content-knowledge-system.md`. | „LLM schlägt vor, Code erzwingt" auch für Bilder (Cross-Asset-USP-Regel, Reihenfolge). |
| D12 | **Speicher-Split:** SPEC + RECIPE ins Repo (versioniert); REFERENCE-Bilder in Objektspeicher + DB (Metadaten, UI-pflegbar). | Binärdateien gehören nicht ins Git; nicht-technisches Team pflegt Referenzen via UI. Muster existiert schon (sales-room `referenceImages`). |
| D13 | ~~Erste Layer-1-Arbeit: Blaupause am Hauptbild~~ **SUPERSEDED durch D20/D22** (Text zuerst, Bild danach). Die Hauptbild-Dekomposition bleibt Auftakt der Bild-Phase. | Reihenfolge-Entscheidung des Nutzers überholte dies. |
| D14 | **Wahre Mission = ganzheitliche Plattform, voller Modulumfang** (Content, Analyse, Reporting, Marge, Performance-Historie, Handlung, PPC). Listing-Optimierung ist EIN Bereich. | Nutzer-Präzisierung. Visuell: `architecture-map.html`. |
| D15 | **Intern zuerst, Monetarisierung nachrangig. EIN kombinierter Bereich** (Admin + Kunde zusammengelegt), später trennbar. Kundenseitiges Auth/Feature-Gating/Abrechnung → Backlog. | Nutzer-Korrektur zu D14: Tool wird zuerst intern zur Kundenbetreuung gebaut, nicht als SaaS verkauft. Mehr-Kunden-Datenmodell bleibt (mehrere Marken intern), aber kein Kundenbereich nötig. |
| D16 | **Scope-Struktur in 3 Ebenen:** (A) 7 Modul-Säulen, (B) 2 orthogonale Dimensionen (Entity-Hierarchie Account→Brand→Land→Produktgruppe→ASIN × Zeit) als DATENMODELL, (C) Intelligenz-Schicht (AI-Advisor/Alerts/Market Intelligence) ÜBER den Säulen. Siehe `product-scope.md`. | Ordnet den großen Scope. Dimensionen sind kein Feature, sondern Datenmodell; Intelligenz-Schicht ist das Differenzierungsmerkmal. |
| D17 | **Positionierung: „Cockpit für Wachstum & Profitabilität" — der ganzheitliche Überblick, der im Tagesgeschäft untergeht.** Unifiziert Seller Central + Ads-Konsole + Excel-Margen + ausgelagerten Content + Account-Mgmt. | Kern-These für alle Priorisierung: aus verstreuten Silos → konkrete, priorisierte Maßnahmen. |
| D18 | **Profitabilität ist KEINE eigene Säule.** Marge, Break-even-ACoS, Profit-Tracking, ACoS/TACoS gehören ins Performance-Dashboard (nur je eine von vielen KPIs). Säulen: 7 → 6. | Nutzer-Feedback zur Karte. ACoS ist eine Kennzahl unter vielen, kein eigener Bereich. |
| D19 | **Tech-Stack: Next.js — bestätigt** (später änderbar). | Nutzer-Freigabe. Portierbare Substanz (SQP-Engine, Parser) lebt schon in Next.js. |
| D20 | **Erste Bau-Scheibe = Content der Listing-Seite** (Content-AI + Listing-Diagnose), NICHT Report-Cockpit + Action-Plan. | Nutzer-Entscheidung; überschreibt frühere Mentor-Empfehlung (Reporting zuerst). |
| D21 | **Externes Listing-Analyse-Tool wird zur Inspiration der Output-*Struktur* gesichtet, NICHT übernommen (nicht 1:1, nicht 1:2).** Gute Grundstruktur: Reviews, Kaufauslöser, Kundenbeschwerden→Content, Bullet/Titel/A+-Optimierung, profit-hebel-Keywords, Wettbewerber-Lücken. Output-Qualität dort ist NICHT unser Standard. | Nutzer-Hinweis: viel davon steckt schon in unserem Wissen; Output hat „unfassbar viele Fehler". |
| D22 | **Reihenfolge Content-Scheibe: Text zuerst, dann Bilder** (bestätigt). SEO-Text-Erzeugung = temoa-os `buildPrompt` (portieren). | Nutzer-Bestätigung. |
| D23 | **Informationsarchitektur: Katalog als Rückgrat, Produkt (ASIN) als primäres Objekt.** Zwei Nav-Ebenen (Agentur-Portfolio ↔ Kunden-Workspace); Account-Bereiche in Seitenleiste, produktbezogene Fähigkeiten als Tabs im ASIN-Detail. Drei Abläufe: Kunde anbinden / Berichte hochladen / Daten & Marge. Siehe `information-architecture.md` + `navigation-blueprint.html`. | Content/Reviews/Marge sind produktbezogen → an den ASIN, nicht in getrennte Menüs. |
| D24 | **Inspirationsquellen (remdash, ROPT BI) validieren, werden NICHT nachgebaut.** Mitnahme: Land- + Produktgruppen-Slicing zentral, YoY-Vergleich, Organic-vs-Ad-Split, konfigurierbare KPI-Karten. | Eigene Logik/Struktur; Screenshots nur als Input. |
| D21b | **temoa-audit analysiert** (SALVAGE §7). Es IST das aktuelle Tool: Skill-orchestriert (nexscope-Submodul) + Flask-Onepager. **Struktur portieren** (review-insights-Schema, 8-Dim-Audit, Profit-Hebel-Logik, Onepager-Narrativ, Bild-Brief + Reference-Fidelity-Lock + Spelling-Risk-Regeln), **Code/Pipeline nicht**. | Bestätigt die These: gute Spezifikation, schwache Umsetzung (LLM-Pipeline über gescrapte Daten, kein Validierungs-Gate). |

### 2026-07-07 (Forts.) — Build-Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| D25 | **Cloud + echte Datenbank, kein Local-/HTML-Storage.** Daten jederzeit von jedem Gerät/Land/Nutzer erreichbar; durch Kunden navigierbar. | Nutzer-Vorgabe. Multi-Client-Agentur-Nutzung. |
| D26 | **Auth v1: Kunden-Zugang per Passwort = Markenname (lowercase) als Default.** ⚠️ **REVISION EMPFOHLEN (Critical Review R5):** Markenname ist öffentlich → faktisch Benutzername=Passwort bei Margen-/COGS-Daten. Vorschlag: Agentur-Login richtig + unratbare Kunden-Links (Sales-Room-Muster). Nutzer-Entscheidung ausstehend. | Nutzer-Vorschlag; im Review als Risiko eingestuft. |
| D27 | **API-Ready mit bidirektionalem Write-back zu Amazon** (SP-API/Ads-API später). Content/Kampagnen aus dem Tool zurück nach Seller Central pushbar. | Nutzer-Vorgabe. Datenmodell: Content-Zustände Entwurf→freigegeben→synchronisiert. |
| D28 | **LLM anbieter-agnostisch: Provider-/Modell-Registry, konfigurierbar, „bestes aktuelles Modell" wählbar.** Kein hartcodiertes Modell. Mehrere Anbieter anschließbar. | Nutzer-Vorgabe. Modellwahl ändert sich schnell. |
| D29 | **Content-Erzeugung im Tool für Text UND Bilder** (Haupt, Listing, A+, Premium-A+). | Nutzer-Vorgabe. |
| D30 | **PPC-/Performance-KPIs kommen alle aus dem Reporting-Repo** (weekly.ts, ads/parser, business/parser, sqp/{metrics,tier1,tier2,scenario}, margin/calc). Keine neue Rechenlogik — nur Darstellung. KPI-Kachel-Zuordnung siehe `information-architecture.md`. **Präzisierung (Review R6):** „CR vs. Markt" nur SQP-aggregiert (Marke vs. Gesamtmarkt); wettbewerber-genauer Vergleich = neue Daten + Logik, nicht vorhanden. | Bestätigt: Substanz vorhanden, portierbar. |
| D31 | **Kritischer Review durchgeführt** (`critical-review.md`): 5 Risiken (R1 Scope-Inflation → Nicht-Ziele-Liste; R2 Datenbeschaffung ungelöst → Scrape-Spike + H10-Upload-Fallback; R3 Qualität ohne Messung → Eval-Harness mit Golden-ASINs als Teil der ersten Scheibe; R4 Score-Evidenz-Klassen; R5 Auth-Revision). Ziel-Reframing: „bestes Betriebssystem für die eigene Agentur-Arbeit" vor „bestes Tool am Markt". | Stress-Test vor Baubeginn; Korrekturen R1/R5 + v1-Nicht-Ziele brauchen Nutzer-Bestätigung. |

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
- Operations-Domäne (Wissen aus marketplaceadpros gesichert): Reorder-Planung (inkl. AWD-Doppelzähl-Falle), FBA-Inventory-Risk (Effective-DOS), Experiment-State-Machine. Andere Domäne als Listing — später ggf. eigener Bereich.
- Dünne Skill-Layer über den Tool-Modulen als spätere Bedien-/Routing-Option (Frontmatter-Trigger-Engineering beachten).
