# Produktbeschreibung — kanonische SPEC + RECIPE (DE)

> Abgeglichen aus: temoa-os `buildPrompt.js`, Blog 07 (A+-Verhältnis), Blog 74 (AEO/Rufus), temoa-audit Brand-Voice.

## SPEC (hart)

| Regel | Wert | Anmerkung |
|---|---|---|
| Max. Größe | **1.999 Bytes UTF-8** | temoa-os-Konvention, konservativ unter dem 2.000-Zeichen-Limit; via TextEncoder, Trim am Satzende |
| Kein Bullet-Duplikat | Beschreibung wiederholt Bullets nicht 1:1 | analog Blog-07-Regel für A+ |
| Verboten | Preise/Versand, Wettbewerber-Marken, unbelegte Claims, Kontakt-/URL-Angaben | Amazon-Policy |

**Ausschöpfung (07/2026):** Ziel ≥1.700 von 1.999 Bytes — maximale Datengrundlage, kein Füllwort-Padding.

## RECIPE

- **Auch mit A+ pflegen:** A+ ersetzt die Beschreibung visuell auf der Produktseite, aber die Beschreibung bleibt relevant (mobile Ansichten, Indexierung). A+-Text wird NICHT vom Suchalgorithmus indexiert (Blog 07) — Keywords gehören hierher, nicht ins A+.
- **Struktur:** Positionierung/Story → Nutzenargumente mit Belegen (Maße, Material, Normen) → Einwandbehandlung (Haltbarkeit, Kompatibilität, Pflege) → weicher CTA.
- **TERTIARY-Keywords** (temoa-os Tiering) organisch einweben — kein Stuffing.
- **AEO-tauglich (Blog 74; Stand 05/2026: Rufus wurde durch „Alexa for Shopping" ersetzt):** durchgehende Aussagesätze, die typische Kundenfragen IMPLIZIT als klaren Fakt beantworten — NICHT das „Frage? Antwort."-Muster und KEINE Frage-Sätze (das ist die Q&A-Sektion, nicht die Beschreibung). Die Beschreibung ist zusammenhängende Marketing-Prosa, aus der KI-Assistenten Fakten zitieren; sie entsteht datenbasiert aus Produkt-Wahrheit, USPs, Pain Points und Keywords. AEO-Checkliste: vollständige Attribute als Aussagen, natürliche Sprache, saubere Fakten, keine interrogativen Sätze im Beschreibungstext (deterministisch geprüft: `description.frage`).
- Brand-Voice: nüchtern-deutsch, aktive Verben, konkrete Zahlen, keine englischen Marketing-Floskeln.

## VALIDATION

Bytes ≤1.999 (TextEncoder, Satzende-Trim) · Bullet-Dedup (Ähnlichkeits-Check) · Blacklists · Reference-Fidelity gegen Produkt-Stammdaten.
