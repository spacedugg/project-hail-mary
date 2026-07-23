# Titel — kanonische SPEC + RECIPE (DE)

> Abgeglichen aus: Blog 06 (Produkttitel), temoa-os `buildPrompt.js`, seo-os Scorecard, sales-room `amazon-reference-presets`, marketplaceadpros title-optimizer, temoa-audit Brand-Voice. Konflikte unten explizit entschieden.

## SPEC (hart, deterministisch prüfbar)

> **⚠️ Spec-Update 07/2026 (Nutzer-Angabe, Amazon-Neuerung):** Produkttitel sind auf **75 Zeichen beschränkt**. Ziel: **70–75 Zeichen — das Budget bestmöglich ausnutzen.** Ersetzt die alte 200-Zeichen-Regel; das Mobile-Fenster ist damit obsolet (der ganze Titel IST das Fenster). Kategorie-Overrides bleiben möglich.

| Regel | Wert | Quelle |
|---|---|---|
| Max. Länge | **75 Zeichen** (hart) | Amazon-Neuerung, Nutzer 07/2026 |
| Ziel-Länge | **68–75 Zeichen PFLICHT** (unter 68 = FEHLER, erzwingt Regenerierung — verschenkter Platz; 68/69 = Puffer, Nutzer-Nachtrag 23.07., D192). Über 75 kürzt der CODE deterministisch von hinten (Segmente → Wörter), Hauptkeyword-Abdeckung bleibt erhalten — Zeichen zählt nie das LLM (D184/D192) | Nutzer-Vorgabe 07/2026 + 23.07. |
| Hauptkeyword | muss im Titel **abgedeckt** sein — Wortstamm-Abdeckung, Flexion/Komposita zählen („Ulmenrinde-Drops für Hunde" deckt „ulmenrinde für hunde"); NIE als wörtliche Phrase erzwungen (D190: die Phrasen-Pflicht erzwang Stuffing) | abgeleitet aus alter 80-Zeichen-Regel, präzisiert 23.07. |
| Keyword-Wiederholung | **Jedes Keyword max. 1×** | Blog 06 („Wiederholung bringt kein Ranking"). Überstimmt seo-os (erlaubte 2×) |
| Begründungs-Pflicht | Jeder generierte Titel liefert eine **Komponenten-Begründung** mit: welcher Bestandteil woher kommt (Keyword-Analyse/SV, USP, Produkt-Wahrheit, Marke) | Nutzer-Vorgabe 07/2026 — „auf Knopfdruck sehen, warum der Titel so formuliert ist" |
| Verboten | Werbephrasen („Bestseller", „Sale", „Angebot", „Top", „Nr. 1"), Emojis, dekorative Sonderzeichen, durchgängige Versalien-Wörter (außer Marke/Norm), Wettbewerber-Marken, Preis-/Versandangaben, unbelegte Superlative | Blog 06 + sales-room-Presets + Amazon-Styleguide |
| Zählweise | **Zeichen** (nicht Bytes) — aber via Grapheme, nicht `String.length` | seo-os-Fehlerlektion |

## RECIPE (Struktur-Kanon DE — 70–75-Zeichen-Budget)

**Reihenfolge (gekürzt fürs 75er-Budget):** `Marke → Produkttyp (=Hauptkeyword) → 1–2 stärkste differenzierende Attribute (Maß/Menge/Material) → ggf. Kernnutzen-Kürzel`. Kernnutzen/Variante nur, wenn Budget reicht — Priorität hat das Hauptkeyword + das kaufentscheidende Attribut.

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

Länge ≤ Kategorie-Limit · Hauptkeyword-Position ≤80 · Keyword-Dedup (Wortstamm) · Phrasen-/Zeichen-Blacklist · CAPS-Ratio · Wettbewerber-Marken-Blacklist · Mindestdichte (≥120 Zeichen Warnung) · Keyword-Echo (roh eingeklebte kleingeschriebene Suchphrasen) · Material-/Claim-Wahrheit gegen Produkt-Stammdaten (Reference-Fidelity, siehe content-knowledge-system.md).

> **Maschinenwirksame Form (D181):** Die qualitativen Regeln (Lesbarkeit, Keyword-Integration, Wirkversprechen, Reihenfolge) stehen strukturiert in `src/lib/validation/register.ts` und fließen von dort in Prompt, Gate und LLM-Prüfer. Änderungen HIER ohne Register-Änderung sind wirkungslos.
