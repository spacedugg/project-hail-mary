import type { BildTyp } from "@/lib/analysis/bildTypen";
import type { ConversionDriverPayload } from "@/lib/analysis/driverTypen";
import type { ProductFacts } from "@/db/schema";

/**
 * Bilder-Briefing (D269) — strukturiert statt Textwand.
 *
 * Der Vorgänger (`imageBrief.ts`) lieferte EINEN Markdown-String, der als
 * `<pre>` ins Briefing-Feld geknallt wurde: Sternchen, Bindestriche,
 * Raute-Überschriften. Weder lesbar noch strukturiert. Und er schrieb einen
 * festen 7-Slot-Plan samt Headlines und Szenen-Regie vor — das widerspricht
 * D209/D211 („keine Mindestmengen, Labels sind Verständnis, kein Gate“) und der
 * Nutzer-Vorgabe 31.07.
 *
 * Was das Briefing JETZT enthält (Nutzer-Vorgabe):
 *  - je Bild die KONZEPT-IDEE: was soll rüberkommen
 *  - die Findings aus den Analysen: warum gerade das
 *  - den heutigen Stand, damit ersichtlich ist, was ersetzt und was
 *    nachgeschärft wird
 *
 * Was es bewusst NICHT enthält:
 *  - konkrete Bildtexte/Headlines — der Designer behält freie Hand
 *  - Szenen-Regie mit Lichtsetzung, Perspektive, Brennweite
 * Beides wird deterministisch erzwungen (`pruefeKonzeptFreiheit`), nicht erbeten.
 */

export type KonzeptStatus = "neu" | "ersetzen" | "nachschaerfen";

export type BriefKonzept = {
  /** K1…Kn — damit man im Gespräch darauf zeigen kann. */
  id: string;
  /** Kaufgründe, die dieses Bild beweisen soll (Driver-IDs des Analyse-Laufs). */
  driverIds: string[];
  /** Das Resultat in Klartext — das WAS. */
  resultat: string;
  /** Die Konzept-Idee: was rüberkommen soll. Kein Text, keine Szenen-Regie. */
  konzept: string;
  /** Vorschlag, kein Muss (D209: Labels sind Verständnis, kein Gate). */
  typ: BildTyp | null;
  /** Warum gerade das — Befunde aus der Analyse. */
  findings: string[];
  /** Bestehendes Bild, das das Thema anfasst; null = es gibt noch keins. */
  bezugSlot: number | null;
  status: KonzeptStatus;
};

export type BestandsBild = {
  slot: number;
  typ: BildTyp | null;
  /** Was heute darauf zu sehen ist (aus der Vision-Auslese). SPRACHGEBUNDEN. */
  inhalt: string;
  design: number | null;
  botschaft: number | null;
  klarheit: number | null;
  /** „wie besser“ aus dem Bild-Audit, wenn vorhanden. */
  hinweis?: string;
};

export type BildBriefingPayload = {
  /** Sprache DIESES Briefings — nicht die des Listings. */
  sprache: "de" | "en";
  kopf: {
    produkt: string;
    marke: string;
    asin: string | null;
    marktplatz: string;
    /** Sprache des LISTINGS — bleibt unabhängig von der Briefing-Sprache. */
    listingSprache: string;
  };
  /** Zwei Sätze: worum es in diesem Auftrag geht. */
  auftrag: string;
  /** Angaben, die stimmen MÜSSEN (Reference-Fidelity-Lock). SPRACHGEBUNDEN. */
  produktWahrheit: string[];
  /** Harte Verbote: Amazon-TOS + Fakten-Sperre. */
  verboten: string[];
  konzepte: BriefKonzept[];
  bestand: BestandsBild[];
  /** O-Töne der Kunden — SPRACHGEBUNDEN, werden nie übersetzt. */
  kundensprache: { uebernehmen: string[]; vermeiden: string[] };
  grenzen: string[];
};

/**
 * Felder, die auch in einem englischen Briefing in der ORIGINALSPRACHE bleiben
 * (Nutzer-Vorgabe 31.07.): Ein englischsprachiger Designer gestaltet hier ein
 * DEUTSCHES Listing. Kundenzitate, Produktangaben und der ausgelesene
 * Bildinhalt beziehen sich auf dieses deutsche Listing — sie zu übersetzen
 * würde Belege verfälschen.
 */
