# temoa OS — Bauplan (v3)

> **Status:** v3.1, 2026-07-21 (neu: Menüpunkt Content-Verwaltung/CMS). Fortschreibung nach jedem abgeschlossenen Feature.
> Fundament: `docs/product-scope.md` (Scope-Session 07.07.) + Baustand `docs/DECISIONS.md`.
> **Das ist das Accountability-Dokument:** Gebaut wird, was hier steht.
> **Neu in v3 (Nutzer-Entscheidung 21.07.):** Der Plan ist nicht mehr nach Sprints sortiert, sondern ist der **Bauplan des Tools** — gegliedert wie die linke Seitenleiste: Menüpunkt → Untermenü → Features. Ein Menüpunkt/Feature wird komplett gebaut und **in sich getestet**, dann kommt der nächste. So wächst das Tool entlang seiner eigenen Struktur statt querbeet.

## 1 · Vision in drei Ausbaustufen

**temoa OS ist das Amazon-Betriebssystem — erst für die Agentur, dann für Kunden.** Alle verstreuten Datenquellen fließen in ein Tool, das sie in datenbasierte Entscheidungen, konkrete Handlungen und fertigen Content übersetzt. Jede Zahl trägt Formel und Quelle, jeder generierte Text besteht eine automatische Prüfung, keine Fassaden-Daten.

| Stufe | Wer nutzt es | Woher kommen die Daten | Stand |
|---|---|---|---|
| **1 — Internes Agentur-Tool** | Das Team, für die Betreuung der Kundenkonten | Manuelle Importe: Amazon-Berichte (CSV), Helium-10-Exporte, Review-/Listing-Scrapes, Gebühren-PDFs | **Jetzt — in Betrieb, wird gehärtet** |
| **2 — API-angebunden** | Das Team, mit direktem Amazon-Draht | SP-API + Ads-API ziehen alle Berichte der betreuten Kundenkonten automatisch | **Mittelfristig — Zulassungsprozess für SP-API & Ads-API läuft** |
| **3 — Kunden-Produkt (SaaS)** | Kunden kaufen das Tool im Monats-Abo und nutzen es selbst | Kunde bindet sein eigenes Amazon-Konto per API an; eigene Dashboards | **Langfristig — Zielbild, prägt heutige Architektur-Entscheidungen** |

## 2 · Der Feature-Filter (die Messlatte für ALLES)

Jedes Feature — bestehend oder neu — muss mindestens eine dieser Fragen mit Ja beantworten, **und** einen Handlungs-Pfad haben:

1. Ermöglicht es eine **datenbasierte Entscheidung**, die vorher Bauchgefühl war?
2. Bringt es dem Kunden **mehr Umsatz oder mehr Profit**?
3. Macht es die **Bearbeitung messbar schneller**?

„Interessant zu sehen" reicht nicht. Beispiel N-Gram-Analyse: bleibt **nur**, weil ihre Wortwurzeln direkt zu Negativ-Keywords werden.

## 3 · Status-Legende

**„Gebaut" ist nicht „funktioniert"** (Nutzer-Vorgabe 20.07.): Grün gibt es erst nach bestandenem Praxistest im echten Einsatz.

✅ im Praxistest bestätigt · 🧪 gebaut & automatisch getestet — Praxistest steht aus · 🔶 teilweise / in Reparatur (Fix deployed, erneuter Test nötig) · ⬜ geplant · 🔒 wartet auf Input/Zulassung

---

## 4 · Bauplan Ebene 1 — Agentur-Sicht (temoa OS)

Die schlanke OS-Seitenleiste: Portfolio · Listing Optimizer · Tool-Einstellungen · Mein Konto. Querschnitt darüber: das Fundament, das überall wirkt.

