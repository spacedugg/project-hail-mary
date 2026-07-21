# temoa OS — Projektplan (v2)

> **Status:** v2.1, 2026-07-20. Fortschreibung nach jedem Sprint.
> Fundament: `docs/product-scope.md` (Scope-Session 07.07.) + Baustand `docs/DECISIONS.md`.
> **Das ist das Accountability-Dokument:** Gebaut wird, was hier steht. Jeder Sprint hat ein Ziel und eine prüfbare Abnahme.

## 1 · Vision in drei Ausbaustufen

**temoa OS ist das Amazon-Betriebssystem — erst für die Agentur, dann für Kunden.** Alle verstreuten Datenquellen fließen in ein Tool, das sie in datenbasierte Entscheidungen, konkrete Handlungen und fertigen Content übersetzt. Jede Zahl trägt Formel und Quelle, jeder generierte Text besteht eine automatische Prüfung, keine Fassaden-Daten.

| Stufe | Wer nutzt es | Woher kommen die Daten | Stand |
|---|---|---|---|
| **1 — Internes Agentur-Tool** | Das Team, für die Betreuung der Kundenkonten | Manuelle Importe: Amazon-Berichte (CSV), Helium-10-Exporte, Review-/Listing-Scrapes, Gebühren-PDFs | **Jetzt — in Betrieb, wird gehärtet** |
| **2 — API-angebunden** | Das Team, mit direktem Amazon-Draht | SP-API + Ads-API ziehen alle Berichte der betreuten Kundenkonten automatisch — keine einzeln gezogenen Tages-/Wochenberichte mehr | **Mittelfristig — Zulassungsprozess für SP-API & Ads-API läuft** |
| **3 — Kunden-Produkt (SaaS)** | Kunden kaufen das Tool im Monats-Abo und nutzen es selbst, ohne Agentur | Kunde bindet sein eigenes Amazon-Konto per API an; eigene Dashboards, eigene Auswertungen | **Langfristig — Zielbild, prägt aber heutige Architektur-Entscheidungen** |

## 2 · Der Feature-Filter (die Messlatte für ALLES)

Jedes Feature — bestehend oder neu — muss mindestens eine dieser Fragen mit Ja beantworten, **und** einen Handlungs-Pfad haben (aus dem Feature folgt eine konkrete Handlung im Account):

1. Ermöglicht es eine **datenbasierte Entscheidung**, die vorher Bauchgefühl war?
2. Bringt es dem Kunden **mehr Umsatz oder mehr Profit**?
3. Macht es die **Bearbeitung messbar schneller**?

„Interessant zu sehen" reicht nicht. Beispiel N-Gram-Analyse: Sie bleibt **nur**, weil ihre Wortwurzeln direkt zu Negativ-Keywords werden (Handlung: Negativliste in die Ads-Konsole übernehmen). Als reines Schaubild wäre sie gestrichen. Features ohne Handlungs-Pfad werden nicht gebaut bzw. fliegen raus.

## 3 · Alle Features einzeln — kompletter Bestand & Plan

Status-Regel (v2.1, Nutzer-Vorgabe 20.07.): **„Gebaut" ist nicht „funktioniert".** Grün gibt es erst, wenn das Feature im ECHTEN Einsatz von euch durchgespielt wurde — Buttons, die klickbar sind, zählen nicht.

Status: ✅ im Praxistest bestätigt · 🧪 gebaut & automatisch getestet — Praxistest steht aus · 🔶 teilweise / in Reparatur · ⬜ geplant · 🔒 wartet auf Input/Zulassung

Praxis-bestätigt sind bisher NUR: Login/Team, Marken- & Produkt-Verwaltung, Fehler-Popups, Cerebro-Import + Relevanz-Filter (echter Export verarbeitet), Listing-Import (Gesamtzahlen im Einsatz). In Reparatur nach Praxistest-Fehlschlag (Fix deployed, erneuter Test nötig): Text-Generierung (D106), Mehr-ASIN-Review-Scrape (D102), Findings-Dashboard (D103). Alles andere, was zuvor ✅ trug, ist ehrlich 🧪 — Sprint 1 spielt den Optimizer komplett durch und macht aus 🧪 dort ✅.

