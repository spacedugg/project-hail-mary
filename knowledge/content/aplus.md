# A+ Content — kanonische SPEC + Briefing-Regeln

> Quelle: interner A+-Design-Guide (knowledge/sources/aplus-design-guide-2026-07.md,
> Nutzer 20.07.2026) + sales-room-Wissen (Basic/Premium-Grundlagen). E5 gelöst.

## Grundsätze

- **A+ ist nicht such-indexiert** — Keywords gehören in Titel/Bullets/Backend;
  in A+ tragen nur die **Alt-Texte** Keywords (je Modul 1 beschreibender Satz
  mit Haupt-Keyword).
- **Design als Gesamtkomposition**: Module bilden zusammen ein Bild mit
  fließenden Übergängen; Inhalte dürfen über Modulgrenzen laufen.
  - **Premium = seamless** (Nachtrag 21.07., Praxisbeleg Gillette Labs): keine
    Trennlinie → das gesamte A+ wird als EIN durchgehendes Bild komponiert;
    Text- und Bild-Elemente (Ziffern, Verläufe, Kanten, Motive) DÜRFEN
    Modulgrenzen überlaufen — die Module sind nur die technische Zerlegung
    (je 2196 × 900). Übergänge werden beim Entwurf bewusst geplant.
  - **Basic: weißer Trennbalken ist fix** — zwei legitime Strategien:
    (a) kaschieren: Hintergründe Richtung Modulrand weiß gestalten oder weiße
    Elemente einstreuen, sodass die Linie optisch verschwindet; (b) bewusst
    stehen lassen: eine sichtbare Zäsur ist kein Fehler.
- **Marken-Look durchgängig** (Nachtrag 21.07.): Farben, Typografie und
  Bildsprache der Marke vom ersten bis zum letzten Modul — keine generische
  KI-Optik (gleiche Layouts/Stock-Optik wie alle anderen lässt Käufer
  vorbeiscrollen). Jedes Modul trägt EINEN Verkaufsgedanken, in Kundensprache
  aus echten Reviews.
- **Text nur IM Bild** (Designauftrag) — keine Amazon-Textbausteine, keine
  Text-Module. Deshalb entfallen z. B. Vier-Quadranten-Module mit Textfeld.
- **Kein Designauftrag** sind: Basic-Vergleichstabelle, Premium-Vergleichstabelle
  (Varianten ohne Design), Premium FAQ — die werden in Seller Central gepflegt;
  im Briefing nur Inhalts-Zulieferung (Zeilen/Fragen).
- **Briefing nur für Desktop** — Mobil wird 1:1 abgeleitet (Format-Umbau).
- **Briefing-Stil allgemein**: Content-Stoff (USPs, Pain Points, Kaufauslöser,
  Darstellungsweise, Badges) wird geliefert, NICHT starr je Modul verplant —
  Platzierung/Anordnung liegt bei Designer/KI. Variante (Basic/Premium),
  Modul-Anzahl und gewünschte Modultypen werden benannt.

## SPEC Basic A+

| Regel | Wert |
|---|---|
| Maße (alle Bild-Module, Desktop = Mobil) | **1940 × 1200 px** (Höhe darf laut Guide variieren — Standard gilt, außer Briefing sagt anderes) |
| Datei | JPG, < 2 MB |
| Module | max. 7 · **Standard: 6 designte** (1 Platz frei für Vergleichstabelle aus Seller Central) |
| Anordnung | untereinander, weißer Trennbalken (fix) |

## SPEC Premium A+ (genutzte Module)

| Modul | Desktop | Mobil | Regeln |
|---|---|---|---|
| Full Image (**Standard**) | 2196 × 900 | 1440 × 1080 | frei gestaltbar |
| Comparison Table 3 | Produktbilder 732 × 1050 | 1440 × 1080 | nur Produktbilder designen; Tabelle in Seller Central |
| Hotspots (Desktop) | 2196 × 900 | — | 2–6 Hotspots, Layout in Amazon |
| Hotspots (Mobile) | — | 2–8 × 1440 × 1080 | mobil ein Slider; Betonung je Hotspot im Bild |
| Navigation Carousel | 2–5 × 2196 × 900 | 1440 × 1080 | Menü-Bar oben freihalten; keine Layover mobil |
| Regimen Carousel | 2–5 × 2196 × 900 | 1440 × 1080 | Menü stapelt rechts — freihalten |
| Simple Image Carousel | 2–8 × 2196 × 900 | 1440 × 1080 | Pfeile/Punkte fügt Amazon hinzu |
| Full Video | Preview 2196 × 900 (JPG) | — | MP4, min. 960 × 540, < 200 MB, max. ~180 s |

Datei jeweils JPG < 2 MB. Module max. 7, kundenindividuell (Abfrage im Optimizer).

## Für den Brief-Builder

1. Variante wählen (Basic/Premium — je nach Kundenzugang), Modul-Anzahl
   (Basic-Default 6) und gewünschte Modultypen (Premium-Default: Full Images).
2. Brief liefert: Ziel + Design-Ansatz (Komposition, weißer Hintergrund/Float),
   Specs der Variante, dann den CONTENT-STOFF (USPs, Pain Points, Kaufauslöser,
   Kundensprache, Produkt-Wahrheit, gewünschte Badges/Bullets) — ohne starre
   Modul-Zuordnung.
3. Seller-Central-Pflege (Vergleichstabelle/FAQ) als eigener Abschnitt mit
   Inhalts-Vorschlägen, klar als „kein Designauftrag" markiert.