### Querschnitt (wirkt in jedem Menüpunkt)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Fehler-Popups mit Fehlercode + Bedeutung + Lösung (tool-weit) | ✅ | Kein stiller Abbruch; jeder Fehler ist verständlich und behebbar |
| Login & Team-Verwaltung | ✅ | Zugriffsschutz; jeder arbeitet unter eigenem Namen |
| Ehrliche-Daten-Prinzip (Grenzen der Datenbasis werden ausgewiesen) | ✅ Regel | Keine Fassaden-Werte, keine Selbsttäuschung |

### Menüpunkt: Portfolio (`/`)

| Untermenü / Feature | Status | Handlung/Nutzen · Voraussetzung |
|---|---|---|
| Marken- & Produkt-Verwaltung (Marke → Produkt/ASIN) | ✅ | Die Grundstruktur — alles hängt daran |
| Portfolio-Kennzahlen über alle Marken + Alerts-Übersicht | ⬜ | Zustand aller Kundenkonten auf einen Blick · sinnvoll mit API-Datenbasis (Stufe 2) |

### Menüpunkt: Listing Optimizer (`/optimizer` → Produkt-Arbeitsplatz)

Das Content-Kraftwerk. Untermenüs = die Bereiche des Produkt-Arbeitsplatzes.

**Auftrags-Übersicht**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Optimizer-Aufträge anlegen & verwalten | 🧪 | Jede Listing-Optimierung ist ein nachvollziehbarer Auftrag |

**Untermenü: Produkt-Wahrheit (Stammdaten & Fakten)**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Produkt-Fakten (Maße, Material, USPs …) — Auto-Wege füllen NUR leere Felder, Hand-Einträge gewinnen immer | 🧪 | Der Wahrheits-Anker jeder Generierung (D114-Wurzel) |
| Persistente Zusatz-Infos (fließen in JEDE Generierung) | 🧪 | Wissen, das in keinem Feld steckt, geht nicht verloren |
| Kategorie-dynamische Fakten-Felder (Textil ≠ Elektronik) | ⬜ | Fakten passen sich der Produktkategorie an |

**Untermenü: Listing-Import**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Listing-Import von Amazon (Titel, Bullets, Bilder, Bewertungszahlen) | ✅ | Ist-Zustand als Arbeitsgrundlage, ohne Abtippen |

**Untermenü: Keyword-Basis**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Cerebro-Import → Keyword-Basis | ✅ | DIE Keyword-Quelle je Produkt |
| Relevanz-Filter: Fremdmarken (KI), abweichende Maße/Anzahl/Farbe/Form | ✅ | Nur Relevantes fließt in Content — markiert statt gelöscht |
| Mehrere Exporte zusammenführen / Basis bewusst löschen | 🧪 | Basis wächst über Uploads; Neustart ist Entscheidung |
| Manuelle Keywords | 🧪 | Eigenes Marktwissen ergänzt die Tool-Daten |
| Keyword-Einteilung auf Content-Plätze (Titel/Bullets/Beschreibung/Backend) | 🧪 | Jedes Keyword an den wirksamsten Platz · **E3 offen** (Platzzahlen 3/13/18 bestätigen) |

**Untermenü: Bewertungs-Analyse (Voice of Customer)**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Review-Scrape je ASIN × Sterne-Klasse (eigenes Produkt + Wettbewerber, ASIN-Chips) | 🔶 | Mehr-ASIN-Abbruch behoben (D102) — erneuter Praxistest nötig |
| Ehrliche Datenbasis (Amazon-Gesamtzahlen neben Stichprobe, Ausbeute je Lauf) | 🧪 | Keine Selbsttäuschung über die Datenlage |
| Findings-Dashboard: Pain Points, Kaufauslöser, Kundensprache, O-Töne | 🔶 | Crash behoben (D103) — erneuter Praxistest nötig |
| Erkenntnisse fließen automatisch in Content + Briefs (NIE als Spec-Quelle) | 🧪 | Kein Übertragen von Hand; Reviews liefern Sprache, nie technische Daten |
| Review-Bezug: bleibt Scraping | ✅ entschieden | Amazons APIs liefern keine Review-Texte (E1, 20.07.) |