### Fundament (Plattform)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Login, Team-Verwaltung, Mein Konto | ✅ | Zugriffsschutz; jeder im Team arbeitet unter eigenem Namen |
| Marken- & Produkt-Verwaltung | ✅ | Struktur: Marke → Produkt (ASIN) — alles hängt daran |
| Fehler-Popups mit Fehlercode + Lösung | ✅ | Kein stiller Abbruch; jeder Fehler ist verständlich und behebbar |
| „Daten & Formeln"-Register (durchsuchbar) | 🧪 | Jede Zahl im Tool nachrechenbar — Vertrauen, Schulung neuer Teammitglieder |
| Gebühren-Update per Amazon-PDF (Diff-Vorschau → bestätigte Übernahme) | 🧪 | Amazon ändert Gebühren → PDF hochladen → Margen-Rechner rechnet sofort richtig |
| Demo-Daten & Zurücksetzen | 🧪 | Gefahrloses Ausprobieren und Vorführen |
| Marketplace-Umschalter auf Markenebene | ⬜ | Gleiche Marke auf .de/.fr/.it getrennt steuern |
| Kategorie-dynamische Produkt-Fakten | ⬜ | Fakten-Felder passen sich der Produktkategorie an (Textil ≠ Elektronik) |
| Mandanten & Rollen (Kunde sieht nur Seins) | ⬜ Stufe 3 | Voraussetzung fürs Kunden-Abo |
| Abo/Abrechnung | ⬜ Stufe 3 | Monetarisierung |

### Säule 1 — Performance & Wirtschaftlichkeit

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Business-Report-Import (Umsatz, Bestellungen, Sitzungen, CVR, Buybox, AOV) | 🧪 | Faktenbasis jeder Monats-Entscheidung |
| Ads-Report-Import (Spend, ACoS, ROAS, CTR, CPC, PPC-CR) | 🧪 | PPC-Wirtschaftlichkeit je Periode |
| KPI-Cockpit mit Kennzahlen-Kacheln | 🧪 | Zustand des Accounts auf einen Blick |
| Trend-Linien über Perioden (Umsatz, TACoS) | 🧪 | Entwicklung erkennen: wirkt die Maßnahme? |
| ACoS/TACoS-Ampel gegen Break-even | 🧪 | Sofort-Entscheidung: Ads drosseln oder skalieren |
| Perioden-Diagnose (Umsatz = Sitzungen × CVR × AOV zerlegt) | 🧪 | WARUM lief der Monat schlechter → gezielte Gegenmaßnahme |
| Margen-Rechner + Break-even-ACoS je Produkt | 🧪 | Preis-/Gebots-Entscheidungen auf Profitbasis |
| Handlungs-Hebel in € (priorisierte Maßnahmen-Liste) | 🔶 | Was zuerst tun — nach Geldwirkung sortiert |
| Retourenquote (braucht Retouren-/Payments-Bericht) | ⬜ S2 | Retourentreiber erkennen → Produkt/Content anpassen |
| SQP-Szenario-Rechner (was bringt +1 % CVR bei Suchanfrage X?) | ⬜ S2 | Content-/PPC-Investition dahin, wo sie am meisten bringt |
| **Automatischer Berichts-Bezug per SP-API/Ads-API** | 🔒 S4 (Zulassung läuft) | Kein manuelles Ziehen einzelner Berichte mehr — Daten kommen von selbst, lückenlos |
| **Custom Dashboards (Kachel-Baukasten, je Nutzer/Kunde/Ebene)** | ⬜ S6 | Jeder sieht genau die Kennzahlen, die für ihn zählen — Account-übergreifend bis Einzelbericht |
| Forecasts, Lagerbestand | ⬜ später | Erst mit API-Datenbasis sinnvoll |

