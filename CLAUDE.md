# Arbeitsvertrag — verbindliche Regeln für jede Arbeit in diesem Repo

## Nutzer-Input-Grundgesetz (D180, 23.07.2026)

1. **Jeder Nutzer-Input findet direkte Anwendung im Tool** — außer der Nutzer markiert ihn ausdrücklich als „für später merken". Wissen, das nur dokumentiert wird, gilt als NICHT umgesetzt.
2. **Verwertungs-Nachweis ist Pflicht:** Bei jedem verarbeiteten Input dem Nutzer explizit benennen: (a) WO er im Tool landet (Datei/Modul/Check/Prompt), (b) WIE er den Output verbessert, (c) WIE er verwertet wird (Regel-Register? Gate-Check? Prompt? UI?). Unklare Inputs → nachfragen statt interpretieren.
3. **Wissen ist für das System, nicht für Menschen:** `knowledge/` ist Input für den Algorithmus. Eine Regel existiert erst, wenn sie (a) strukturiert im Regel-Register vorliegt, (b) in die Generierung fließt, (c) maschinell geprüft wird und (d) bei Verstoß durchgesetzt wird (Fix/Regenerierung/Block). Siehe D181.

## Verbindlichkeits-Architektur (D181–D185, 23.07.2026)

- **Regeln sind Gesetze, keine Empfehlungen.** Qualitativ wie quantitativ. Es gibt keine „Handlungsempfehlung" an das LLM — es gibt Prozesse, Checks und erzwungene Outputs.
- **QM-Pflichtschleife (D182):** Kein generiertes Ergebnis wird sichtbar oder freigegeben ohne: Kontrakt-Validierung → deterministisches Gate + deterministische Fixer → IMMER LLM-Prüfer (Prüfprotokoll je Regel: bestanden/verletzt + Beleg) → bei Findings Korrektur oder Regenerierung. Nur fehlerfreie Ergebnisse erreichen den Nutzer. Ein sichtbarer Regelverstoß ist ein Tool-Bug: jedes Blockier-Ereignis wird geloggt und ist ein Bau-Auftrag (neuer Fixer, neuer Check, neue Input-Pflicht).
- **Daten-Kontrakte (D183):** Jede Übergabe zwischen Stufen (Input → Analyse → Generierung → QM → Anzeige) ist schema-validiertes JSON. Schema-Verstoß wird an der Grenze abgewiesen — nie stillschweigend weitergereicht, nie „repariert und gehofft".
- **LLM-Entmachtung (D184):** Alles, was Code entscheiden kann, entscheidet Code (Zusammenbau, Zählen, Kürzen, Dedup, Groß-/Kleinschreibung). Das LLM liefert Bausteine als JSON, nie fertige unkontrollierte Endprodukte. Deterministische Fixer laufen VOR jedem Regenerier-Versuch.
- **Datenfluss-Register:** Für jeden Datenpunkt im Tool (Eingabefeld, Keyword-Liste, Scrape, Bild, Review) ist deklariert: was damit passiert, welche Analysen laufen, was deren Outcomes sind und wo diese weiterverwendet oder angezeigt werden. Kein Datenpunkt ohne deklarierte Kette.

## Bestehende Leitprinzipien (weiter gültig)

- „LLM generiert, Code erzwingt" — D7: deterministische Logik = Tool-Modul; LLM = dünner Layer darüber.
- Fakten-Sperre (D114/D115): Zahlen/Materialien/Normen nur aus Quellen; fehlend = weglassen, nie schätzen.
- Zahlen und Klassifizierungen rechnet der Code, nie die KI (D154, D170, D178).
