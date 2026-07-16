# Backend-Keywords — kanonische SPEC + RECIPE

> Abgeglichen aus: temoa-os `buildPrompt.js` + `byteEnforcement.js`, seo-os, Blog 25 (Kundensprache), temoa-audit (invisible keywords), **Blog Bullets/Backend 07/2026 (knowledge/sources/blog-bullets-backend-2026-07.md)**.

## SPEC (hart)

| Regel | Wert | Anmerkung |
|---|---|---|
| Max. Größe | **249 Bytes UTF-8** | via `TextEncoder` zählen — Umlaute/ß = 2 Bytes. `String.length` ist FALSCH (seo-os-Fehlerlektion: dort nie validiert). **Bei Überschreitung schneidet Amazon NICHT ab, sondern ignoriert das GESAMTE Feld** (Blog 07/2026) — deshalb kappen wir deterministisch wortweise VOR dem Speichern |
| Format | Einzelwörter, Leerzeichen-getrennt, **keine Kommas, keine Satzzeichen** | temoa-os + Blog 07/2026 („Amazon ignoriert Satzzeichen") — jedes Satzzeichen ist verschwendetes Byte |
| Dedup | Kein Wort, das bereits sichtbar in Titel/Bullets/Beschreibung steht | Amazon ignoriert Duplikate → reine Platzverschwendung („Main Keywords verschwenden", Blog 07/2026) |
| Verboten | Fremde Markennamen (Policy-Verstoß + Account-Health-Risiko), ASINs, irreführende Begriffe, Dopplungen Singular+Plural (eins reicht) | Amazon-Policy + Blog 07/2026 |

**Ausschöpfung (07/2026):** Ziel ≥220 von 249 Bytes — Budget nutzen, Warnung darunter.

## RECIPE — Befüllungs-Priorität (nicht raten, sondern aus Analysen ziehen)

1. **`invisible_keywords` aus dem SOV-Audit** — hohe Suchvolumen, für die wir NICHT ranken (temoa-audit: „die wollen wir am dringendsten aufnehmen").
2. **Rest-Long-Tails aus Cerebro**, die es nicht in Titel/Bullets/Beschreibung geschafft haben (temoa-os Tiering: „Rest → Backend").
3. **Synonyme, Abkürzungen, andere Schreibweisen** (Blog 07/2026): die Begriffe, die nicht in den polierten Titel passen — Titel „Edelstahl Rührschüssel" → Backend „salatschüssel backschüssel teigschüssel prep bowl".
4. **Englische Suchbegriffe auf amazon.de** (Blog 07/2026): viele suchen „mixing bowl" statt „Rührschüssel" — dieses Suchvolumen fangen die wenigsten ab.
5. **Echte Kundensprache aus Reviews** (Blog 25: „Kunden suchen mit anderen Worten als Tools vorschlagen") — Regionalbegriffe, Anwendungskontexte.

Byte-Budget von oben nach unten füllen, wortweise abschneiden an der 249-Byte-Grenze (temoa-os `enforceByteLimit`-Muster).

**Konflikt-Notiz Tippfehler:** Die Quelle 07/2026 nennt „Tippfehler" als Backend-Kandidaten; die Amazon-Hilfe („Suchbegriffe effektiv verwenden") erklärt gängige Falschschreibungen für unnötig (die Suche fängt sie ab). Entscheidung: Falschschreibungen NICHT aktiv befüllen — nur wenn nach Priorität 1–5 noch Budget übrig ist.

## VALIDATION

Bytes ≤249 (TextEncoder) · kein Komma (Fehler) · **keine sonstigen Satzzeichen (Warnung — verschwendete Bytes, Blog 07/2026)** · Dedup gegen sichtbaren Text (Wortstamm) · Marken-/ASIN-Blacklist · Singular/Plural-Dedup.
