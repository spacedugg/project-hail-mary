/**
 * Creative-Briefs (D68): finale Outputs für Designer/Bildgen-Tools —
 * das Tool erstellt KEINE Bilder, sondern das Konzept: alle Richtlinien,
 * Spezifikationen, Brand- und Produktinformationen in einem Dokument.
 * Deterministisch assembliert (wie der Listing-Bilder-Brief); nach D41
 * bewusst OHNE Begründungs-Teil (der gehört in die Kunden-Analyse).
 */

import type { ProductFacts, ReviewInsightsPayload } from "@/db/schema";

type BriefInputs = {
  brand: string;
  productName: string;
  asin?: string | null;
  facts: ProductFacts;
  primaryKeywords: string[];
  reviewInsights: ReviewInsightsPayload | null;
};

const list = (xs: (string | undefined)[] | undefined, fallback: string) => {
  const clean = (xs ?? []).filter((x): x is string => Boolean(x));
  return clean.length ? clean.map((x) => `  - ${x}`).join("\n") : `  - ${fallback}`;
};

/**
 * A+-Content-Brief nach dem internen Design-Guide (D112, E5):
 * allgemeiner Briefing-Stil — Content-Stoff statt starrer Modul-Zuordnung,
 * die Platzierung liegt bei Designer/KI. Variante Basic/Premium mit den
 * echten temoa-Specs; Vergleichstabelle/FAQ sind KEIN Designauftrag.
 * Die kundenindividuelle Abfrage (Variante, Modul-Anzahl, Modultypen) im
 * Optimizer folgt in S3 — bis dahin Defaults: Basic 6 Module / Premium Full Images.
 */
