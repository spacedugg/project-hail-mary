# Content-Generierungs-Wissenssystem (Layer 1, konkretisiert)

> **Status:** v0 Design-Sketch. Der Wissens-Layer aus STRATEGY.md, konkret gemacht.
> **Kernprinzip:** Erzeugungs-Qualität über dem Niveau aller Bestandsteile — durch ein regelgesteuertes System, nicht durch einen einzelnen Prompt.

## Warum das existiert

Die bestehenden Tools (eigene wie fremde) sind bei der Content-Erzeugung **flach**: sie *erzeugen*, aber sie *prüfen nicht*. Ergebnis: Bild-Briefings mit USP-Wiederholung (innerhalb eines Bildes UND über das Listing hinweg), falscher Reihenfolge etc. Das Ziel ist nicht Konsolidierung um ihrer selbst willen, sondern ein **höheres Qualitätsniveau** durch ein System, das Regeln erzwingt.

Prinzip (wie bei temoa-os' Byte-Enforcement für Text): **Das LLM schlägt vor, der Code/Validator erzwingt.**

## Die 5 Bausteine (pro Content-Typ)

Für jeden Content-Typ (Hauptbild, Lifestyle-Bild, Infografik, Titel, Bullet, A+-Modul, Beschreibung, Backend-Keywords):

1. **SPEC** — prüfbare harte Vorgaben. Bildmaße/Pixel, „Produkt füllt ≥85 %", weißer Hintergrund, kein Text im Hauptbild (DE), max. 1 USP pro Bild, Slot-/Reihenfolge-Logik, Zeichen-/Byte-Limits, erlaubte/verbotene Elemente (vgl. Banned-Claims-Liste). → Ins Repo, versioniert (Config/Text).
2. **RECIPE** — die Methode/Anleitung zur Erzeugung (z. B. der bestehende große Hauptbild-Prompt). → Ins Repo, versioniert.
3. **REFERENCES** — getaggte Vorbilder (gute Amazon-Beispiele, Produkt-Referenzen) mit Begründung „warum gut". → Objektspeicher + DB mit Metadaten (Content-Typ, Kategorie, Marktplatz). NICHT ins Git-Repo (Binärdateien).
4. **GENERATION** — SPEC + RECIPE + kuratierte REFERENCES + Produkt-/Analyse-Kontext → Briefing/Asset. Referenzen werden **relevanzgefiltert** (2–5 passende), nicht alle mitgegeben.
5. **VALIDATION** — erzwingt SPEC am Ergebnis, auch **über mehrere Assets hinweg** (Cross-Asset): USP-Einmaligkeit über das gesamte Bildset, korrekte Slot-Reihenfolge, Slot-Belegung. Teils deterministisch (Anzahl/Reihenfolge), teils Vision-/LLM-Check (visuelle USP-Redundanz).

**Die Bestandstools haben nur Baustein 4.** Deshalb sind sie flach. Baustein 1 + 5 sind der Qualitätssprung.

## Konkrete VALIDATION-Regeln aus temoa-audit (bereits hart erarbeitet)

Das bestehende Audit-Tool hat zwei Bild-Brief-Regeln, die genau die „fehlerhaften Briefings"-Klage adressieren. Sie gehören in unsere VALIDATION-Schicht (deterministisch, nicht als Prosa-Bitte an ein Bildmodell):

1. **Reference-Fidelity-Lock** — Material-/Form-/Farb-Claims dürfen das Produkt NICHT über die Wahrheit hinaus idealisieren. Bildmodelle priorisieren Brief-Text über Referenzbilder → bei absoluten Claims („ALUMINIUM STATT KUNSTSTOFF", obwohl Hybrid Alu+ABS) generieren sie eine geschönte Variante → Käufer sieht was anderes als geliefert → Reklamationen + 1-Sterne. Regel: Hybrid-Materialien ehrlich beidseitig nennen; keine ausschließenden „STATT X"-Claims wenn Produkt X enthält; Claims 1:1 gegen die echte Produktwahrheit (Original-Bullets/Specs) prüfen.
2. **Spelling-Risk-Constraints** — Bildgen-Modelle verkacken lange deutsche Komposita („VERARBEITET"→„VERARBEEITET"). Regel: pro Wort max. 12 Zeichen; pro Headline max. 1 Wort > 8 Zeichen; im Zweifel kürzen/zerlegen/englisch. Substitut-Tabelle pflegen (z. B. „BEWEGUNGSMELDER" → „PIR-SENSOR").

Beide sind **prüfbare SPEC + VALIDATION**, kein Prompt-Wunsch — genau der Hebel, der die Qualität hebt.

## Wiederverwendbare Output-Kontrakte (aus temoa-audit, siehe SALVAGE.md §7)

- **Bild-Brief-Struktur** (copy-paste-ready): Produkt-Wahrheit · Top-3-Audit-Findings→Bild-Konsequenz · Headlines verbatim aus Bullets · Differentiation-Hooks (ohne Wettbewerber-Marken) · Pain-Points→Szenen · Borrowed Phrases · Sprache-vermeiden · ABSOLUTE FORBIDDEN (Hauptbild pure white, keine Badges/Marken/Marketing-Text).
- **review-insights-Schema** (Pain Points + Kaufauslöser mit frequency_pct + verbatim quotes) als Output-Kontrakt des Review-Moduls.
- **8-Dim-Audit** als Grundraster der Listing-Diagnose (mit echtem Score-Engine statt Prosa).

## Speicher-Aufteilung (Entscheidung)

| Artefakt | Ort | Grund |
|---|---|---|
| SPEC (Regeln, Limits) | Repo (Config/Text), versioniert | Code-nah, Diff-/Historie-fähig; bei ToS-/Guideline-Änderung sichtbar wann/warum |
| RECIPE (Prompts/Methoden) | Repo, versioniert | dito |
| REFERENCE-Bilder | Objektspeicher + DB (Metadaten) | Binärdateien blähen Repo; nicht-technisches Team pflegt via UI |

**Bereits vorhandenes Muster:** Sales Room hat `referenceImages`/`referenceListings` — getaggte Design-Beispielbibliothek pro Kategorie/Layout. → portieren & erweitern, nicht neu erfinden.

## Volatilität

SPEC + RECIPE sind ein **versionierter Daten-/Config-Layer, getrennt vom Anwendungscode** — änderbar ohne Programmierung, mit Historie. Guidelines/ToS/Best Practices ändern sich; die Struktur bleibt, der Inhalt ist v1 und darf unvollständig sein.

## Zusammenspiel mit dem Workflow

USPs / Pain Points / Kaufauslöser sind **Output der Analyse-Phase** (Reviews + Competitor). Das Bild-Briefing ist nachgelagert: es bekommt das strukturierte USP-Set und **verteilt es regelkonform** über die Bilder (jede USP einmal, richtige Reihenfolge). Damit ist „USP-Wiederholung" eine erzwungene Verteilungsregel, kein Zufall.

## Erster konkreter Schritt (reine Wissensarbeit, kein App-Code)

**Blaupause an EINEM Content-Typ: das Hauptbild** (stärkster Conversion-Hebel laut Blog-Korpus; Rohmaterial vorhanden).

1. Nutzer legt bestehenden Hauptbild-Prompt + 2–3 Referenzbilder ins Repo (`knowledge/main-image/`).
2. Gemeinsam zerlegen in SPEC / RECIPE / REFERENCES / VALIDATION.
3. Ergebnis = Schablone für alle weiteren Content-Typen.
