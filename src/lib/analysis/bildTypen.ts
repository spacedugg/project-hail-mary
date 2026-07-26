/**
 * Amazon-Listing-Bildtypen (Nutzer-Vorgabe 26.07., D209) — die EINE gemeinsame
 * Klassifikations-Sprache für alle Bilder im Tool: gescrapte Listing-Bilder
 * (Vision-Auslese, D158) UND selbst gebriefte Bilder.
 *
 * ZWECK: Das System soll verstehen, WELCHE Bildkategorie vorliegt. Das ist
 * bewusst KEINE Regel und KEINE Mindestmenge — es gibt ausdrücklich keine
 * Vorgabe „mindestens 3 Feature + 4 Lifestyle" o. Ä. Nur ein Label je Bild;
 * daraus entsteht eine Verteilung (Verständnis), nie ein Bestanden/Durchgefallen.
 *
 * MAIN-IMAGE-SEMANTIK (Nutzer-Klarstellung): Jedes Listing hat genau EIN
 * Hauptbild — auf Amazon ist das Galerie-Slot 1. Wenn WIR Bilder briefen,
 * entstehen oft mehrere Hauptbild-VARIANTEN (Alternativen, aus denen der Kunde
 * eine auswählt). Diese Varianten zählen zusammen als EIN Slot; sie verdrängen
 * keines der sechs übrigen PT-Bilder und erhöhen die Galerie-Länge nicht.
 */

export const BILD_TYPEN = [
  "main_image",
  "infographic_explainer",
  "feature_highlight",
  "brand_trust",
  "packaging_unboxing",
  "lifestyle_in_use",
  "technical_detail",
] as const;

export type BildTyp = (typeof BILD_TYPEN)[number];

/** Menschlich lesbares Label (UI, Briefings). */
export const BILD_TYP_LABELS: Record<BildTyp, string> = {
  main_image: "Main Image",
  infographic_explainer: "Infographic / Explainer",
  feature_highlight: "Feature Highlight",
  brand_trust: "Brand / Trust",
  packaging_unboxing: "Packaging / Unboxing",
  lifestyle_in_use: "Lifestyle / In-Use",
  technical_detail: "Technical Detail",
};

/** Ein-Satz-Kriterium je Typ — Grundlage für die Vision-Klassifikation. */
export const BILD_TYP_KRITERIUM: Record<BildTyp, string> = {
  main_image: "Freisteller des Produkts auf reinem weißem Hintergrund, ohne Text/Grafik/Requisiten — der Galerie-Erstplatz.",
  infographic_explainer: "Erklärt per Grafik, Diagramm oder Schaubild, wie das Produkt funktioniert oder aufgebaut ist.",
  feature_highlight: "Stellt eine konkrete Produkteigenschaft/Funktion mit Headline oder Pill in den Vordergrund.",
  brand_trust: "Vertrauens-Signale: Marke, Herkunft, Garantie, Zertifikate, Bewertungen, Vergleich mit Konkurrenz.",
  packaging_unboxing: "Verpackung, Lieferumfang oder Unboxing — zeigt, was der Kunde tatsächlich erhält.",
  lifestyle_in_use: "Produkt in echter Anwendung oder Umgebung, oft mit Mensch/Szene (emotionaler Kontext).",
  technical_detail: "Maße, Spezifikationen, Material-Makro oder Technik-Detail — Fakten zum Nachprüfen.",
};

export function istBildTyp(v: unknown): v is BildTyp {
  return typeof v === "string" && (BILD_TYPEN as readonly string[]).includes(v);
}

/**
 * Verteilung der Typen über eine Galerie — reines Verständnis, keine Bewertung.
 * Reihenfolge folgt BILD_TYPEN (stabil), nur belegte Typen erscheinen.
 */
export function typVerteilung(typen: ReadonlyArray<BildTyp | null | undefined>): Array<{ typ: BildTyp; anzahl: number }> {
  const zaehler = new Map<BildTyp, number>();
  for (const t of typen) if (t && istBildTyp(t)) zaehler.set(t, (zaehler.get(t) ?? 0) + 1);
  return BILD_TYPEN.filter((t) => zaehler.has(t)).map((typ) => ({ typ, anzahl: zaehler.get(typ)! }));
}