export function buildAplusBrief(i: BriefInputs, variante: "basic" | "premium" = "basic"): string {
  const usps = (i.facts.usps ?? []).slice(0, 5);
  const pains = (i.reviewInsights?.painPoints ?? []).slice(0, 4).map((p) => p.label);
  const triggers = (i.reviewInsights?.buyingTriggers ?? []).slice(0, 4).map((t) => t.label);
  const borrow = (i.reviewInsights?.languageToBorrow ?? []).slice(0, 5);
  // D134: verdichtete Erkenntnisse samt geprüfter Bild-Ideen — Kaufgrund → Modul-Idee
  const cards = (i.reviewInsights?.insightCards ?? []).slice(0, 5);

  const kopf = `A+ CONTENT BRIEF (${variante === "basic" ? "BASIC" : "PREMIUM"}) — ${i.brand} · ${i.productName}${i.asin ? ` (${i.asin})` : ""}
================================================================

DESIGN-ANSATZ (Design-Guide)
  - DESIGN ALS GESAMTKOMPOSITION: Anders als Listing-Bilder (jedes steht für
    sich) wird A+ als Komposition der Bild-Module mit fließenden Übergängen
    gestaltet — Inhalte dürfen über Modulgrenzen laufen.
  - Amazon-Produktseiten sind immer weiß: Float-Effekte über reinweiße
    Hintergründe oder weiße Rahmen.
  - MARKEN-LOOK DURCHGÄNGIG: Farben, Typografie und Bildsprache der Marke vom
    ersten bis zum letzten Modul — keine generische KI-Optik. Jedes Modul
    trägt EINEN Verkaufsgedanken.
  - TEXT NUR IM BILD (Teil des Designs) — keine Amazon-Textbausteine.
  - Briefing gilt für DESKTOP; die Mobil-Variante wird 1:1 abgeleitet
    (nur Format-Umbau).`;

  const specsBasic = `
SPEZIFIKATIONEN (Basic A+, Design-Guide)
  - Alle Bild-Module: 1940 × 1200 px (Desktop = Mobil) · JPG · < 2 MB
    (Höhe darf laut Guide variieren — Standard gilt, außer dieses Briefing sagt anderes)
  - Anordnung auf Amazon: untereinander mit weißem Trennbalken (fix).
    Trennbalken-Strategie wählen: (a) kaschieren — Hintergründe Richtung
    Modulrand weiß gestalten / weiße Elemente einstreuen, sodass die Linie
    optisch verschwindet; oder (b) bewusst als Zäsur stehen lassen (kein Fehler)
  - Umfang: 6 designte Module (Standard — 1 von 7 Plätzen bleibt frei für die
    Vergleichstabelle, die in Seller Central gepflegt wird; abweichende Anzahl
    ggf. unten unter ANPASSUNGEN)`;

  const specsPremium = `
SPEZIFIKATIONEN (Premium A+, Design-Guide — Desktop ≠ Mobil, hier Desktop)
  - STANDARD-MODUL Full Image: 2196 × 900 px · JPG · < 2 MB (Mobil 1440 × 1080)
  - Anordnung auf Amazon: Module stoßen NAHTLOS aneinander (kein weißer Zwischenraum)
    → SEAMLESS komponieren: das gesamte A+ als EIN durchgehendes Bild entwerfen;
    Text- und Bild-Elemente (Ziffern, Verläufe, Kanten, Motive) dürfen
    Modulgrenzen überlaufen — Übergänge bewusst planen (die Module sind nur
    die technische Zerlegung des Gesamtbilds)
  - Verfügbare Module (nur bei Bedarf, sonst Full Images):
    · Hotspots: 2196 × 900, 2–6 Hotspots (Layout setzt Amazon); mobil als Slider (2–8 × 1440 × 1080)
    · Navigation Carousel: 2–5 Slides 2196 × 900 — Menü-Bar oben freihalten, keine Layover mobil
    · Regimen Carousel: 2–5 Slides 2196 × 900 — Menü stapelt rechts, freihalten
    · Simple Image Carousel: 2–8 Slides 2196 × 900 (Pfeile/Punkte setzt Amazon)
    · Full Video: MP4, min. 960 × 540, < 200 MB, max. ~180 s; Preview 2196 × 900 (JPG)
    · Comparison Table 3: NUR Produktbilder designen (732 × 1050) — Tabelle in Seller Central
  - Umfang: bis 7 Module, Standard Full Images (gewünschte Modultypen/Anzahl unten unter ANPASSUNGEN)`;

  const inhalt = `
CONTENT-STOFF (abzubilden — Platzierung & Modul-Aufteilung liegt beim Design)
  Ziel: Einwände abbauen, USPs beweisen, Kauf bestätigen. Kein Keyword-Stuffing —
  SEO passiert im Listing-Text; Keywords tragen NUR die Alt-Texte (je Modul 1
  beschreibender Satz mit Haupt-Keyword: ${i.primaryKeywords.slice(0, 3).join(", ") || "Keywords pflegen"}).

  USPs (jede genau einmal prominent):
${list(usps, "USPs in der Produkt-Wahrheit pflegen")}
  Pain Points (aus echten Reviews — visuell entkräften):
${list(pains, "Bewertungs-Analyse ausführen für echte Pain Points")}
  Kaufauslöser (bestätigen, was überzeugt):
${list(triggers, "Kaufauslöser aus der Bewertungs-Analyse")}
  Kundensprache (nah dran formulieren):
${list(borrow, "—")}
  Verdichtete Erkenntnisse → Modul-Ideen (Bild-Ideen sind wahrheits-geprüft — keine erfundenen Zitate/Siegel):
${cards.length ? cards.map((c) => `  - ${c.titel} (Relevanz ${c.relevanz}/5)${c.bildIdeen[0] ? ` → z. B. ${c.bildIdeen[0]}` : ""}`).join("\n") : "  - Verdichtungs-Etappe der Bewertungs-Analyse ausführen"}
  Zielgruppe/Nutzungskontext: ${i.facts.targetAudience ?? "(Zielgruppe erfassen)"}

PRODUKT-WAHRHEIT (Referenz — NICHTS erfinden, Reference-Fidelity)
  - Produkttyp: ${i.facts.productType ?? "—"} · Maße/Menge: ${i.facts.dimensions ?? "—"}
  - Materialien: ${(i.facts.materials ?? []).join(", ") || "—"}
  - Zertifikate (nur echte zeigen): ${(i.facts.certifications ?? []).join(", ") || "keine hinterlegt"}

KEIN DESIGNAUFTRAG (wird in Seller Central gepflegt — Inhalt liefern, nicht gestalten)
  - ${variante === "basic" ? "Vergleichstabelle (der freigehaltene 7. Modulplatz)" : "Premium-Vergleichstabelle (Var. 1 & 2) und Premium FAQ"}:
    Zeilen/Fragen aus Specs & Pain Points — ${Object.keys(i.facts.specs ?? {}).join(", ") || i.facts.dimensions || "Maße/Material/Zertifikate"}

REGELN FÜR DEN DESIGNER
  - Nur gelieferte Referenzfotos als Produktdarstellung (kein generisches Stock-Produkt)
  - Text im Bild: kurz, gut lesbar, Kontrast AA; Rechtschreibung deutsch
  - Keine Preise, keine "Nr. 1"-Claims, keine fremden Markennamen/Logos, keine erfundenen Siegel

ANPASSUNGEN (kundenindividuell — falls abweichend vom Standard hier eintragen)
  - Modul-Anzahl: __ · gewünschte Modultypen: __`;

  return `${kopf}
${variante === "basic" ? specsBasic : specsPremium}
${inhalt}`;
}

