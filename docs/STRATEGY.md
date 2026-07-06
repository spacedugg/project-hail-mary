# Amazon Listing Optimization Platform — Strategie & Architektur (Nordstern)

> **Status:** Living Document. Wird laufend fortgeschrieben.
> **Letzte Aktualisierung:** 2026-07-06
> **Zweck:** Gemeinsames Zielbild für den Greenfield-Neubau eines zentralen Amazon-Optimierungs-Tools bei Temoa. Kein Code — die Landkarte, an der wir uns über Wochen orientieren.

---

## 1. Die Vision in einem Satz

Ein zentrales Tool, in dem ein Amazon-Listing **vollständig analysiert** (Text + Bilder, vor dem Hintergrund von Zielgruppe, Pain Points, Kaufauslösern und Kundenbewertungen) und daraus ein **organisch perfektes Listing** (Content, Bilder-Briefing, Backend-Keywords) sowie belastbare **Handlungsempfehlungen** (PPC, Keyword-Strategie, Share of Voice) erzeugt werden — mit einem echten, engine-gestützten Score, der den Outreach über digitale Sales Rooms speist.

## 2. Die zentrale Umdeutung (das Wichtigste überhaupt)

Was wie „viele Skills + ein neues Tool" klang, ist in Wahrheit **ein Tool mit drei Ebenen**. Die einzelnen „Skills" (SEO-Text, Competitor, Listing-Analyse, Keyword, Review-Insights, Bild-Briefing, PPC) sind **keine getrennten Apps**, sondern **Analyse-Module, die in genau einen Workflow einlaufen**.

```
┌─────────────────────────────────────────────────────────────────┐
│  OBERFLÄCHEN                                                      │
│  ┌────────────────────────┐      ┌───────────────────────────┐   │
│  │ Internes Workbench      │      │ Sales Room (Tease)        │   │
│  │ (tiefe Analyse+Ausgabe) │─────▶│ liest, was Workbench      │   │
│  │                         │      │ produziert hat            │   │
│  └────────────────────────┘      └───────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3 — MODULE                                                 │
│  Keyword · Competitor · Review-Insights · Listing-Audit ·         │
│  Bild-Audit · Content-Generierung · Bild-Briefing · PPC · SOV     │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2 — DATEN / INGEST  ("Import-First, API-Ready")            │
│  Cerebro-CSV · Amazon-Bulk-Reports · Apify-Reviews ·              │
│  Listing-Scrape (Text + Bilder)                                   │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1 — WISSEN ("Amazon-Brain") — produktunabhängig            │
│  Blog-Prinzipien · Hard-Specs-Datei · 3 Preset-Bibliotheken ·     │
│  Scoring-Rubriken                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **Layer 1 (Wissen)** ist einmal gepflegt und speist jedes Modul. Hier leben die „Skills" als *Wissen*, nicht als App.
- **Layer 2 (Daten)** trennt Ingest strikt von Logik, damit später ein API-Adapter den CSV-Import ersetzen kann, ohne die UI anzufassen.
- **Layer 3 (Module)** sind reine Funktionen/Services, die aus Layer 1+2 ziehen.

## 3. Der eine Workflow: „Listing optimieren"

Dies ist der erste echte Meilenstein und der Outreach-Hook.

```
ASIN rein
   │
   ├─▶ Listing scrapen (Text + Bilder)
   ├─▶ Reviews scrapen (Apify, eigenes + Wettbewerber)
   └─▶ Cerebro-Keywords importieren (CSV)
        │
        ▼
   ANALYSIEREN
   ├─ Keyword-Analyse         (Tiering, Relevanz, Lücken)
   ├─ Competitor-Analyse      (Listings, Preis, Reviews, Sichtbarkeit)
   ├─ Review-Insights         (Reviews → 10–12 Pain Points)
   ├─ Listing-Audit (Text)    (gegen Hard-Specs + Findings-Presets)
   └─ Bild-Audit (Vision)     (Reihenfolge-Logik, Do's/Don'ts)  ← NEU
        │
        ▼
   SYNTHETISIEREN
   └─ Zielgruppe · Pain Points · Kaufauslöser · Bild-Reihenfolge-Logik
        │
        ▼
   ERZEUGEN
   ├─ Content: Titel / Bullets / Beschreibung / Backend  (byte-genau)
   └─ Bilder-Briefing                                    ← NEU
        │
        ▼
   ECHTER SCORE (engine-gestützt, 0–100)
        │
        ▼
   speist Sales-Room-Tease
