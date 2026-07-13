# Backend-Keywords — kanonische SPEC + RECIPE

> Abgeglichen aus: temoa-os `buildPrompt.js` + `byteEnforcement.js`, seo-os, Blog 25 (Kundensprache), temoa-audit (invisible keywords).

## SPEC (hart)

| Regel | Wert | Anmerkung |
|---|---|---|
| Max. Größe | **249 Bytes UTF-8** | via `TextEncoder` zählen — Umlaute/ß = 2 Bytes. `String.length` ist FALSCH (seo-os-Fehlerlektion: dort nie validiert) |
| Format | Einzelwörter, Leerzeichen-getrennt, **keine Kommas** | temoa-os |
| Dedup | Kein Wort, das bereits sichtbar in Titel/Bullets/Beschreibung steht | Amazon ignoriert Duplikate → reine Platzverschwendung |
| Verboten | Fremde Markennamen, ASINs, irreführende Begriffe, Dopplungen Singular+Plural (eins reicht) | Amazon-Policy |

**Ausschöpfung (07/2026):** Ziel ≥220 von 249 Bytes — Budget nutzen, Warnung darunter.

## RECIPE — Befüllungs-Priorität (nicht raten, sondern aus Analysen ziehen)

1. **`invisible_keywords` aus dem SOV-Audit** — hohe Suchvolumen, für die wir NICHT ranken (temoa-audit: „die wollen wir am dringendsten aufnehmen").
2. **Rest-Long-Tails aus Cerebro**, die es nicht in Titel/Bullets/Beschreibung geschafft haben (temoa-os Tiering: „Rest → Backend").
3. **Echte Kundensprache aus Reviews** (Blog 25: „Kunden suchen mit anderen Worten als Tools vorschlagen") — Synonyme, Regionalbegriffe, gängige Falschschreibungen, Anwendungskontexte.

Byte-Budget von oben nach unten füllen, wortweise abschneiden an der 249-Byte-Grenze (temoa-os `enforceByteLimit`-Muster).

## VALIDATION

Bytes ≤249 (TextEncoder) · kein Komma · Dedup gegen sichtbaren Text (Wortstamm) · Marken-/ASIN-Blacklist · Singular/Plural-Dedup.