/** Brand-Store-Konzept: Seitenstruktur + Kachel-Plan + Guidelines. */
export function buildStoreConcept(i: BriefInputs & { productNames?: string[] }): string {
  const products = i.productNames?.length ? i.productNames : [i.productName];
  return `BRAND-STORE-KONZEPT — ${i.brand}
================================================================

ZIEL
  Der Store ist die markeneigene Fläche (Brand Registry nötig): Kategorien
  bündeln, Marke erklären, Cross-Sell. Traffic-Quellen: Brand-Anzeigen (SB),
  Byline-Link, Follow.

SEITENSTRUKTUR
  1) HOME: Hero 3000×600 px (Markenwelt, 1 Satz Positionierung),
     darunter Kategorie-Kacheln + Bestseller-Reihe
  2) je KATEGORIE eine Unterseite (shoppable Grid)
  3) PRODUKT-HIGHLIGHT-Seiten für die Held-Produkte:
${list(products, "Produkte anlegen")}

KACHEL-PLAN HOME
  - Hero: Lifestyle mit Held-Produkt (${products[0]}) — Botschaft: ${i.facts.usps?.[0] ?? "Top-USP"}
  - 2er-Reihe: Kategorie-Einstiege (Bild + kurzer Nutzen)
  - Produkt-Grid: Bestseller mit Preis-Widget (automatisch)
  - Video-Kachel (optional): 16:9, ohne Ton verständlich, Untertitel

SPEZIFIKATIONEN (Stand prüfen bei Upload)
  - Hero: 3000×600 px (sichtbarer Kern mittig 1500×450 — mobile Beschnitt!)
  - Kachel-Bilder: min. 1500×1500 px, Text-Overlays sparsam
  - Videos: MP4, max 100 MB, keine Preise/Aktionen einbrennen

GUIDELINES
  - Ein Bildstil (Licht, Farbwelt, Perspektive) über alle Kacheln — Referenzen beilegen
  - Zielgruppe: ${i.facts.targetAudience ?? "definieren"}
  - Keine Wettbewerber-Nennungen, keine externen Links, Claims nur belegt
  - Erfolgsmessung: Store-Insights (Besucher, Umsatz/Besucher) monatlich in die Berichte`;
}