```

**Getrennte zweite Schiene — „PPC & Performance":** gefüttert aus **Amazon-Bulk-Reports** (Post-Launch/Ist-Daten) → SQP-/N-Gram-/Action-Plan-Engines. Bewusst NICHT vermischt mit der Listing-Schiene, weil es ein anderes Daten-Regime ist:

| Regime | Datenquelle | Frage | Module |
|---|---|---|---|
| **Pre-Launch / Potenzial** | Helium 10 Cerebro (CSV) | „Wofür *könnten* wir ranken?" | Keyword, SOV, Content |
| **Post-Launch / Ist** | Amazon-Bulk-Reports (CSV/API) | „Wie performen wir *tatsächlich*?" | PPC, SQP, Action-Plan |

## 4. Was portiert wird (Kurzfassung — Details in SALVAGE.md)

**Kronjuwelen (portieren, nicht nachbauen):**
- **SQP-Analyse-Engine** (reporting-repo) — rekonstruiert marken-eigene CTR/CVR, splittet Potenzial in Conversion- vs. Sichtbarkeits-Hebel, N-Gram-Waste, regelbasierter Action-Plan, Margin/Break-even-ACoS. Reine, getestete Funktionen. **Der Burggraben.**
- **`buildPrompt.js` + Byte-Enforcement** (temoa-os) — Keyword-Tiering, Slot-basierte Bullets, deterministische Byte-Durchsetzung nach dem LLM-Call. Löst das „Texterstellung ist Zufall"-Problem strukturell.
- **3 Preset-Bibliotheken** (Sales Room) — `findings-presets`, `amazon-reference-presets`, `listing-factor-legends`. Kodifiziertes Agentur-Know-how, zweisprachig.
- **Review-Insights-Flow** (temoa-os) — ASIN → Apify-Scrape → Claude extrahiert Pain Points.
- **Robuste Report-Parser** (reporting-repo) — DE/EN, Zahlenformat-Autodetektion, Header-Aliasing. Der am meisten unterschätzte, teuerste Teil — hier schon gelöst.

**Nur als Wissen/Regeln (Code verwerfen):**
- Gratis-„SEO Operating System" — QA-Engine ist teils kaputt. Regeln & Datenmodell ja, Code nein.
- Blog-Korpus — Prinzipien/Reasoning-Layer, keine harten Specs.

## 5. Bekannte Lücken, die wir NEU bauen / beschaffen müssen

1. **Hard-Specs-Datei** — kanonische Quelle der Wahrheit für Zeichen-/Byte-/Pixel-Limits (Titel je Kategorie, Backend 249 Bytes, Bildmaße, A+-Modulmaße). Existiert nirgends geschlossen; verstreut in `buildPrompt`.
2. **Bild-Analyse (Vision)** — Listing-Bilder auf Reihenfolge-Logik, Do's/Don'ts, USP-Inszenierung prüfen. Kein Repo kann das heute.
3. **Bilder-Briefing-Generator** — strukturiertes Briefing auf Basis der Analyse.
4. **Echte Score-Engine** — ersetzt die manuelle 6-Faktoren-Handeingabe im Sales Room durch berechnete Werte aus den Modulen.
5. **Rechts-/DSGVO-Layer für Scraping** — Apify-Reviews sind aktuell ungeprüft (Amazon.de hartcodiert, keine Zweckbindung). Vor Kundeneinsatz zwingend.
6. **Echtes kompetitives SOV** — heute nur Impression-Share aus SQP, kein Wettbewerber-Ranking-Tracking.

## 6. Roadmap (Phasen — grob, wird verfeinert)

- **Phase 0 — Fundament.** Repo-Setup, Layer-Struktur, Wissens-Layer anlegen (Hard-Specs-Datei + Presets + Prinzipien importieren).
- **Phase 1 — Listing optimieren (der eine Workflow).** Ingest (Scrape/Cerebro/Reviews) → Analyse-Module → Content-Generierung (portiert) → echter Score. **Erster Meilenstein.**
- **Phase 2 — Bild-Intelligenz.** Bild-Audit (Vision) + Bilder-Briefing.
- **Phase 3 — PPC & Performance-Schiene.** SQP-/N-Gram-/Action-Plan-Engines portieren + konsolidieren.
- **Phase 4 — Sales-Room-Anbindung.** Workbench-Output → Tease-Frontend, echter Score.
- **Phase 5 — Härtung.** Legal/DSGVO, Multi-Marktplatz, API-Adapter statt CSV.

## 7. Leitprinzipien

1. **Eine Quelle der Wahrheit pro Fähigkeit.** Fragmentierung (heute 4 Repos mit Überschneidung) ist das Hauptrisiko. Nie zweimal dasselbe.
2. **Import-First, API-Ready.** Ingest von Logik trennen.
3. **LLM generiert, Code erzwingt.** Harte Limits (Bytes, Struktur) deterministisch nach dem LLM-Call durchsetzen — nichts dem Zufall überlassen.
4. **Wissen ist ein Layer, kein Feature.** Blog-Prinzipien + Specs + Presets zentral, versioniert.
5. **Intern zuerst, Kunden später** — sukzessive Freischaltung nach erfolgreicher interner Nutzung.
