# Item Highlights & Q&A — SPEC + RECIPE

> Neu 07/2026 (Nutzer-Angabe). Beide folgen dem **Ausschöpfungs-Prinzip**: jedes Zeichen-/Byte-Budget bestmöglich nutzen — maximale Datengrundlage für den Algorithmus. Unterausnutzung ist WARNUNG, kein Fehler („kein Muss, aber im besten Fall").

## Item Highlights (neue Amazon-Sektion)

| Regel | Wert |
|---|---|
| Max. Länge | **125 Zeichen gesamt** (hart) |
| Ziel | **115–125 Zeichen** |
| Inhalt | die 2–3 kaufentscheidendsten Fakten, kompakt & konkret, keine Titel-Wiederholung |
| Verboten | Werbephrasen, Claims, Wettbewerber-Marken (gleiche Blacklists wie Titel) |

## Q&A (Datengrundlage für Rufus/Alexa-for-Shopping)

| Regel | Wert | Quelle |
|---|---|---|
| Anzahl | **genau 5 Paare** | temoa-os buildPrompt |
| Frage | max. 110 Zeichen | temoa-os |
| Antwort | max. 230 Zeichen, **Ziel ≥180** (Ausschöpfung) | temoa-os + Nutzer 07/2026 |
| Inhalt | echte Kaufhürden-Fragen (aus Pain Points/Reviews), faktenbasierte Antworten aus der Produkt-Wahrheit | Blog 25/74 |

## Ausschöpfungs-Prinzip (gilt für ALLE Sektionen — Nutzer 07/2026)

| Sektion | Budget | Ziel (Warnung darunter) |
|---|---|---|
| Titel | 75 Zeichen | 70–75 |
| Item Highlights | 125 Zeichen | 115–125 |
| Bullet (je) | 500 Zeichen | ≥300 Bytes |
| Backend | 249 Bytes | ≥220 Bytes |
| Beschreibung | 1.999 Bytes | ≥1.700 Bytes |
| Q&A-Antwort | 230 Zeichen | ≥180 |

Substanz, kein Füllwort-Padding — das Budget wird mit Fakten gefüllt, nicht mit Phrasen.

## Begründungs-Pflicht (alle Sektionen — Nutzer 07/2026)

Jede generierte Sektion liefert eine **Komponenten-Begründung** (Teil ← Herleitung: Keyword-Analyse/SV, USP, Pain Point, Produkt-Wahrheit, Slot). LLM-Behauptungen werden **deterministisch gegen den Text verifiziert** (⚠︎ = unbelegt). Die Begründung gehört in die **Kunden-Analyse**; der **Bilder-Prompt bleibt begründungsfrei** (er wird auf Basis der Analyse gebaut, trägt aber selbst keine Rechtfertigungen).
