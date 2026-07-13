# Bullet Points — kanonische SPEC + RECIPE (DE)

> Abgeglichen aus: temoa-os `buildPrompt.js` (Slot-Logik, Bytes), Blog 25 (Käuferfragen zuerst) + Blog 06/07/15, seo-os Scorecard, sales-room Bullet-Presets (13 „Vorher"-Issues), marketplaceadpros (RUFUS-3-Fragen), temoa-audit Brand-Voice.

## SPEC (hart, deterministisch prüfbar)

| Regel | Wert | Quelle / Konfliktauflösung |
|---|---|---|
| Anzahl | **genau 5** | alle Quellen einig |
| Länge pro Bullet | **Ziel ≥300 Bytes (Ausschöpfungs-Prinzip 07/2026)**, hartes Max **500 Zeichen** | Nutzer 07/2026: Budget bestmöglich nutzen (kein Muss → Warnung). Ersetzt das alte 200–300-B-Ziel. Bytes via `TextEncoder` |
| Aufbau | **HEADLINE IN VERSALIEN (3–5 Wörter) + Doppelpunkt + max. 3 Sätze** | temoa-os-Muster; 3 statt 2 Sätze wegen Ausschöpfungs-Prinzip |
| Emojis | max. 1 pro Bullet, Default 0 | temoa-audit („Emoji-Spam" ist Preset-Issue) |
| Verboten | Preise/Versand/Aktionen, Garantieversprechen über Amazon-Policy hinaus, Wettbewerber-Marken, unbelegte Superlative („hochwertig" → konkretes Material/Zahl), medizinische/verbotene Claims (Banned-Claims-Liste) | sales-room-Presets + marketplaceadpros + Blog 07 |
| USP-Einmaligkeit | **Jede USP genau 1× über alle 5 Bullets** (Cross-Bullet-Dedup) | eigene Regel — dieselbe Logik wie später bei Bildern (USP-Verteilungs-Problem des Nutzers) |
| Keyword-Budget | 8–12 SECONDARY-Keywords natürlich verteilt; Gesamt-Frequenz-Check gegen Stuffing | temoa-os Tiering + seo-os (6–12 Nennungen gesamt) |

## RECIPE — Slot-Logik × Käuferfragen (der Kern)

Default-Slots (temoa-os), jeder beantwortet eine RUFUS-Frage (marketplaceadpros) und wird **datengetrieben umsortiert**:

1. **HOOK** — stärkster USP + Hauptnutzen („Was ist anders?")
2. **PROBLEM → BENEFIT** — der **häufigste Pain Point aus den Review-Insights**, direkt adressiert („Ist das richtig für mich?")
3. **TRUST** — Material / Norm / Zertifikat / Herkunft, mit Beleg
4. **USAGE** — Anwendung, Kompatibilität, Pflege („Wie benutze ich es?")
5. **CLOSE** — Lieferumfang, Erwartungsmanagement, Varianten-Hinweis

**Umsortier-Regel (Blog 25):** Die drängendste Käuferfrage rückt nach vorn. Wenn `review-insights.pain_points[0].frequency_pct` hoch ist (z. B. „ist sie dicht?"), wird PROBLEM→BENEFIT Slot 1 oder fließt in den HOOK („garantiert auslaufsicher" prominent). Die Slot-Logik ist Default, nicht Dogma — **die Reihenfolge kommt aus den Daten, nicht aus dem Bauchgefühl.**

Weitere Recipe-Regeln:
- **Benefit vor Feature** — Feature ist der Beleg, Nutzen die Aussage (Blog, sales-room-Presets: „Feature-first statt Benefit-first" ist Top-Issue).
- **Kundensprache übernehmen:** Formulierungen nah an `language_to_borrow_from_real_reviews` (verbatim-nah), vermeiden was in `language_to_avoid` steht.
- **2-Sekunden-Scanbarkeit:** Headline allein muss die Botschaft tragen (sales-room-Preset-Issue).
- Konkrete Zahlen statt Adjektive („hält 24 h kalt" statt „lange kalt").
- **Erwartungsmanagement nicht vergessen** (sales-room-Preset): was das Produkt NICHT kann, ehrlich rahmen → weniger Retouren + bessere Reviews.

## VALIDATION (Checks im Gate)

Anzahl = 5 · Byte-Range je Bullet · Headline-Pattern (Versalien + Doppelpunkt) · USP-Dedup über alle Bullets · Keyword-Frequenz-Fenster · Blacklists (Phrasen, Claims, Marken) · Satz-Anzahl ≤2 · Reference-Fidelity (Material-/Form-Claims gegen Produkt-Stammdaten).
