import { KANAL_LABEL, type AbdeckungsStufe, type BildStufe, type KanalTreffer, type TextKanal } from "@/lib/analysis/abdeckung";

/**
 * Blocker-Fälle und ihre Titel (D265).
 *
 * Ein Conversion-Blocker ist kein eigener Befund und kein umformulierter
 * Pain Point — er ist ein DRIVER, dessen Nutzen-Baustein im Listing nicht oder
 * nicht überzeugend bewiesen ist. Nachweis am Referenz-Muster: dort ließ sich
 * jeder der vier Blocker 1:1 auf einen der sieben Driver abbilden, ohne Restmenge.
 *
 * Deshalb schreibt hier der CODE den Titel aus einem Template (D184) — das LLM
 * liefert später nur noch die Präzisierung aus den negativen Kundenstimmen
 * („insbesondere bei maximaler Höhe"). Vorher formulierte das Modell den Titel
 * frei und benannte damit das Thema statt der fehlenden Beweisart; der Titel
 * war so für die Bildproduktion nicht verwertbar.
 *
 * Die zwei Wortfamilien des Referenz-Musters („Fehlender Beweis" vs.
 * „Unzureichender Beweis") sind hier keine Stilvarianten, sondern zwei
 * berechnete Zustände: Beweis nicht vorhanden vs. vorhanden, aber unter der
 * Botschafts-Note.
 */

export const BLOCKER_FAELLE = [
  "fehlt_komplett",
  "nutzen_nicht_benannt",
  "nur_kleingedruckt",
  "bildbeweis_fehlt",
  "beweis_schwach",
] as const;
export type BlockerFall = (typeof BLOCKER_FAELLE)[number];

/**
 * Lücken-Gewicht je Fall: Der Blocker-Score ist der Driver-Score mal diesem
 * Faktor — ein unbewiesener starker Kaufgrund wiegt mehr als ein schwach
 * bebilderter. Reihenfolge = Schwere, damit bei mehreren zutreffenden Fällen
 * der größere gemeldet wird.
 */
export const FALL_GEWICHT: Record<BlockerFall, number> = {
  fehlt_komplett: 1,
  nutzen_nicht_benannt: 0.9,
  nur_kleingedruckt: 0.7,
  bildbeweis_fehlt: 0.6,
  beweis_schwach: 0.4,
};

export type FallEingabe = {
  textStufe: AbdeckungsStufe;
  bildStufe: BildStufe;
  /**
   * true = das zugehörige FEATURE steht im Listing, nur der Nutzen daraus nicht.
   * Kommt aus dem Feature-Ranking (gemeinsame Beleg-Aspekte) und trennt „gar
   * nicht vorhanden" von „Merkmal genannt, Nutzen nicht benannt" — der Fall,
   * den das Referenz-Muster als reine Bildlücke untertreibt („ergonomisch"
   * steht im Bullet, „Rückenbeschwerden" nirgends).
   */
  featureGenannt: boolean;
};

/**
 * Welcher Blocker-Fall liegt vor? null = kein Blocker.
 *
 * Kein Blocker bei „nicht_erfasst" (weder Text noch Bild bewertbar): Eine Lücke
 * behaupten, wo wir nicht hingesehen haben, wäre eine erfundene Aussage.
 */
export function bestimmeBlockerFall(e: FallEingabe): BlockerFall | null {
  const textFehlt = e.textStufe === "fehlt";
  const textUnbekannt = e.textStufe === "nicht_erfasst";
  const bildFehlt = e.bildStufe === "fehlt";

  if (textUnbekannt) return null;

  if (textFehlt) {
    if (e.featureGenannt) return "nutzen_nicht_benannt";
    if (bildFehlt) return "fehlt_komplett";
    // Text fehlt, aber ein Bild belegt es → der Nutzen ist nur visuell da.
    return "nutzen_nicht_benannt";
  }

  if (e.textStufe === "erwaehnt") return "nur_kleingedruckt";

  // Text prominent — dann entscheidet allein der Bildbeweis.
  if (bildFehlt) return "bildbeweis_fehlt";
  if (e.bildStufe === "schwach") return "beweis_schwach";
  return null;
}

export type TitelEingabe = {
  fall: BlockerFall;
  /** Das feature-freie Resultat des Drivers. */
  resultat: string;
  /** Der konkrete Nutzen-Baustein, an dem die Lücke sitzt. */
  baustein: string;
  /** Features, die zum Baustein gehören — für „nutzen_nicht_benannt". */
  features?: string[];
  /** Kanäle mit Treffer — für „nur_kleingedruckt". */
  kanaele?: KanalTreffer[];
  /** Bild-Slot und Botschafts-Note — für „beweis_schwach". */
  slot?: number;
  note?: number | null;
};

const listeKurz = (werte: string[], max = 2): string =>
  werte.slice(0, max).join(", ") + (werte.length > max ? " u. a." : "");

/** Kanäle, in denen ein Nebensatz-Fund landet — für die Titel-Begründung. */
function schwacheKanaele(kanaele: KanalTreffer[]): string {
  const getroffen = kanaele
    .filter((k) => k.stufe === "erwaehnt")
    .map((k) => (k.kanal === "bullets" && k.position ? `${KANAL_LABEL.bullets} (Nr. ${k.position})` : KANAL_LABEL[k.kanal as TextKanal]));
  return getroffen.length ? listeKurz(getroffen) : "einer Nebenstelle";
}

/**
 * Blocker-Titel aus dem Template. Kundentauglich, benennt die fehlende
 * BEWEISART und bleibt damit für Text- und Bildproduktion direkt verwertbar.
 */
export function blockerTitel(e: TitelEingabe): string {
  const r = e.baustein.trim() || e.resultat.trim();
  switch (e.fall) {
    case "fehlt_komplett":
      return `„${r}" kommt im Listing nicht vor — weder im Text noch im Bild`;
    case "nutzen_nicht_benannt":
      return e.features?.length
        ? `„${r}" wird nicht als Nutzen benannt — im Listing steht nur das Merkmal (${listeKurz(e.features)})`
        : `„${r}" wird nicht als Nutzen benannt — das Merkmal steht da, der Vorteil daraus nicht`;
    case "nur_kleingedruckt":
      return `„${r}" steht nur in ${schwacheKanaele(e.kanaele ?? [])} — nicht im Titel und nicht vorn in den Bullets`;
    case "bildbeweis_fehlt":
      return `Kein Bildbeweis für „${r}" — der Text behauptet es, das Bildset zeigt es nicht`;
    case "beweis_schwach":
      return e.slot !== undefined && e.note !== null && e.note !== undefined
        ? `Unzureichender Bildbeweis für „${r}" — Bild ${e.slot}, Botschaft ${e.note.toLocaleString("de-DE")}/5`
        : `Unzureichender Bildbeweis für „${r}" — das Bild transportiert das Argument nicht`;
  }
}

/** Blocker-Score = Driver-Score × Lücken-Gewicht. Deterministisch, vergleichbar. */
export function blockerScore(driverScore: number, fall: BlockerFall): number {
  return Math.round(driverScore * FALL_GEWICHT[fall]);
}
