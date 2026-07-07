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
| D13 | **Erste Layer-1-Arbeit: Blaupause am Hauptbild** — bestehenden Prompt + Referenzen dekomponieren, bevor App-Code entsteht. | Stärkster Conversion-Hebel, Rohmaterial vorhanden; wird Schablone für alle Content-Typen. |
| D14 | **Wahre Mission = ganzheitliche Plattform, voller Modulumfang** (Content, Analyse, Reporting, Marge, Performance-Historie, Handlung, PPC). Listing-Optimierung ist EIN Bereich. | Nutzer-Präzisierung. Visuell: `architecture-map.html`. |
| D15 | **Intern zuerst, Monetarisierung nachrangig. EIN kombinierter Bereich** (Admin + Kunde zusammengelegt), später trennbar. Kundenseitiges Auth/Feature-Gating/Abrechnung → Backlog. | Nutzer-Korrektur zu D14: Tool wird zuerst intern zur Kundenbetreuung gebaut, nicht als SaaS verkauft. Mehr-Kunden-Datenmodell bleibt (mehrere Marken intern), aber kein Kundenbereich nötig. |
| D16 | **Scope-Struktur in 3 Ebenen:** (A) 7 Modul-Säulen, (B) 2 orthogonale Dimensionen (Entity-Hierarchie Account→Brand→Land→Produktgruppe→ASIN × Zeit) als DATENMODELL, (C) Intelligenz-Schicht (AI-Advisor/Alerts/Market Intelligence) ÜBER den Säulen. Siehe `product-scope.md`. | Ordnet den großen Scope. Dimensionen sind kein Feature, sondern Datenmodell; Intelligenz-Schicht ist das Differenzierungsmerkmal. |
| D17 | **Positionierung: „Cockpit für Wachstum & Profitabilität" — der ganzheitliche Überblick, der im Tagesgeschäft untergeht.** Unifiziert Seller Central + Ads-Konsole + Excel-Margen + ausgelagerten Content + Account-Mgmt. | Kern-These für alle Priorisierung: aus verstreuten Silos → konkrete, priorisierte Maßnahmen. |
| D18 | **Profitabilität ist KEINE eigene Säule.** Marge, Break-even-ACoS, Profit-Tracking, ACoS/TACoS gehören ins Performance-Dashboard (nur je eine von vielen KPIs). Säulen: 7 → 6. | Nutzer-Feedback zur Karte. ACoS ist eine Kennzahl unter vielen, kein eigener Bereich. |
| D19 | **Tech-Stack: Next.js — bestätigt** (später änderbar). | Nutzer-Freigabe. Portierbare Substanz (SQP-Engine, Parser) lebt schon in Next.js. |
| D20 | **Erste Bau-Scheibe = Content der Listing-Seite** (Content-AI + Listing-Diagnose), NICHT Report-Cockpit + Action-Plan. | Nutzer-Entscheidung; überschreibt frühere Mentor-Empfehlung (Reporting zuerst). |
| D21 | **Externes Listing-Analyse-Tool wird zur Inspiration der Output-*Struktur* gesichtet, NICHT übernommen (nicht 1:1, nicht 1:2).** Gute Grundstruktur: Reviews, Kaufauslöser, Kundenbeschwerden→Content, Bullet/Titel/A+-Optimierung, profit-hebel-Keywords, Wettbewerber-Lücken. Output-Qualität dort ist NICHT unser Standard. | Nutzer-Hinweis: viel davon steckt schon in unserem Wissen; Output hat „unfassbar viele Fehler". Repo muss noch bereitgestellt werden (ZIP oder GitHub). |

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