**Untermenü: Content-Werkstatt (Generierung & Freigabe)**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Text-Generierung: Titel, Bullets, Highlights, Backend, Beschreibung, Q&A | 🔶 | GEN-01-Fixe deployed (Denk-Budget D106 + Zeit-Budget 270 s D118) — erneuter Praxistest nötig |
| Content-Gate: ohne Bewertungs-Analyse gesperrt; Override nur per Doppel-Bestätigung je Sektion | 🧪 | Content entsteht auf Datenbasis, Ausnahme ist bewusste Entscheidung |
| Automatische Prüfung: Zeichen/Bytes, Keyword-Pflichten, Fremdmarken-Verbot, USP-Dopplung, **Zahlen-Herkunfts-Check** (jede Zahl braucht eine Quelle, D114) | 🧪 | Kein regelwidriger und kein erfundener Content geht raus |
| Prompt-Regeln aus Agentur-Wissen: Drei-Positionen-Anatomie, EIN Bullet = EIN Thema, Fakten-Sperre | 🧪 | Bullets nach dem geprüften Verkaufs-Muster (D115/D116) |
| Begründung je Textbestandteil | 🧪 | Nachvollziehbar fürs Kunden-Gespräch |
| Manuelle Bearbeitung mit derselben Prüfung | 🧪 | Handarbeit spielt nach denselben Regeln |
| Versionen + Freigabe-Workflow | 🧪 | Stände vergleichbar, nichts geht verloren |
| Serialisierte Generierung (Buttons sperren sich gegenseitig) | 🧪 | Kein ALG-00 durch Parallel-Klicks (D109) |
| A+-Content-Generierung (Basic & Premium nach Design-Guide; Abfrage: Variante, Modul-Anzahl 1–7, Modultypen) | ⬜ | A+ hebt Conversion · Design-Guide ist eingearbeitet (D112/D113), startklar |
| Bild-Prompts (Hauptbild, Galerie) | 🔒 | Wartet auf euren Hauptbild-Prompt (E2) |
| Content-Performance-Monitoring (hat die Änderung CVR gebracht?) | ⬜ | Beweis der Content-Wirkung · braucht API-Daten (Stufe 2) |

**Untermenü: Analyse (`/produkte/[id]/analyse`)**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Tiefen-Audit (8 Dimensionen) | 🧪 | Vollbild des Listings → priorisierte Baustellen |
| Regel-Messung des WIRKSAMEN Stands (freigegeben sonst Original, je Sektion ausgewiesen) | 🧪 | Gemessen wird, was auf Amazon live gehen kann (D110) |
| Kundenstimmen-Abgleich (Themen-Abgleich, komposita-bewusst) | 🧪 | Adressieren die Bullets die Top-Pain-Points? (D117 repariert) |
| Druck-Layout | 🧪 | Kundentaugliche Aufbereitung |
| Bild-Audit (automatische visuelle Prüfung) | ⬜ | Hauptbild = größter CRO-Hebel |
| Echter Listing-Score (Engine statt Handeingabe) | ⬜ | Vergleichbarkeit über Produkte und Zeit |

**Untermenü: Creative-Briefs (`/produkte/[id]/briefs`)**

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Bild-Briefs (Vorgaben für Grafiker aus Daten) | 🧪 | Grafiker bekommt Fakten statt Bauchgefühl |
| A+-Briefs Basic & Premium (nach Design-Guide: Maße, Module, Text nur im Bild, Desktop-only) | 🧪 | Design-Auftrag nach den echten Agentur-Regeln (D113) |

### Menüpunkt: Tool-Einstellungen (`/einstellungen` + Daten & Formeln)