export const SPRACHGEBUNDEN = ["produktWahrheit", "kundensprache", "bestand[].inhalt"] as const;

/** Harte Obergrenzen — ein Briefing, das mitwächst, liest niemand. */
export const BRIEF_GRENZEN = { konzepte: 7, findingsJeKonzept: 3, wahrheit: 8, kundensprache: 5 } as const;

/**
 * Konzept-Freiheit erzwingen (Nutzer-Vorgabe 31.07.): keine vorgeschriebenen
 * Bildtexte, keine Szenen-Regie. Der Designer soll wissen, WAS rüberkommen
 * soll — nicht, wie er es ausleuchtet oder welche Headline er setzt.
 */
const REGIE_WOERTER =
  /\b(licht|beleuchtung|ausleucht\w*|lichtsetzung|softbox|gegenlicht|schlagschatten|perspektive|kamerawinkel|brennweite|blende|iso|weitwinkel|makro|froschperspektive|vogelperspektive|bildausschnitt|goldener schnitt|lighting|backlight|softbox|aperture|focal length|camera angle|wide[- ]angle|low[- ]angle|high[- ]angle)\b/i;

/**
 * Ein Zitat mit mehr als zwei Wörtern liest sich als vorgeschriebene Headline.
 * Anführungszeichen als Unicode-Escapes, damit die Zeichenklasse nicht durch
 * Editor- oder Skript-Ersetzungen still kippt (genau das ist hier einmal passiert):
 * U+201E „ · U+201C “ · U+201D ” · U+0022 " · U+0027 '
 */
const ZITAT_ZEICHEN = "\u201E\u201C\u201D\u0022\u0027";
const HEADLINE_ZITAT = new RegExp(`[${ZITAT_ZEICHEN}]([^${ZITAT_ZEICHEN}]{6,})[${ZITAT_ZEICHEN}]`);

export function pruefeKonzeptFreiheit(konzept: string): { ok: boolean; verstoesse: string[] } {
  const verstoesse: string[] = [];
  const regie = konzept.match(REGIE_WOERTER)?.[0];
  if (regie) verstoesse.push(`Szenen-Regie („${regie}“) — der Designer entscheidet Licht und Perspektive selbst`);
  const zitat = konzept.match(HEADLINE_ZITAT)?.[1];
  if (zitat && zitat.trim().split(/\s+/).length > 2) {
    verstoesse.push(`vorgeschriebener Bildtext („${zitat.slice(0, 40)}“) — Headlines setzt der Designer`);
  }
  if (/\bheadline\b|\bbildtext\b|\bclaim lautet\b/i.test(konzept)) {
    verstoesse.push("schreibt einen Bildtext vor — im Briefing steht nur, was rüberkommen soll");
  }
  return { ok: verstoesse.length === 0, verstoesse };
}

export type BriefEingabe = {
  produkt: string;
  marke: string;
  asin: string | null;
  marktplatz: string;
  listingSprache: string;
  facts: ProductFacts;
  driver: ConversionDriverPayload;
  bestand: BestandsBild[];
  /** Kundensprache aus der Review-Analyse — sprachgebunden. */
  languageToBorrow: string[];
  languageToAvoid: string[];
  /**
   * Konzept-Ideen je Driver-ID (LLM-Stufe). Fehlt eine, entsteht ein
   * deterministischer Satz aus dem Befund — nie ein Platzhalter.
   */
  konzeptIdeen?: Record<string, string>;
  /** Typ-Vorschlag je Driver-ID (LLM-Stufe, optional). */
  typVorschlaege?: Record<string, BildTyp>;
};

/**
 * Deterministische Assemblierung. Die Konzepte entstehen aus den BLOCKERN mit
 * Bild-Bezug: Sie sind die Stellen, an denen ein belegter Kaufgrund visuell
 * nicht bewiesen ist — genau dort braucht es ein Bild. Kein fester Slot-Plan.
 */
