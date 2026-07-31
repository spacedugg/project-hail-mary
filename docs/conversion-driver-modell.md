# Conversion Driver & Blocker — Modell und Prozess (D265)

> Festgeschrieben am 30.07.2026 nach Nutzer-Vorgabe. Diese Datei ist die
> Spezifikation des Umbaus; der Stand der Umsetzung steht unten in §7.

## 1. Begriffe — die Verwechslung, die alles verursacht hat

| | Frage | Beispiel (boho office Schreibtischgestell) |
|---|---|---|
| **Feature** | Was hat das Produkt? | 3-fach Teleskop · Display-Sleep · Kindersicherung · 2 Motoren |
| **USP** | Was hat nur wir / besser? | 80 mm/Sek · bis zu 40 % mehr Stahl |
| **Conversion Driver** | Warum klickt jemand *kaufen*? | Ohne Rückenbeschwerden durch den Arbeitstag |

Ein Driver ist das **Resultat**, das der Kunde will — das Produkt ist nur das
Mittel dahin. Er entsteht aus **einem oder mehreren** Features:

```
RESULTAT (Driver)            „Ohne Rückenbeschwerden durch den Arbeitstag"
  └── Nutzen-Baustein        „Sitzen↔Stehen im Wechsel, alltagstauglich"
        └── Feature [+USP]   stufenlos 61–126 cm · 3 Speicherplätze · 80 mm/Sek
```

Zwei Richtungen, beide wichtig:

- **Driver ≠ USP.** „Höhenverstellbar 61–126 cm" hat jeder Wettbewerber,
  unterscheidet also nichts — ist aber der Grund, warum die Kategorie gekauft
  wird, und muss trotzdem bewiesen werden.
- **USP ≠ Driver.** „3-fach Teleskop" ist echt überlegen und für niemanden ein
  Kaufgrund.

Der **USP-Flag sitzt am Baustein**, nicht am Driver: Überlegenheit steuert,
welcher Beweis besonders herausgestellt wird, und verschiebt keine Rangfolge.

**Test für die Abstraktionshöhe:** Ein Driver muss sich **ohne jedes Merkmal**
formulieren lassen. Steht ein Merkmal drin, ist es ein Baustein.
Deterministisch geprüft: `pruefeResultatFeatureFrei()`.

**Trennungstest zwischen zwei Drivern:** Zwei Resultate sind verschieden, wenn
ein Käufer das eine wollen und beim anderen gleichgültig bleiben kann. Sonst
zusammenlegen — sonst zerfällt ein Driver in Bausteine.

## 2. Warum das alte Modell den wichtigsten Driver nicht finden konnte

`verdichteInsights()` bekam **ausschließlich** Review-Aspekte ins Prompt (Label,
Zählwert, zwei Zitate). Nicht: Titel, Bullets, Beschreibung, A+, Attribute,
ProductFacts, Bildanalyse, Wettbewerber-Listings, Keywords. Die Driver wurden
also formuliert, **ohne dass das Modell das Produkt oder das Listing gesehen
hat**. Vier Folgen:

1. Niemand schreibt „dieser Tisch hat meine Rückenschmerzen beseitigt" —
   das Kernmotiv der Kategorie konnte strukturell nicht entstehen.
2. Bewertungen sind **post-purchase**: Nennungshäufigkeit misst
   Erlebnis-Auffälligkeit, nicht Kaufrelevanz. Aufbau und Lieferumfang gewinnen.
3. Die Relevanz kam vom LLM (`verdichtung.ts`) — Verstoß gegen D154/D170/D178.
4. „Conversion Drivers" war kein Lauf, sondern ein Anzeigefilter
   (`kartenKlasse === "positiv"`). Karten mit negativer oder ausgeglichener
   Tendenz erscheinen seit D243 in keinem Reiter.

Die Prompts verlangten außerdem Mengen (`4–8 Erkenntnisse`, `3–8 Blocker`,
`5–10 Features`). Eine Untergrenze ist eine Aufforderung zum Auffüllen —
aufgefüllt wird mit Features.

## 3. Herkunft der Driver — sieben Quellen, getrennt geerntet

Je Quelle eine **eigene, enge Extraktion**, nie ein Sammel-Prompt. So bleibt die
Herkunft je Kandidat erhalten.

| # | Quelle | liefert |
|---|---|---|
| 1 | `ProductFacts` + Zusatzkontext | Features → möglicher Nutzen |
| 2 | eigenes Listing | welcher Nutzen wird heute behauptet |
| 3 | eigene Bilder (`bilderText`) | welcher Nutzen wird visuell behauptet |
| 4 | Wettbewerber-Listings (`competitorListings`) | welche Resultate bewirbt die Kategorie |
| 5 | eigene Bewertungen | Nutzen, den Käufer selbst benennen |
| 6 | Wettbewerbs-Bewertungen (`uebertragbarkeit`) | Nutzen, den unser Listing nicht kennt |
| 7 | Keywords + Suchvolumen + SOV | wonach Menschen **vor** dem Kauf suchen |

