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

/** A+-Content-Brief: Modul-Plan mit Amazon-Spezifikationen + Inhalt je Modul. */
export function buildAplusBrief(i: BriefInputs): string {
  const usps = (i.facts.usps ?? []).slice(0, 4);
  const pains = (i.reviewInsights?.painPoints ?? []).slice(0, 3).map((p) => p.label);
  const triggers = (i.reviewInsights?.buyingTriggers ?? []).slice(0, 3).map((t) => t.label);

  return `A+ CONTENT BRIEF — ${i.brand} · ${i.productName}${i.asin ? ` (${i.asin})` : ""}
================================================================

ZIEL
  A+ ersetzt die Beschreibung visuell: Einwände abbauen, USPs beweisen,
  Vergleich klären. Kein Keyword-Stuffing — SEO passiert im Listing-Text;
  A+-Alt-Texte tragen die Keywords (siehe unten).

AMAZON-SPEZIFIKATIONEN (Standard-A+, Stand prüfen bei Upload)
  - Logo: 600×180 px
  - Bild-Header mit Text: 970×600 px
  - Vier Bilder & Text (Quadrant): 220×220 px je Bild
  - Vergleichstabelle: bis 6 Spalten, Produktbilder 150×300 px
  - Text: kein Hersteller-Werbeversprechen ohne Beleg, keine Preise,
    keine Garantie-Aussagen, keine Kontaktdaten
  - Alt-Texte: je Modul 1 beschreibender Satz MIT Haupt-Keyword
    (${i.primaryKeywords.slice(0, 3).join(", ") || "Keywords aus Sektion 2 pflegen"})

MODUL-PLAN (Reihenfolge = Argumentationskette)
  1) BILD-HEADER (970×600): Held im Nutzungskontext (${i.facts.targetAudience || "Zielgruppe definieren"}).
     Headline-Botschaft: ${usps[0] ?? "Top-USP aus der Produkt-Wahrheit"}
  2) VIER-QUADRANTEN (4× 220×220): je Quadrant EIN USP mit Detail-Foto —
${list(usps, "USPs in der Produkt-Wahrheit pflegen (Sektion 1)")}
  3) EINWAND-MODUL (Bild + Text): die häufigsten Kauf-Einwände direkt beantworten —
${list(pains, "Review-Insights ausführen für echte Pain Points (auch der Wettbewerber)")}
  4) VERGLEICHSTABELLE: dieses Produkt vs. 2–3 eigene Varianten ODER generischer
     Wettbewerbsvergleich über Eigenschaften (nie Wettbewerber-Marken nennen).
     Zeilen aus den Specs: ${Object.keys(i.facts.specs ?? {}).join(", ") || i.facts.dimensions || "Maße/Material/Zertifikate"}
  5) ABSCHLUSS-BANNER: Kaufauslöser bestätigen —
${list(triggers, "Kaufauslöser aus den Review-Insights")}

PRODUKT-WAHRHEIT (Referenz — NICHTS erfinden, Reference-Fidelity)
  - Produkttyp: ${i.facts.productType ?? "—"} · Maße/Menge: ${i.facts.dimensions ?? "—"}
  - Materialien: ${(i.facts.materials ?? []).join(", ") || "—"}
  - Zertifikate (nur echte zeigen): ${(i.facts.certifications ?? []).join(", ") || "keine hinterlegt"}

REGELN FÜR DEN DESIGNER
  - Nur gelieferte Referenzfotos als Produktdarstellung (kein generisches Stock-Produkt)
  - Text im Bild: kurz, ≥ 24 px Äquivalent, Kontrast AA; Rechtschreibung deutsch
  - Keine Preise, keine "Nr. 1"-Claims, keine fremden Markennamen/Logos`;
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
