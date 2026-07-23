# Bullet Points — kanonische SPEC + RECIPE (DE)

> Abgeglichen aus: temoa-os `buildPrompt.js` (Slot-Logik, Bytes), Blog 25 (Käuferfragen zuerst) + Blog 06/07/15, seo-os Scorecard, sales-room Bullet-Presets (13 „Vorher"-Issues), marketplaceadpros (RUFUS-3-Fragen), temoa-audit Brand-Voice, **Blog Bullets/Backend 07/2026 (knowledge/sources/blog-bullets-backend-2026-07.md)**.

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
- **Benefit in die ersten 5–8 Wörter** (Blog 07/2026): die VERSALIEN-Headline IST diese kurze Benefit-Aussage — nie ein Feature-Name („BLEIBT JAHRELANG SCHARF", nicht „GEHÄRTETER EDELSTAHL"). Kunden scannen; Titel/Hauptbild haben schon geklickt, die Bullets bestätigen den Kauf oder schicken zurück in die Suche.
- **Drei-Positionen-Anatomie** (Schaubild Blog 07/2026, Nutzer-Feedback 21.07.): jeder Bullet besteht aus drei festen Positionen in dieser Reihenfolge — **Position 1: Benefit zuerst** (Headline + erste 5–8 Wörter), **Position 2: Feature + Secondary Keyword** (das Feature als Beleg des Benefits, das Keyword natürlich darin integriert — nie angehängt), **Position 3: Use Case + konkrete Details** (für wen/wann geeignet + Material, Maß, Prüfnorm oder Garantie). Muster: „Bleibt jahrelang scharf im täglichen Einsatz. Gehärteter Edelstahl mit dreifach geschliffener Klinge. Kein Nachschärfen nötig. 20 cm Klinge. 10 Jahre Garantie." Dadurch entsteht die Hierarchie, die man beim Scannen sofort erfasst — und jede Position bedient einen Leser: Kunde (Kauf-Frage), Algorithmus (Keyword-Einordnung), Rufus (Use Case).
- **Drei Jobs je Bullet** (Blog 07/2026): jeder Bullet entkräftet einen wahrscheinlichen Einwand, bestätigt einen konkreten Use Case UND bringt ein Secondary Keyword natürlich unter — für Kunden (Kauf-Fragen), Algorithmus (Keyword-Einordnung) und Rufus (Use Case). Keyword-Stapeln auf Kosten der Lesbarkeit verliert alle drei.
- **EIN Bullet = EIN Thema** (Nutzer-Feedback 20.07., Northpoint-Fall): Jeder Satz belegt die Kernaussage der Headline — fachfremde Fakten (Farbtemperatur im Stoßfestigkeits-Bullet) gehören in einen anderen Bullet oder fallen weg.
- **Fakten-Sperre** (Northpoint-Fall): Zahlen, Materialien, Normen und Messwerte NUR aus den Quellen (Produkt-Wahrheit, Listing-IST, Zusatz-Infos, Keywords); fehlende Angaben weglassen statt schätzen; nie Tests/Belege behaupten; Kundenstimmen sind NIE Spec-Quelle. Deterministisch erzwungen durch den Zahlen-Herkunfts-Check im Gate (D114).
- **Zeichenlimit ist kategorieabhängig** (Blog 07/2026) — unser hartes Max (500 Zeichen) ist die konservative Obergrenze; das Prinzip (Benefit → Feature → Konkretes) gilt in jeder Kategorie.
- **Kundensprache übernehmen:** Formulierungen nah an `language_to_borrow_from_real_reviews` (verbatim-nah), vermeiden was in `language_to_avoid` steht.
- **2-Sekunden-Scanbarkeit:** Headline allein muss die Botschaft tragen (sales-room-Preset-Issue).
- Konkrete Zahlen statt Adjektive („hält 24 h kalt" statt „lange kalt").
- **Erwartungsmanagement nicht vergessen** (sales-room-Preset): was das Produkt NICHT kann, ehrlich rahmen → weniger Retouren + bessere Reviews.

## VALIDATION (Checks im Gate)

Anzahl = 5 · Byte-Range je Bullet · Headline-Pattern (Versalien + Doppelpunkt) · USP-Dedup über alle Bullets · Keyword-Frequenz-Fenster · Blacklists (Phrasen, Claims, Marken) · Satz-Anzahl ≤3 (= SPEC, Drift-Fix 23.07.) · Keyword-Echo (roh eingeklebte kleingeschriebene Suchphrasen) · Cross-Bullet-Satzdopplung (Shingle-Overlap) · Feature-Headline (Ziffern-Start) · Headline-Echo im ersten Satz · Reference-Fidelity (Material-/Form-Claims gegen Produkt-Stammdaten).

> **Maschinenwirksame Form (D181):** Die qualitativen Regeln dieses Dokuments stehen strukturiert in `src/lib/validation/register.ts` und fließen von dort in Prompt, Gate und LLM-Prüfer. Änderungen HIER ohne Register-Änderung sind wirkungslos.
