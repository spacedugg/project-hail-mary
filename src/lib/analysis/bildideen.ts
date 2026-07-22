/**
 * Wahrheits-Filter für visuelle Umsetzungsideen (D134): Bild-Ideen unterliegen
 * denselben Wahrheits-Regeln wie Text. Das Referenz-Tool schlug selbst ein
 * erfundenes Tierarzt-Zitat („Dr. med. vet. Mustermann") vor — genau solche
 * erfundenen Autoritäts-Belege (Experten-Zitate, Testimonials, Siegel,
 * Zertifikate) werden hier deterministisch aussortiert, WENN die
 * Produkt-Wahrheit sie nicht belegt. Entferntes wird ausgewiesen, nie still
 * (D126-Muster).
 */

export type BildIdeenPruefung = {
  zulaessig: string[];
  entfernt: Array<{ idee: string; grund: string }>;
};

/** Autoritäts-Figuren, deren Zitat/Empfehlung/Siegel einen Beleg braucht. */
const AUTORITAETEN = [
  "tierarzt", "tierärzt", "veterinär", "apotheker", "arzt", "ärzt",
  "professor", "prof.", "dr.", "experte", "expert", "wissenschaftler",
];

/** Behauptungs-Kontexte: erst Autorität + Behauptung zusammen sind ein Autoritäts-Beleg. */
const BEHAUPTUNGEN = [
  "zitat", "testimonial", "empfiehlt", "empfehlung", "empfohlen",
  "bestätigt", "entwickelt", "geprüft", "getestet",
];

/** Siegel-/Zertifikats-Vokabular — nur zeigen, was die Produkt-Wahrheit hergibt. */
const SIEGEL = [
  "siegel", "gütesiegel", "badge", "zertifikat", "zertifiziert",
  "prüfzeichen", "auszeichnung", "award", "testsieger", "test-sieger",
];

/**
 * Prüft Bild-Ideen gegen den Beleg-Text (Produkt-Wahrheit: Fakten + Listing +
 * „Wichtige Informationen"). Deterministisch — keine KI-Meinung über KI-Ideen.
 */
export function pruefeBildIdeen(ideen: string[], belegText: string): BildIdeenPruefung {
  const beleg = belegText.toLowerCase();
  const zulaessig: string[] = [];
  const entfernt: BildIdeenPruefung["entfernt"] = [];

  for (const idee of ideen) {
    const t = idee.toLowerCase();
    const autoritaeten = AUTORITAETEN.filter((a) => t.includes(a));
    const behauptet = BEHAUPTUNGEN.some((b) => t.includes(b));
    const siegel = SIEGEL.filter((s) => t.includes(s));

    if (autoritaeten.length > 0 && behauptet && !autoritaeten.some((a) => beleg.includes(a))) {
      entfernt.push({
        idee,
        grund: `Autoritäts-Beleg („${autoritaeten[0]}") ist in der Produkt-Wahrheit nicht belegt — erfundene Experten-Zitate/Empfehlungen sind verboten (D134).`,
      });
      continue;
    }
    if (siegel.length > 0 && !siegel.some((s) => beleg.includes(s)) && !beleg.includes("zertifi") && !autoritaeten.some((a) => beleg.includes(a))) {
      entfernt.push({
        idee,
        grund: `Siegel/Zertifikat ohne Beleg in der Produkt-Wahrheit — keine erfundenen Siegel (D134).`,
      });
      continue;
    }
    zulaessig.push(idee);
  }
  return { zulaessig, entfernt };
}