| Untermenü / Feature | Status | Handlung/Nutzen |
|---|---|---|
| Team-Verwaltung | ✅ | Wer darf rein, wer ist wer |
| „Daten & Formeln"-Register (durchsuchbar) | 🧪 | Jede Zahl im Tool nachrechenbar — Vertrauen, Schulung |
| Gebühren-Update per Amazon-PDF (Diff-Vorschau → bestätigte Übernahme) | 🧪 | Amazon ändert Gebühren → Margen-Rechner rechnet sofort richtig |
| Demo-Daten & Zurücksetzen | 🧪 | Gefahrloses Ausprobieren und Vorführen |
| Mandanten & Rollen (Kunde sieht nur Seins) | ⬜ Stufe 3 | Voraussetzung fürs Kunden-Abo |
| Abo/Abrechnung | ⬜ Stufe 3 | Monetarisierung |

### Menüpunkt: Mein Konto (`/konto`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Persönliche Einstellungen, Passwort | ✅ | Getrennt von den tool-weiten Einstellungen |

---

## 5 · Bauplan Ebene 2 — Marken-Sicht (je Kunde/Marke)

Die Marken-Seitenleiste: Cockpit · Katalog · Sichtbarkeit & Markt · Advertising/PPC · Berichte & Daten · **Content-Verwaltung (CMS)** · Handlungen. Neu in v3.1: Der Menüpunkt „Flat Files" geht im CMS auf — Flat File ist dort der heutige Publish-Weg, der API-Push der künftige (E6 zur Bestätigung).

### Menüpunkt: Cockpit (`/marke/[id]`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| KPI-Cockpit mit Kennzahlen-Kacheln (Umsatz, Bestellungen, Sitzungen, CVR, Buybox, AOV) | 🧪 | Zustand des Accounts auf einen Blick |
| Trend-Linien über Perioden (Umsatz, TACoS) | 🧪 | Entwicklung erkennen: wirkt die Maßnahme? |
| ACoS/TACoS-Ampel gegen Break-even | 🧪 | Sofort-Entscheidung: Ads drosseln oder skalieren |
| Perioden-Diagnose (Umsatz = Sitzungen × CVR × AOV zerlegt) | 🧪 | WARUM lief der Monat schlechter → gezielte Gegenmaßnahme |
| Margen-Rechner + Break-even-ACoS je Produkt | 🧪 | Preis-/Gebots-Entscheidungen auf Profitbasis |
| Custom Dashboards (Kachel-Baukasten je Nutzer/Kunde/Ebene) | ⬜ | Jeder sieht genau seine Kennzahlen · Vorstufe der Kunden-Sicht (Stufe 3) |
| Markt-Kontext (Prime Day, Saison in der Bewertung) | ⬜ | Ausreißer richtig einordnen · später |

### Menüpunkt: Katalog (`/marke/[id]/katalog`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Produkt-Liste je Marke → Absprung in den Produkt-Arbeitsplatz | ✅ | Der Weg zu jedem Produkt |
| Marketplace-Umschalter auf Markenebene (.de/.fr/.it getrennt) | ⬜ | Gleiche Marke je Land getrennt steuern |

### Menüpunkt: Sichtbarkeit & Markt (`/marke/[id]/sichtbarkeit`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| SOV-Audit: Sichtbarkeits-Anteil vs. Wettbewerber, Quick-Wins, Umsatzlücken | 🧪 | Wo verlieren wir sichtbar Umsatz → rankende Keywords angreifen |
| SQP-Auswertung (eigene CTR/CVR vs. Markt, verlorene Käufe) | 🧪 | Suchanfragen mit Unterperformance → Content/PPC-Handlung |
| SQP-Szenario-Rechner (was bringt +1 % CVR bei Suchanfrage X?) | ⬜ | Investition dahin, wo sie am meisten bringt |

