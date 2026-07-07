# KPI-Kontextualisierung — Kennzahlen sind nie absolut

> Aus Blog 01–04 (ACoS/Benchmarks/TACoS/ROAS) + reporting-repo-Logik. Kern-Prinzip des Nutzers: **„Es gibt nicht den einen richtigen ACoS-Wert."** Jede KPI-Anzeige im Tool trägt ihren Kontext mit.

## Formeln (Single Source of Truth — aus Roh-Summen, nie aus Berichten übernommen)

- ACoS = Spend / Ad-Umsatz · TACoS = Spend / Gesamtumsatz · ROAS = 1/ACoS
- **Break-even-ACoS = Marge vor Werbung** (aus Margen-Rechner je Produkt) — DIE Referenzlinie
- CTR = Klicks/Impressions · CVR = Orders/Klicks · CPC = Spend/Klicks
- org-CR = (Orders − PPC-Orders)/Sessions · PPC-Anteil = PPC-Orders/Orders · AOV = Umsatz/Orders
- Alle Raten aus Summen re-berechnen (reporting-Prinzip); Perioden-Merge: Counts summieren, Raten neu ableiten

## Kontext-Dimensionen (wie das Tool KPIs einordnet)

1. **Marge:** ACoS ist nur gegen den Break-even des konkreten Produkts bewertbar. Ampel: unter Break-even = profitabel, darüber = Investment (bewusst?) oder Problem.
2. **Phase/Ziel:** Launch/Skalierung → TACoS 15–25 %+ normal; etabliert → 5–10 % (Blog 03). Ziel-ACoS pro Portfolio (reporting-repo parst ihn aus Portfolio-Namen: „ACoS Ziel 20%").
3. **Kategorie:** grobe ACoS-Benchmarks (Blog 02): Drogerie/Verbrauch 15–25 %, Haushalt/Küche 20–30 %, Mode 25–35 %, Elektronik-Zubehör 15–25 %, hochpreisige Nische 30 %+.
4. **Zeitfenster:** ACoS/ROAS über 1–2 Wochen bewerten, nicht täglich; TACoS monatlich je Produkt/Linie (Blog 01/03).
5. **TACoS-Muster (Blog 03) — als automatische Trend-Diagnose:** ACoS stabil + TACoS sinkt = ideal (organisch wächst) · beide sinken = sehr gesund · ACoS stabil + TACoS steigt = Warnung Werbeabhängigkeit · ACoS sinkt + TACoS steigt = trügerisch (organische Rankings brechen weg).
6. **Saison/Events:** Perioden-Flags (Prime Day, Q4, Saisonartikel) — reporting-repo hat das Muster (`periodflags`); Ausreißer werden gegen geflaggte Perioden erklärt, nicht alarmiert.

## Konsequenz fürs UI

Keine nackte Zahl ohne Referenz: jede KPI-Kachel zeigt **Wert + Vergleich (Vorperiode/YoY) + Referenzlinie (Break-even/Ziel) + ggf. Perioden-Flag**. Der AI-Advisor argumentiert immer relativ zu diesen Kontexten, nie mit absoluten Schwellen.
