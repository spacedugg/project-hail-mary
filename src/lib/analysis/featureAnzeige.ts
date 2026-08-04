import type { InsightCard } from "@/db/schema";
import type { BallastFeature } from "@/lib/analysis/driverTypen";
import { KLASSE_LABEL, KLASSE_RANG, KLASSE_RANG_OHNE, type MerkmalKlasse } from "@/lib/analysis/merkmalKlasse";

/**
 * Anzeige-Ordnung der PRODUCT FEATURES (D284, Nutzer-Befund 04.08.2026).
 *
 * Zwei Befunde am Referenz-Produkt (Solar-Poolheizung):
 *
 * 1. „Anschluss Ø 38 mm mit Lieferumfang" stand auf PLATZ 1. Ursache im Ranking
 *    selbst (siehe `featureRanking.ts`): Relevanz zählte JEDEN zugeordneten
 *    Review-Aspekt, auch die Beschwerden über undichte Anschlüsse. Das Merkmal
 *    wurde also gerade deshalb zum wichtigsten Kaufargument, weil Kunden es
 *    kritisieren. Behoben ist dort die Zählweise — hier die Ordnung: Eine
 *    Pflichtangabe wie ein Anschlussmaß gehört UNTER die Merkmale, die einen
 *    Kaufgrund tragen, egal wie oft sie erwähnt wird.
 *
 * 2. „Spürbar wärmeres Poolwasser durch Sonnenkraft" stand als Merkmal in der
 *    Liste — das ist der Kaufgrund, kein Merkmal („das gewünschte Endergebnis,
 *    aber kein Product Feature an sich"). Solche Einträge werden hier AUS der
 *    Liste genommen und gezählt ausgewiesen, statt sie nur nach unten zu sortieren.
 *
 * Die Klassen kommen aus der Merkmal-Einordnung des Driver-Laufs (D282) — sie
 * urteilt über GENAU diese Feature-Titel. Der Code fügt die beiden Läufe
 * zusammen, sortiert und filtert; das Modell entscheidet nur die Bedeutungsfrage
 * (D184). Liegt keine Einordnung vor (Alt-Lauf, Modell-Ausfall), bleibt die
 * Reihenfolge des Rankings erhalten und es wird nichts behauptet (D145).
 */

export type FeatureAnzeige = {
  karte: InsightCard;
  klasse: MerkmalKlasse | null;
  /** Klartext-Label der Klasse — leer, wenn keine Einordnung vorliegt. */
  klasseLabel: string | null;
  begruendung: string | null;
};

export type FeatureOrdnung = {
  /** Die anzuzeigenden Merkmale, in Anzeige-Reihenfolge. */
  merkmale: FeatureAnzeige[];
  /** Als Kaufgrund erkannt und deshalb NICHT als Merkmal gelistet — nie still (D133). */
  ergebnisse: FeatureAnzeige[];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function ordneFeatures(karten: InsightCard[], einordnung: BallastFeature[] | null): FeatureOrdnung {
  const urteil = new Map((einordnung ?? []).map((b) => [norm(b.feature), b]));

  const angereichert: FeatureAnzeige[] = karten.map((karte) => {
    const b = urteil.get(norm(karte.titel));
    const klasse = b?.klasse ?? null;
    return {
      karte,
      klasse,
      klasseLabel: klasse ? KLASSE_LABEL[klasse] : null,
      begruendung: b?.begruendung?.trim() || null,
    };
  });

  const zustimmung = (f: FeatureAnzeige) =>
    f.karte.belegAspekte.filter((a) => a.typ === "buyingTrigger").reduce((s, a) => s + (a.mentionCount ?? 0), 0);
  const rang = (f: FeatureAnzeige) => (f.klasse ? KLASSE_RANG[f.klasse] : KLASSE_RANG_OHNE);

  const merkmale = angereichert
    .filter((f) => f.klasse !== "ergebnis")
    .sort((a, b) => rang(a) - rang(b) || b.karte.relevanz - a.karte.relevanz || zustimmung(b) - zustimmung(a));

  return { merkmale, ergebnisse: angereichert.filter((f) => f.klasse === "ergebnis") };
}