### Menüpunkt: Advertising / PPC (`/marke/[id]/advertising`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Search-Term-Analyse: Wasted Spend, Negativ-Kandidaten | 🧪 | Geldvernichter finden → Negativliste |
| N-Gram-Wurzeln | 🧪 | Bleibt NUR als Zulieferer der Negativliste (Feature-Filter) |
| Ziel-ACoS aus Portfolio-Namen + Überspend-Erkennung | 🧪 | Kampagnen über Ziel → Gebote senken |
| Negativ-/Gebots-Empfehlungen als abarbeitbare Checkliste mit Export | ⬜ | Vom Befund zur umgesetzten Änderung in der Ads-Konsole |
| Kampagnen-Struktur-Vorschlag aus Keyword-Einteilung | ⬜ | Neue Kampagnen konsistent und schnell aufsetzen |
| Kampagnen-Upload als Bulk-Sheet (Excel) — upload-fertig für die Ads-Konsole | ⬜ | Kampagnen ohne Abtippen anlegen (heutiger Arbeitsweg des Teams) · Beispiel-Excel liefert das Team beim Start |
| Kampagnen-Anlage per Ads-API (ersetzt den Bulk-Sheet-Umweg) | 🔒 Stufe 2 | Struktur direkt ins Ads-Konto schreiben |

### Menüpunkt: Berichte & Daten (`/marke/[id]/berichte`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Business-Report-Import (Umsatz, Bestellungen, Sitzungen, CVR, Buybox, AOV) | 🧪 | Faktenbasis jeder Monats-Entscheidung |
| Ads-Report-Import (Spend, ACoS, ROAS, CTR, CPC, PPC-CR) | 🧪 | PPC-Wirtschaftlichkeit je Periode |
| Geführter Berichts-Upload (getaggt: Marke · Land · Periode) | 🧪 | Der Kundenmonat entsteht komplett im Tool |
| Retourenquote | ⬜ | Retourentreiber erkennen · braucht Retouren-/Payments-Bericht (echte Beispieldatei) |
| Automatischer Berichts-Bezug per SP-API/Ads-API | 🔒 | Daten kommen von selbst, lückenlos · Zulassung läuft (Stufe 2); Adapter wird vorbereitet, Parser bleiben |
| Forecasts, Lagerbestand | ⬜ | Erst mit API-Datenbasis sinnvoll · später |

### Menüpunkt: Content-Verwaltung — CMS (neu · absorbiert „Flat Files")

Der Content-Lebenszyklus je Kunde: **erstellen → speichern → publishen → überwachen.** Für Retainer- UND projektbasierte Kunden mit wiederkehrenden Content-/Advertising-/Management-Scopes. Kern-Prinzip: **Soll/Ist** — Soll ist der von uns erarbeitete, freigegebene Stand in der Datenbank; Ist ist das regelmäßig gecrawlte Live-Listing auf Amazon (gern auch schon VOR der Zusammenarbeit). Ziel: Content-Accuracy ≥ 95–99 % — unser Content ist ständig überall live und 100 % gepflegt. Das ist die **Retail-Readiness**, das Fundament fürs PPC-Cycling.

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Flat-File-Erstellung (Amazon-Vorlage einlesen → Upload-Datei) | 🔶 | Der HEUTIGE Publish-Weg: Content ohne Copy-Paste in Seller Central bringen |
| Content-Bibliothek je Kunde & Produkt | ⬜ | Alle im Tool erstellten Pieces (SEO-Texte, Bilder, Hauptbilder, A+) zentral verwaltet — Versionen & Freigaben aus dem Optimizer laufen hier zusammen |
| Bestands-Content-Import (historischer Content) | ⬜ | Auch Content, der VOR dem Tool bzw. früher für den Kunden erstellt wurde, wird eingepflegt und ab dann mitverwaltet |
| Soll/Ist-Abgleich je Content-Piece | ⬜ | Soll = freigegebener Stand im Tool · Ist = gecrawltes Live-Listing; jede Abweichung wird sichtbar. Ehrliche Grenze: kontinuierlich erst mit automatischem Bezug (Stufe 2), bis dahin per manuellem Re-Import |
| Content-Accuracy-Dashboard (Widgets) | ⬜ | Wie viel % unseres Solls ist live? Internes Ziel ≥ 95–99 % — messbar je Kunde/Produkt, als Kachel auch fürs Cockpit |
| Content-Alerts | ⬜ | Hauptbild rausgeflogen, Listing gesperrt/unterdrückt, Text überschrieben → das Tool meldet es, bevor der Kunde es merkt (Abgleich-Basis wie Soll/Ist) |
| Publish zu Amazon per SP-API | 🔒 Stufe 2 | Content direkt aus dem Tool pushen & publishen — ersetzt den Flat-File-Umweg (gleiche Logik wie Ads-API vs. Bulk-Sheet) |
| Kunden-Feedback am Content-Piece | ⬜ | Kunde hinterlegt Feedback direkt am Piece — mittelfristig, sobald Kunden angebunden sind (Richtung Stufe 3) |

