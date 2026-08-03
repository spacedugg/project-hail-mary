import type { AbdeckungsStufe, BildStufe, KanalTreffer } from "@/lib/analysis/abdeckung";
import type { BlockerFall } from "@/lib/analysis/blockerFall";
import type { MotivKlasse, ScoreAnteil } from "@/lib/analysis/motive";

/**
 * Daten-Kontrakt der Conversion Driver (D265/D183).
 *
 * Liegt bewusst NICHT in `db/schema.ts` wie die älteren Payload-Typen: die
 * Abdeckungs- und Fall-Stufen werden in `abdeckung.ts`/`blockerFall.ts`
 * BERECHNET, und ein zweites Vorkommen derselben Union wäre eine zweite
 * Wahrheit (D183). Das Schema importiert diesen Typ nur für die jsonb-Spalte.
 */

/** Die sieben Erntequellen plus das Kategorie-Kernmotiv als Rückfall. */
export const DRIVER_QUELLEN = [
  "fakten",
  "listing",
  "bilder",
  "wettbewerber_listing",
  "reviews_eigene",
  "reviews_fremde",
  "suchnachfrage",
  "kategorie",
] as const;
export type DriverQuelle = (typeof DRIVER_QUELLEN)[number];

export const QUELL_LABEL: Record<DriverQuelle, string> = {
  fakten: "Produkt-Wahrheit",
  listing: "eigenes Listing",
  bilder: "eigene Bilder",
  wettbewerber_listing: "Wettbewerber-Listing",
  reviews_eigene: "eigene Bewertungen",
  reviews_fremde: "Wettbewerbs-Bewertungen",
  suchnachfrage: "Suchnachfrage",
  kategorie: "Kategorie-Kernmotiv",
};

/**
 * Eine verifizierbare Fundstelle. Ohne mindestens einen Beleg existiert kein
 * Driver — die zulässigen Beleg-ARTEN sind gegenüber dem Vorgänger-Modell
 * erweitert (dort zählte nur ein Review-Aspekt, weshalb ein Kernmotiv der
 * Kategorie strukturell nie entstehen konnte), das Beleg-PRINZIP bleibt.
 */
export type DriverBeleg = {
  quelle: DriverQuelle;
  /** Wortlaut der Fundstelle — verbatim, wo die Quelle Text hat. */
  fundstelle: string;
  /** Wettbewerber-ASIN, Keyword oder Bild-Slot, je Quelle. */
  ref?: string;
};

/** Was der Kunde merkt, und aus welchen Features es entsteht (n Features → 1 Baustein). */
export type NutzenBaustein = {
  nutzen: string;
  features: string[];
  belege: DriverBeleg[];
  /** Überlegen gegenüber dem Wettbewerb — hebt den Beweis hervor, nie die Rangfolge. */
  usp: boolean;
  /** Abdeckung im Listing-Text (Code, abdeckung.ts). */
  textStufe: AbdeckungsStufe;
  kanaele: KanalTreffer[];
  /** Bildbeweis (Code, abdeckung.ts). */
  bildStufe: BildStufe;
  bildSlot?: number;
  bildNote?: number | null;
};

/** Das Resultat, das der Kunde will — feature-frei formuliert. */
export type ConversionDriver = {
  /** Stabile ID (CD1…CDn) — überall danach wird nur referenziert, nie wiederholt. */
  id: string;
  resultat: string;
  motivKlasse: Exclude<MotivKlasse, "hygiene">;
  /** Ein Satz: warum diese Motiv-Klasse (LLM-Zuordnung, Code erzwingt die Ordnung). */
  motivBegruendung: string;
  bausteine: NutzenBaustein[];
  /** 0–100, Code (motive.ts). */
  score: number;
  /** 1–5 aus dem Score, Code. */
  relevanz: number;
  anteile: ScoreAnteil[];
  /** Nur das Kategorie-Kernmotiv trägt ihn — Pflicht-Driver mit dünner Evidenz. */
  nurKategorie: boolean;
};

/** Driver-Baustein ohne (ausreichenden) Beweis — kein eigener Befund. */
export type ConversionBlockerNeu = {
  /** Verweist auf den Driver. Ein Blocker ohne diese Referenz wird abgewiesen. */
  driverId: string;
  /** Der Baustein, an dem die Lücke sitzt. */
  nutzen: string;
  fall: BlockerFall;
  /** Vom CODE aus dem Template gebaut, nicht vom LLM formuliert (D184). */
  titel: string;
  /**
   * Fliesstext zum Aufklappen (D278, Nutzer 02.08.): was das Listing heute zeigt,
   * was fehlt, was das beim Kaeufer ausloest und warum die Luecke hier wiegt.
   * Ebenfalls deterministisch (blockerBegruendung) — jeder Satz steht auf einem
   * berechneten Wert. Optional, weil Alt-Laeufe ihn nicht haben.
   */
  begruendung?: string;
  /** Driver-Score × Lücken-Gewicht. */
  score: number;
  /**
   * Präzisierung aus den negativen Kundenstimmen dieses Drivers
   * („insbesondere bei maximaler Höhe") — optional, vom LLM, nur aus
   * verifizierten Aspekten.
   */
  praezisierung?: string;
  bildSlot?: number;
  bildNote?: number | null;
};

/**
 * Ein Merkmal im Listing mit seiner Einordnung (D282).
 *
 * Vorher hiess dieser Typ „Ballast" und meinte „zahlt auf kein Resultat ein,
 * belegt also Flaeche ohne Wirkung". Beides war falsch: Der Abgleich lief ueber
 * exakte Token-Schluessel (praktisch nie ein Treffer), und die Praemisse
 * uebersah, dass Passungs- und Mengenangaben im Listing stehen MUESSEN, auch
 * wenn sie keinen Kaufgrund stuetzen.
 *
 * `klasse` ist optional, weil Alt-Laeufe sie nicht haben — ohne Klasse wird
 * NICHTS behauptet.
 */
export type BallastFeature = {
  feature: string;
  fundstelle: AbdeckungsStufe;
  klasse?: import("@/lib/analysis/merkmalKlasse").MerkmalKlasse;
  /** Ein Satz aus der Einordnung — warum diese Klasse. */
  begruendung?: string;
};

/**
 * Seller-Sache, aber nicht über den Listing-Text lösbar (Produktverpackung,
 * Transportschaden). Wandert in den Produkt-Feedback-Block — getrennt von allem
 * Listing-Wirksamen, damit daraus nie eine Text-Maßnahme wird (Nutzer 30.07.).
 */
export type ProduktFeedback = { label: string; typ: "painPoint" | "buyingTrigger"; mentionCount: number | null };

export type ConversionDriverPayload = {
  driver: ConversionDriver[];
  blocker: ConversionBlockerNeu[];
  ballast: BallastFeature[];
  produktFeedback: ProduktFeedback[];
  /** Kandidaten unter der Schwelle — gezählt, nie still (D133). */
  verworfen: number;
  /** Ehrliche Grenzen: Notbremse, Pflicht-Driver, nicht erfasste Kanäle, Gate-Ausschlüsse. */
  hinweise: string[];
  stats: { stichprobe: number; wettbewerberGesamt: number; suchvolumenGesamt: number };
};