export function baueBildBriefing(e: BriefEingabe): BildBriefingPayload {
  const istBildFall = (f: string) => f === "bildbeweis_fehlt" || f === "beweis_schwach";
  const driverVon = (id: string) => e.driver.driver.find((d) => d.id === id) ?? null;

  const konzepte: BriefKonzept[] = [];
  for (const b of e.driver.blocker.filter((x) => istBildFall(x.fall))) {
    if (konzepte.length >= BRIEF_GRENZEN.konzepte) break;
    const drv = driverVon(b.driverId);
    if (!drv) continue; // Blocker ohne Driver kann es nach D265 nicht geben — defensiv

    const bezugSlot = b.bildSlot ?? null;
    const status: KonzeptStatus =
      b.fall === "beweis_schwach" ? "nachschaerfen" : bezugSlot !== null ? "ersetzen" : "neu";

    const findings = [
      b.titel,
      ...drv.anteile
        .filter((a) => a.quelle === "Eigene Bewertungen" || a.quelle === "Wettbewerbs-Bewertungen" || a.quelle === "Suchnachfrage")
        .map((a) => `${a.quelle}: ${a.beleg}`),
    ]
      .filter(Boolean)
      .slice(0, BRIEF_GRENZEN.findingsJeKonzept);

    const fallback =
      status === "nachschaerfen"
        ? `Das bestehende Bild spricht das Thema an, transportiert es aber nicht überzeugend: „${drv.resultat}“ muss auf einen Blick erkennbar sein.`
        : `„${drv.resultat}“ ist im Bildset nicht bewiesen — dieses Bild soll das Resultat sichtbar machen.`;

    konzepte.push({
      id: `K${konzepte.length + 1}`,
      driverIds: [drv.id],
      resultat: drv.resultat,
      konzept: e.konzeptIdeen?.[drv.id]?.trim() || fallback,
      typ: e.typVorschlaege?.[drv.id] ?? null,
      findings,
      bezugSlot,
      status,
    });
  }

  const f = e.facts;
  const produktWahrheit = [
    f.productType,
    f.dimensions,
    f.materials?.length ? `Materialien: ${f.materials.join(" + ")}` : null,
    ...(f.certifications ?? []),
    ...(f.usps ?? []),
  ]
    .filter((x): x is string => Boolean(x && x.trim()))
    .slice(0, BRIEF_GRENZEN.wahrheit);

  const verboten = [
    "Hauptbild: reines Weiß, nur das Produkt — kein Text, keine Badges, keine Verpackung (Amazon-Vorgabe).",
    "Keine Wettbewerber-Marken und keine Siegel Dritter, die dem Produkt nicht gehören.",
    "Keine Angabe erfinden: Zahlen, Materialien und Normen nur, wenn sie oben unter Produkt-Wahrheit stehen.",
    f.certifications?.length
      ? `Nur diese Zertifikate zeigen: ${f.certifications.join(", ")}.`
      : "Keine Zertifikate oder Prüfsiegel zeigen — für dieses Produkt ist keines erfasst.",
  ];

  const grenzen = [...e.driver.hinweise];
  if (e.bestand.length === 0) {
    grenzen.push("Es liegt keine Bildanalyse vor — der heutige Stand konnte nicht bewertet werden.");
  }
  if (konzepte.length === 0) {
    grenzen.push(
      "Kein Bild-Konzept nötig: Jeder belegte Kaufgrund ist im Bildset bereits bewiesen. Das ist ein Ergebnis, kein fehlender Lauf.",
    );
  }

  return {
    sprache: "de",
    kopf: {
      produkt: e.produkt,
      marke: e.marke,
      asin: e.asin,
      marktplatz: e.marktplatz,
      listingSprache: e.listingSprache,
    },
    auftrag:
      konzepte.length > 0
        ? `Für ${e.produkt} entstehen ${konzepte.length} neue oder überarbeitete Bilder. Jedes Bild hat genau eine Aufgabe: einen belegten Kaufgrund sichtbar zu machen, den das Listing heute behauptet, aber nicht beweist.`
        : `Für ${e.produkt} ist aus der Analyse aktuell kein neues Bild nötig — jeder belegte Kaufgrund ist im Bildset bewiesen.`,
    produktWahrheit,
    verboten,
    konzepte,
    bestand: e.bestand,
    kundensprache: {
      uebernehmen: e.languageToBorrow.slice(0, BRIEF_GRENZEN.kundensprache),
      vermeiden: e.languageToAvoid.slice(0, BRIEF_GRENZEN.kundensprache),
    },
    grenzen: [...new Set(grenzen)],
  };
}