Quelle 7 ist der einzige **gemessene Vorkauf-Datenpunkt** und damit die Antwort
auf den Post-purchase-Bias. Quelle 5/6 dürfen **allein** einen Driver tragen —
ein Resultat, das nur aus Bewertungen kommt, fehlt im Listing der ganzen
Kategorie und ist der wertvollste Fund; es wird markiert, nicht abgestraft.

## 4. Der Prozess

1. **Ernte** — Kandidaten als `Feature → Nutzen` mit Fundstelle. **Fünf Läufe für
   die sieben Quellen:** Produkt-Wahrheit, eigenes Listing und Kategorie teilen
   einen Lauf, weil es dasselbe Korpus ist (die Belege unterscheiden die Quelle
   trotzdem einzeln); Wettbewerber, Bewertungen und Bilder je einen; die
   Keyword-Zuordnung läuft zuletzt auf den bereits verschmolzenen Resultaten.
   Der Code stempelt je Lauf die erlaubten Quellen — das Modell kann keine
   behaupten, die es nicht bekommen hat.
2. **Zusammenführung (Code)** — Wortstamm-Normalisierung auf einen Nutzen-Schlüssel,
   verschmelzen; jeder Driver trägt danach seine **Belegmatrix** (welche Quelle, welche Fundstelle).
3. **Gates (Code)** — Zuständigkeit (§5) · Motiv-Klasse · Fakten-Sperre.
4. **Scoring (Code)** — feste Formel, siehe `motive.ts`; Relevanz 1–5 aus dem Score.
5. **Auswahl (Code)** — Schwelle 45, Pflicht-Minimum 1, Notbremse 8.
6. **Formulierung (LLM)** — Titel im Format `<Resultat>` bzw. `<Resultat>: <Beleg>`,
   ausschließlich aus der Belegmatrix. Was nicht in der Matrix steht, kann nicht
   in den Titel geraten (deshalb ist ein erfundenes „Made in Germany" aus „TÜV"
   strukturell unmöglich).