### Säule 2 — Sichtbarkeit & Wettbewerb

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Cerebro-Import → Keyword-Basis (ein Upload, alles drin) | ✅ | DIE Keyword-Quelle je Produkt |
| Relevanz-Filter: Fremdmarken (KI-erkannt), abweichende Maße/Anzahl/Farbe/Form | ✅ | Nur relevante Keywords fließen in Content — markiert statt gelöscht, per Klick zurückholbar |
| Keyword-Einteilung auf Content-Plätze (Titel/Bullets/Beschreibung/Backend) | 🧪 | Jedes Keyword an den Platz mit der größten Wirkung |
| Mehrere Exporte zusammenführen / Basis komplett löschen | 🧪 | Basis wächst über Uploads; Neustart ist bewusste Entscheidung |
| Manuelle Keywords | 🧪 | Eigenes Marktwissen ergänzt die Tool-Daten |
| SOV-Audit: Sichtbarkeits-Anteil vs. Wettbewerber, Quick-Wins, Umsatzlücken | 🧪 | Wo verlieren wir sichtbar Umsatz → gezielt rankende Keywords angreifen |
| SQP-Auswertung (eigene CTR/CVR vs. Markt, verlorene Käufe) | 🧪 | Suchanfragen mit Unterperformance → Content/PPC-Handlung |

### Säule 3 — Content

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Listing-Import von Amazon (Titel, Bullets, Bilder, Bewertungszahlen) | ✅ | Ist-Zustand als Arbeitsgrundlage, ohne Abtippen |
| Text-Generierung: Titel, Bullets, Highlights, Backend, Beschreibung, Q&A | 🔶 in Reparatur | Praxistest-Fehlschlag (GEN-01) behoben — Denk-Budget des Modells war zu knapp (D106); erneuter Praxistest nötig |
| Automatische Prüfung (Zeichen/Bytes, Keyword-Pflichten, Fremdmarken-Verbot, USP-Dopplung) | 🧪 | Kein regelwidriger Content geht raus — Prüfung ist Code, nicht Meinung |
| Begründung je Textbestandteil | 🧪 | Nachvollziehbar, WARUM jeder Baustein drinsteht — fürs Kunden-Gespräch |
| Manuelle Bearbeitung mit derselben Prüfung | 🧪 | Handarbeit spielt nach denselben Regeln |
| Versionen + Freigabe-Workflow | 🧪 | Stände vergleichbar, nichts geht verloren |
| Flat-File-Erstellung (Amazon-Vorlage einlesen → Upload-Datei) | 🔶 | Content ohne Copy-Paste in Seller Central bringen |
| A+-Content-Generierung (Basic & Premium: Module, Maße, Karussell-Regeln aus dem Agentur-Wissen) | ⬜ S3 | A+ hebt Conversion — Regeln liegen im Repo-Wissen vor |
| Bild-Prompts (Hauptbild, Galerie) | 🔒 wartet auf euren Hauptbild-Prompt | Fertige Prompts für die Bild-Produktion |
| Content-Performance-Monitoring (hat die Titel-Änderung CVR gebracht?) | ⬜ nach S4 | Beweis der Content-Wirkung — braucht API-Daten je Zeitraum |

### Säule 4 — Listing-Diagnose

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Tiefen-Audit (8 Dimensionen: Titel, Bullets, Beschreibung, Backend, Bilder, A+, Reviews, Preis) | 🧪 | Vollbild des Listings → priorisierte Baustellen |
| Analyse-Seite mit Druck-Layout | 🧪 | Kundentaugliche Aufbereitung |
| Bild-Briefs (Vorgaben für Grafiker aus Daten) | 🧪 | Grafiker bekommt Fakten statt Bauchgefühl |
| Bild-Audit (automatische visuelle Prüfung) | ⬜ später | Hauptbild = größter CRO-Hebel |
| Echter Listing-Score (Engine statt Handeingabe) | ⬜ später | Vergleichbarkeit über Produkte und Zeit |

