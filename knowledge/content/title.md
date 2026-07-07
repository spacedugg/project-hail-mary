# Titel — kanonische SPEC + RECIPE (DE)

> Abgeglichen aus: Blog 06 (Produkttitel), temoa-os `buildPrompt.js`, seo-os Scorecard, sales-room `amazon-reference-presets`, marketplaceadpros title-optimizer, temoa-audit Brand-Voice. Konflikte unten explizit entschieden.

## SPEC (hart, deterministisch prüfbar)

| Regel | Wert | Quelle |
|---|---|---|
| Max. Länge | **200 Zeichen** (Kategorie-Limit kann kürzer sein → Kategorie-Override im Wissens-Layer) | temoa-os, seo-os, Blog 06 („häufig ~200") |
| Mobile-Fenster | **Hauptkeyword + Kernaussage innerhalb der ersten 80 Zeichen** (Warnung ab Position >70) | sales-room-Preset (~80), Blog 06 (60–70), marketplaceadpros (75) → konservativ vereinheitlicht |
| Keyword-Wiederholung | **Jedes Keyword max. 1×** | Blog 06 („Wiederholung bringt kein Ranking"). Überstimmt seo-os (erlaubte 2×) |
| Verboten | Werbephrasen („Bestseller", „Sale", „Angebot", „Top", „Nr. 1"), Emojis, dekorative Sonderzeichen, durchgängige Versalien-Wörter (außer Marke/Norm), Wettbewerber-Marken, Preis-/Versandangaben, unbelegte Superlative | Blog 06 + sales-room-Presets + Amazon-Styleguide |
| Zählweise | **Zeichen** (nicht Bytes) — aber via Grapheme, nicht `String.length` | seo-os-Fehlerlektion |

## RECIPE (Struktur-Kanon DE)

**Reihenfolge:** `Marke → Produkttyp (=Hauptkeyword) → differenzierende Attribute (Material, Maß, Menge, Kompatibilität) → Kernnutzen → Variante (Farbe/Größe/Pack)`

- Beispiel-Schema (Blog 06): „Marke – Edelstahl-Trinkflasche 750 ml, auslaufsicher, doppelwandig isoliert, hält 24 h kalt – BPA-frei, mattschwarz".
- **Keyword-Quelle ist nie geraten:** PRIMARY-Keywords (3–4) kommen aus der Keyword-Analyse — bei vorhandenem SOV-Audit haben **Quick-Wins + Top-Revenue-Gaps Vorrang** (temoa-audit-Logik: Rank-Proximity × SV × CPR × Title-Density), sonst Cerebro-Ranking nach Relevanz × Volumen.
- Das stärkste Keyword so früh, dass es im 80-Zeichen-Fenster liegt.
- Zahlen als Ziffern („750 ml", nicht „siebenhundertfünfzig"); „&" statt „und" wo stilistisch passend.
- Kategorie-Playbooks (marketplaceadpros-Muster) als Feinjustierung je Kategorie pflegen — z. B. Supplements: `Marke → Wirkstoff → Dosierung (mg) → Stückzahl → Nutzen → Form`.

## Entschiedene Konflikte

1. **„HAUPTKEYWORD IN CAPS zuerst, Marke danach" (seo-os) — VERWORFEN.** Verstößt gegen Amazon-Styleguide (Marke vorn), wirkt spammy, passt nicht zur Premium-Positionierung. Blog 06 + marketplaceadpros-Playbooks + temoa-Brand-Voice gewinnen: **Marke zuerst.** Ausnahme: schwache/unbekannte Marke → Marke bleibt vorn, aber kurz, damit das Hauptkeyword sicher im Mobile-Fenster liegt.
2. **Keyword 2× erlaubt (seo-os) vs. 1× (Blog) — Blog gewinnt.** 1× ist Regel; grammatikalisch bedingte Zweitnennung ist Warnung, kein Fehler.
3. **„Exakt 200 Zeichen anstreben" (temoa-os) — ABGESCHWÄCHT.** Länge ist kein Selbstzweck; Ziel ist Informationsdichte im Mobile-Fenster + sinnvolle Ausnutzung. Untergrenze-Warnung bei <120 Zeichen (verschenkter Platz), kein Auto-Expand-Zwang auf 200.

## VALIDATION (Checks im Gate)

Länge ≤ Kategorie-Limit · Hauptkeyword-Position ≤80 · Keyword-Dedup (Wortstamm) · Phrasen-/Zeichen-Blacklist · CAPS-Ratio · Wettbewerber-Marken-Blacklist · Mindestdichte (≥120 Zeichen Warnung) · Material-/Claim-Wahrheit gegen Produkt-Stammdaten (Reference-Fidelity, siehe content-knowledge-system.md).