### Menüpunkt: Handlungen (`/marke/[id]/handlungen`)

| Feature | Status | Handlung/Nutzen |
|---|---|---|
| Handlungs-Hebel in € (priorisierte Maßnahmen-Liste) | 🔶 | Was zuerst tun — nach Geldwirkung sortiert |
| AI-Advisor: die 3 wichtigsten Maßnahmen je Marke, nach €-Hebel, mit Begründung | ⬜ | Vom Dashboard zur Priorität — das Differenzierungsmerkmal |
| Alerts (Ausreißer zwischen Perioden, Buybox-Einbruch, Policy-Änderungen) | ⬜ | Probleme melden sich, bevor der Kunde anruft |

---

## 6 · Arbeitsregeln (unverändert gültig)

1. **Feature-Filter** (Abschnitt 2) — vor jedem neuen Feature.
2. **Bauplan-Reihenfolge:** Ein Menüpunkt/Feature wird komplett gebaut und in sich getestet, dann der nächste — nicht querbeet.
3. **Keine Annahmen ohne Herleitung:** Parser & Regeln nur mit echter Beispieldatei/Quelle.
4. **LLM generiert, Code erzwingt:** jede KI-Antwort läuft durch Normalisierung + deterministische Prüfung.
5. **Ehrliche Daten:** keine Fassaden-Werte; Grenzen der Datenbasis werden ausgewiesen.
6. **Jeder Fehler als Popup mit Code**; Buttons nur klickbar, wenn sie Neues erzeugen können.
7. **Anti-Blackbox:** neue Formel ⇒ Eintrag in Daten & Formeln im selben Commit; ein Feature = ein Commit mit Tests.

## 7 · Entscheidungen

| # | Entscheidung | Stand |
|---|---|---|
| E1 | Review-Bezug per Amazon-API? | **Entschieden (20.07.):** Nicht möglich — APIs liefern keine Review-Texte. Es bleibt beim Scraping. |
| E2 | Quellen für Bilder & A+ | **Teilweise gelöst:** A+-Regeln im Repo-Wissen → A+ startklar. Hauptbild-Prompt weiter offen — blockiert nur die Bild-Prompts. |
| E3 | Keyword-Aufteilung: wichtigste 3 → Titel, 4–13 → Bullets, 14–18 → Beschreibung, Rest → Backend | **Offen:** Platzzahlen bestätigen oder ändern |
| E4 | ~~Sprint-Reihenfolge~~ | **Abgelöst (21.07.):** Struktur & Reihenfolge folgen dem Bauplan (Menüpunkt für Menüpunkt, Feature für Feature, in sich getestet) — Sprint-Sortierung entfällt. |
| E5 | A+-Modul-Set | **Gelöst (20.07.):** Design-Guide geliefert und eingearbeitet (D112/D113). |
| E6 | CMS-Verortung: eigener Marken-Menüpunkt „Content-Verwaltung (CMS)", in dem „Flat Files" als Publish-Weg aufgeht | **Offen:** Struktur bestätigen — oder CMS anders schneiden (z. B. eigener Reiter neben Flat Files) |