### Säule 5 — Advertising / PPC

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Search-Term-Analyse: Wasted Spend, Negativ-Kandidaten | 🧪 | Geldvernichter finden → Negativliste (direkte Handlung) |
| N-Gram-Wurzeln | 🧪 | Bleibt NUR als Zulieferer der Negativliste (Feature-Filter) |
| Ziel-ACoS aus Portfolio-Namen + Überspend-Erkennung | 🧪 | Kampagnen über Ziel → Gebote senken |
| Negativ-/Gebots-Empfehlungen als abarbeitbare Checkliste mit Export | ⬜ S5 | Vom Befund zur umgesetzten Änderung in der Ads-Konsole |
| Kampagnen-Struktur-Vorschlag aus Keyword-Einteilung | ⬜ S5 | Neue Kampagnen konsistent und schnell aufsetzen |
| Kampagnen-Anlage per Ads-API | 🔒 Stufe 2 | Struktur-Vorschlag direkt ins Konto schreiben |

### Säule 6 — Reviews / Voice of Customer

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Review-Scrape je ASIN × Sterne-Klasse (eigenes Produkt + Wettbewerber, ASIN-Chips) | 🔶 in Reparatur | Einzel-ASIN lief im Praxistest; Mehr-ASIN-Abbruch behoben (Zeitbudget, D102) — erneuter Praxistest nötig |
| Ehrliche Datenbasis (Amazon-Gesamtzahlen neben der Stichprobe, Ausbeute je Lauf) | 🧪 | Keine Selbsttäuschung über die Datenlage |
| Findings-Dashboard: Pain Points, Kaufauslöser, Kundensprache, O-Töne | 🔶 in Reparatur | Crash im Praxistest behoben (KI-Antwort wird erzwungen geprüft, D103) — erneuter Praxistest nötig |
| Erkenntnisse fließen automatisch in Content + Bild-Briefs | 🧪 | Kein Übertragen von Hand |
| Review-Bezug: bleibt Scraping | ✅ entschieden | Amazons offizielle APIs liefern KEINE Review-Texte (auch nicht für Wettbewerber) — Scraping ist der einzige Weg; aktueller Stand bleibt |

### Intelligenz-Schicht (über allen Säulen)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| AI-Advisor: die 3 wichtigsten Maßnahmen je Marke, nach €-Hebel, mit Begründung | ⬜ S5 | Vom Dashboard zur Priorität — das Differenzierungsmerkmal |
| Alerts (Ausreißer zwischen Perioden, Buybox-Einbruch, Policy-Änderungen) | ⬜ S5 | Probleme melden sich, bevor der Kunde anruft |
| Markt-Kontext (Prime Day, Saison in der Bewertung berücksichtigt) | ⬜ später | Ausreißer richtig einordnen statt falsch reagieren |

## 4 · Sprint-Plan v2 — 1 Woche, 1 Outcome, 1 prüfbare Abnahme

| Sprint | Outcome | Abnahme-Test |
|---|---|---|
| **S1 — Optimizer verlässlich** | Ein echtes Kundenprodukt komplett durchoptimiert, ohne dass etwas hakt; jedes 🧪-Feature des Optimizers wird dabei im echten Einsatz durchgespielt und erst dann ✅ (Review-Bezug bleibt Scraping — entschieden) | 3 echte ASINs von Import bis freigegebenem Content ohne Fehlercode |
| **S2 — Reporting-Monatsrhythmus** | Der Kundenmonat entsteht komplett im Tool: Retourenquote + SQP-Szenario-Rechner + geführter Upload | Ein Kundenmonat hochgeladen → Cockpit/Diagnose/Hebel stimmen mit Handrechnung überein |
| **S3 — A+ Content** | A+ (Basic & Premium) wird generiert und geprüft wie Bullets — Regeln aus dem Agentur-Wissen | 1 Produkt bekommt regelkonforme A+-Modul-Entwürfe aus echten Daten |
| **S4 — Amazon-API Stufe 1** 🔒 | Sobald SP-API/Ads-API-Zulassung da: Konten anbinden, Berichte automatisch ziehen (ersetzt manuelle Uploads; Parser bleiben) | Business- + Ads-Daten eines Kundenkontos kommen ohne manuellen Upload ins Cockpit, Zahlen identisch zum manuellen Bericht |
| **S5 — Intelligenz + PPC-Handlung** | Advisor nennt die 3 Maßnahmen mit €-Hebel; Negativ-/Gebots-Checkliste exportierbar | Advisor-Maßnahmen tragen Quelle + Formel + €; Negativliste aus echtem Search-Term-Report exportiert |
| **S6 — Custom Dashboards v1** | Kachel-Baukasten: jeder stellt sich sein Dashboard zusammen (Vorstufe Kunden-Sicht) | Zwei unterschiedliche Dashboards aus denselben Daten gebaut, gespeichert, wieder geöffnet |
| danach | Marktplätze (.fr/.it …), Bild-Audit, Content-Monitoring, Mandanten/Rollen, Abo | — |