7. **Blocker (Code + minimal LLM)** — Abdeckung × Bildbeweis → Fall → Titel aus
   Template; die Präzisierung („insbesondere bei maximaler Höhe") zieht das LLM
   nur aus den negativen Aspekten **dieses** Drivers.

Was Code entscheidet und was das LLM liefert, steht als Formel-Register in
„Daten & Formeln" (`src/lib/rechenwerk.ts`) — dort sind auch alle Gewichte
nachlesbar und justierbar.

## 5. Zuständigkeit: Seller vs. Amazon

Versand, Zustellzeit und Paketdienst laufen bei Amazon. Egal ob schnell,
langsam, heil oder beschädigt — der Seller kann daran nichts ändern und muss es
im Listing nicht adressieren. Das Gate sitzt **vor jeder Zählung**, weil
Amazon-Themen sonst `mentionCount` verschieben, gegen die Stichprobe auf
Signifikanz geprüft werden und über `analyzeListing()` sogar Maßnahmen erzeugen.

| Wert | Bedeutung |
|---|---|
| `seller` | listing-wirksam, normaler Rohstoff |
| `produkt` | Sache des Sellers, aber nicht über Listing-Text lösbar (Produktverpackung, Transportschaden) → Produkt-Feedback |
| `amazon` | nicht unser Gegenstand, fliegt (gezählt) |
| `unklar` | bleibt drin — Wegwerfen wäre der teurere Fehler |

Fallen, die eine naive Stichwortliste reißt: **Lieferumfang**, **Aufbauanleitung**,
**Rückgabe**, **Garantie** sind Seller-Sache und dürfen nicht am Stamm „liefer"
mitfliegen. Der Amazon-Teil ist bewusst eng — „Kundenservice" und „auf Amazon"
bleiben drin.

**Verworfen (Nutzer-Korrektur 31.07.):** Ein „bereinigter Sterne-Schnitt" war eine
falsche Idee von mir. Eine 5★-Bewertung, die nur den Versand lobt, ist trotzdem
eine 5★-Bewertung — die Note zählt real und darf nicht herausgerechnet werden.
Irrelevant ist nur ihr INHALT, und der ist über das Gate ohnehin schon aus dem
Aspekt-Pool draußen. Es gibt also nichts zu korrigieren.

## 6. Insights-Dokument für den Kunden

Vier Seiten, jede Erkenntnis **genau einmal** ausformuliert; danach nur noch
Referenz über die Driver-ID. Damit fällt „Conversion-Blocker" als eigenes
Kapitel weg — ein Blocker ist eine rote Zeile der Matrix.

1. **Ausgangslage** — Datenbasis als Vertrauensanker, Kern-These in einem Satz, 3 Kennzahlen
2. **Was Kunden wollen** — die Driver-Matrix: ID · Resultat · Motiv-Klasse · Belegquellen · Abdeckungs-Ampel · ein Zitat
3. **Was das Listing daraus macht** — Score je Textdimension (`measured: false` = „nicht bewertbar", nie 0), Bild-Heatmap (Design/Botschaft/Klarheit je Slot), Ballast-Zeilen
4. **Handlungsplan** — Text und Bild, jede Maßnahme mit Driver-Referenz
5. **Grenzen der Analyse** (halbe Seite) — `hinweise`, `qualitaetsNotizen`, Zuständigkeits-Ausschlüsse, Verworfenes

Ausgeliefert als `/insights/[token]` (öffentlich, tokengeschützt, Muster wie
`/freigabe/[token]`) mit Print-Stylesheet — dieselbe Seite ist das PDF, keine
zweite Vorlage. Der Report wird beim Erzeugen **eingefroren**, sonst ändert sich
das Dokument unter dem Kundenlink nach jedem Lauf.

Nicht übernommen aus dem Referenz-Tool: die erfundene CVR-Schätzung
(„lift by 8–15 %", D114/D115), die informationslose Spalte „Customer Journey"
(D140) und Relevanz-Punkte ohne Bezug zur eigenen Datenspalte.

## 7. Umsetzungsstand

**Fertig und getestet (D265, dieser Commit):**

- `src/lib/analysis/zustaendigkeit.ts` — Zuständigkeits-Gate
- `src/lib/analysis/motive.ts` — Motiv-Klassen, Score, Relevanz, Auswahl, Feature-Freiheits-Test
- `src/lib/analysis/abdeckung.ts` — Text-Abdeckung (3 Stufen) + Bildbeweis
- `src/lib/analysis/blockerFall.ts` — Fall-Bestimmung, Titel-Templates, Blocker-Score
- `pruefeClaimStaerke()` in `gate.ts` + Regel `fakten.claim-staerke` — Intensitäts-Wort gegen Messwert
- Datenfluss-Register auf Feld-Ebene, maschinell erzwungen
- `driverTypen.ts` — Daten-Kontrakt; Tabelle `conversion_drivers` (Migration 0002)
- `driverAufbau.ts` — Verschmelzung, Suchvolumen-Anteil, Review-Evidenz aus
  `herkunft`/`uebertragbarkeit`, Gates mit Begründung, Blocker- und
  Ballast-Ableitung. Vollständig ohne LLM fahrbar, deshalb im Test komplett gedeckt.
- `driverErnte.ts` — fünf enge Läufe mit Quellen-Stempel und Verbatim-Prüfung,
  Recipe-Keys `driver.*`; im Mock-Modus bewusst OHNE Platzhalter-Kaufgründe

- Etappe `driver` in `runPipelineStufe` + `driverKern` (Persistenz, Redundanz-Guard,
  Fehlercode DRV-01); im Client-Runner nach „features"
- `driver-karten.tsx` im Analyse-Reiter: Driver mit Abdeckungs-Ampel je Baustein,
  Score-Aufschlüsselung, Blocker mit Driver-ID, Ballast, Erwartungs-/Produkt-
  risiken, Datenbasis & Grenzen. Die alten getrennten Listen erscheinen nur noch,
  solange für ein Produkt kein Driver-Lauf existiert — beides gleichzeitig wäre
  genau die Doppelung, die D265 abstellt.

- Aufräumen (D266): Zuständigkeits-Gate EINMAL an der Quelle (`auswertungKern`), Mengen-Quoten aus allen drei Prompts, EINE Relevanz-Formel
  in `relevanz.ts` für Verdichtung, Feature-Ranking und Blocker. Alt-Etappe
  `blocker` nicht mehr in der Kette. `qualitaetsNotizen` und die negativen
  Verdichtungs-Karten haben Konsumenten bekommen.

- Insights-Dokument (D267): Projektion + Auslieferungs-Gate
  (`reports/insightsDokument.ts`), Erzeugung und Einfrieren
  (`reports/insightsLauf.ts`, Tabelle `insights_reports`, Migration 0003),
  öffentliche Seite `/insights/[token]` mit Print-Stylesheet, Karte im
  Analyse-Reiter mit Öffnen · Link kopieren · Versionen.

- Vergleichs-ASINs aus dem Keyword-Export (D268): der Review-Scrape zieht die
  Wettbewerber automatisch, kein manueller Zwischenschritt mehr.

**Offen, in dieser Reihenfolge:**

1. `bildBefunde` und die Kundensprache-Felder verwerten (Bau-Auftrag im Register)
2. Erster echter Lauf gegen eine reale ASIN — Schwelle 45 und die Score-Gewichte
   sind bisher nur gegen Fixtures kalibriert