**Hinweis zu S4:** Der API-Sprint startet, sobald die Zulassung durch ist — bis dahin wird er vorbereitet (Adapter-Struktur, Report-Mapping auf die bestehenden Parser), damit nach Freigabe nur noch angeschlossen wird. Rutscht die Zulassung, rücken S5/S6 vor.

## 5 · Arbeitsregeln (unverändert gültig)

1. **Feature-Filter** (Abschnitt 2) — vor jedem neuen Feature.
2. **Keine Annahmen ohne Herleitung:** Parser & Regeln nur mit echter Beispieldatei/Quelle.
3. **LLM generiert, Code erzwingt:** jede KI-Antwort läuft durch Normalisierung + deterministische Prüfung.
4. **Ehrliche Daten:** keine Fassaden-Werte; Grenzen der Datenbasis werden ausgewiesen.
5. **Jeder Fehler als Popup mit Code**; Buttons nur klickbar, wenn sie Neues erzeugen können.
6. **Anti-Blackbox:** neue Formel ⇒ Eintrag in Daten & Formeln im selben Commit; ein Feature = ein Commit mit Tests.

## 6 · Entscheidungen

| # | Entscheidung | Stand |
|---|---|---|
| E1 | Review-Bezug per Amazon-API? | **Entschieden (20.07.):** Nicht möglich — SP-API/Ads-API liefern keine Review-Texte. Es bleibt beim Scraping-Stand. |
| E2 | Quellen für Bilder & A+ | **Teilweise gelöst:** A+-Regeln liegen im Repo-Wissen (Basic/Premium, max. 7 Module, 970 px, Karussell nur Premium) → S3 startklar. Hauptbild-Prompt weiter offen — blockiert nur die Bild-Prompts, nicht A+. |
| E3 | Keyword-Aufteilung bestätigen. **Klartext:** Die Keyword-Liste wird nach Wichtigkeit sortiert (Suchvolumen × Relevanz). Die wichtigsten 3 kommen in den Titel, die Plätze 4–13 in die Bullets, 14–18 in die Beschreibung, alle weiteren ins unsichtbare Backend-Feld. | **Offen:** Passt diese Aufteilung — oder andere Platzzahlen? |
| E4 | Sprint-Reihenfolge v2 (S1→S6) bestätigen oder umsortieren | **Offen** |
| E5 | **A+-Modul-Set festlegen:** Welche A+-Module nutzt ihr tatsächlich (Basic und Premium)? Der heutige A+-Brief schlägt ein generisches Set vor (Bild-Header 970×600, Vier-Quadranten, Bild+Text-Einwandmodul, Vergleichstabelle, Abschluss-Banner) — laut Nutzer entspricht das nicht eurer Praxis (z. B. Bild+Text wird nicht mehr genutzt). Gebraucht: eure Standard-Modulliste je Basic/Premium (+ ob Premium-Zugang vorhanden), dann werden Briefs und spätere A+-Generierung exakt darauf gebaut. | **Offen — blockiert die A+-Brief-Überarbeitung und Sprint 3** |
