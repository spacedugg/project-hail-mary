import { normalizeToken } from "@/lib/text/bytes";
import { adressiert } from "@/lib/analysis/listingAudit";
import { findeAspekt, type RoheAspekte } from "@/lib/reviews/verdichtung";
import { quellTexte, type FeatureQuellen } from "@/lib/analysis/featureRanking";
import { bildAbdeckung, textAbdeckung, type AbdeckungsStufe, type BildBeleg, type KanalTreffer } from "@/lib/analysis/abdeckung";
import { verschmelzeAbdeckung, type SemantischerTreffer } from "@/lib/analysis/semantischeAbdeckung";
import { bestimmeBlockerFall, blockerBegruendung, blockerScore, blockerTitel } from "@/lib/analysis/blockerFall";
import { MOTIV_LABELS } from "@/lib/analysis/motive";
import {
  driverScore,
  pruefeResultatFeatureFrei,
  relevanzAusScore,
  waehleDriver,
  type DriverEvidenz,
  type MotivKlasse,
} from "@/lib/analysis/motive";
import type {
  BallastFeature,
  ConversionBlockerNeu,
  ConversionDriver,
  ConversionDriverPayload,
  DriverBeleg,
  NutzenBaustein,
} from "@/lib/analysis/driverTypen";

/**
 * Zusammenführung und Bewertung der Driver (D265) — die deterministische
 * Hälfte der Kette. Das LLM erntet Kandidaten je Quelle und ordnet die
 * Motiv-Klasse zu; ALLES Weitere entscheidet hier der Code: verschmelzen,
 * Belege auflösen, Abdeckung rechnen, gewichten, auswählen, Blocker-Titel
 * bauen, Ballast bestimmen (D184).
 *
 * Erwartung an den Aufrufer: `aspekte` ist bereits durch das
 * Zuständigkeits-Gate gelaufen (`teileNachZustaendigkeit`) — sonst zählen
 * Versand-Themen in die Gewichtung.
 */

/** Kandidat, wie ihn die Ernte liefert — noch ohne Zahl, ohne Abdeckung, ohne ID. */
export type DriverKandidat = {
  /** Feature-freies Resultat. */
  resultat: string;
  motivKlasse: MotivKlasse;
  motivBegruendung: string;
  bausteine: Array<{ nutzen: string; features?: string[]; belege: DriverBeleg[]; usp?: boolean }>;
};

export type AufbauKontext = {
  quellen: FeatureQuellen;
  bilder: BildBeleg[];
  /** Keyword-Basis mit Suchvolumen — Bezugsgröße des Suchnachfrage-Anteils. */
  keywords: Array<{ keyword: string; searchVolume: number | null }>;
  /** Wie viele Wettbewerber-Listings vorliegen (Nenner des Konsens-Anteils). */
  wettbewerberGesamt: number;
  /** Analysierte Bewertungen der eigenen ASIN. */
  stichprobe: number;
  /** Bereinigte Roh-Aspekte — Basis für Nennungen und Erwartungsbrüche. */
  aspekte: RoheAspekte;
  /** Features des Listings (Feature-Ranking) — Basis der Ballast-Bestimmung. */
  featureBegriffe: string[];
  /**
   * Einordnung der Listing-Merkmale (D282, optional): stützt einen Kaufgrund ·
   * notwendige Angabe · ohne erkennbaren Zweck. Fehlt sie, wird keine Klasse
   * behauptet.
   */
  merkmalUrteile?: import("@/lib/analysis/merkmalKlasse").MerkmalUrteil[];
  /**
   * Verifizierte semantische Treffer (D281, optional). Sie loesen falsche
   * Luecken auf, die der reine Wortstamm-Abgleich erzeugt — „praezise
   * Sonnenausrichtung" im Listing deckt „optimale Ausrichtung zur Sonne" ab.
   * Fehlt die Pruefung (kein Key, Zeitlimit), bleibt es exakt beim Wortabgleich.
   */
  semantisch?: SemantischerTreffer[];
};

const norm = (s: string) => normalizeToken(s.replace(/\s+/g, " ").trim());

/** Stamm-Schlüssel eines Textes — Grundlage jeder Verschmelzung. */
export function nutzenSchluessel(text: string): string {
  return text
    .split(/[\s\-–—/,.;:()"„“]+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 4)
    .sort()
    .join("|");
}

/**
 * Kandidaten derselben Aussage verschmelzen. Zwei Kandidaten sind dasselbe
 * Resultat, wenn ihr Stamm-Schlüssel übereinstimmt — dann werden Bausteine und
 * Belege vereinigt statt zweimal ausgegeben. Die stärkere Motiv-Klasse gewinnt
 * (kern > entscheidung > absicherung > hygiene).
 */
const KLASSEN_RANG: Record<MotivKlasse, number> = { kern: 3, entscheidung: 2, absicherung: 1, hygiene: 0 };

export function fuegeKandidatenZusammen(kandidaten: DriverKandidat[]): DriverKandidat[] {
  const zusammen = new Map<string, DriverKandidat>();
  for (const k of kandidaten) {
    const schluessel = nutzenSchluessel(k.resultat);
    if (!schluessel) continue;
    const vorhanden = zusammen.get(schluessel);
    if (!vorhanden) {
      zusammen.set(schluessel, { ...k, bausteine: k.bausteine.map((b) => ({ ...b, belege: [...b.belege] })) });
      continue;
    }
    if (KLASSEN_RANG[k.motivKlasse] > KLASSEN_RANG[vorhanden.motivKlasse]) {
      vorhanden.motivKlasse = k.motivKlasse;
      vorhanden.motivBegruendung = k.motivBegruendung;
    }
    for (const b of k.bausteine) {
      const treffer = vorhanden.bausteine.find((x) => nutzenSchluessel(x.nutzen) === nutzenSchluessel(b.nutzen));
      if (!treffer) {
        vorhanden.bausteine.push({ ...b, belege: [...b.belege] });
        continue;
      }
      treffer.usp = treffer.usp || b.usp;
      treffer.features = [...new Set([...(treffer.features ?? []), ...(b.features ?? [])])];
      for (const beleg of b.belege)
        if (!treffer.belege.some((x) => x.quelle === beleg.quelle && norm(x.fundstelle) === norm(beleg.fundstelle)))
          treffer.belege.push(beleg);
    }
  }
  return [...zusammen.values()];
}

/**
 * Suchnachfrage-Anteil: Das LLM ordnet Keywords einem Resultat zu (eine
 * Klassifizierung), der CODE rechnet die Zahl (D184). Zugeordnete Keywords, die
 * es in der echten Keyword-Basis nicht gibt, fliegen — Verbatim-Prinzip (D133).
 * null = keine Keyword-Basis, dann behauptet der Score dazu nichts.
 */
export function suchvolumenAnteil(
  belege: DriverBeleg[],
  keywords: AufbauKontext["keywords"],
): { anteil: number | null; gesamt: number; unbelegt: string[] } {
  const mitVolumen = keywords.filter((k) => (k.searchVolume ?? 0) > 0);
  const gesamt = mitVolumen.reduce((s, k) => s + (k.searchVolume ?? 0), 0);
  if (gesamt === 0) return { anteil: null, gesamt: 0, unbelegt: [] };

  const nachSchluessel = new Map(mitVolumen.map((k) => [norm(k.keyword), k.searchVolume ?? 0]));
  const unbelegt: string[] = [];
  const getroffen = new Map<string, number>();
  for (const b of belege.filter((x) => x.quelle === "suchnachfrage")) {
    const wort = (b.ref ?? b.fundstelle).trim();
    const sv = nachSchluessel.get(norm(wort));
    if (sv === undefined) {
      unbelegt.push(wort);
      continue;
    }
    getroffen.set(norm(wort), sv);
  }
  const summe = [...getroffen.values()].reduce((s, v) => s + v, 0);
  return { anteil: summe / gesamt, gesamt, unbelegt };
}

/**
 * Review-Evidenz eines Kandidaten. Löst die Beleg-Fundstellen gegen die echten
 * Roh-Aspekte auf und nutzt dabei `herkunft` (eigene vs. fremde ASIN,
 * deterministisch gezählt) und `uebertragbarkeit` — zwei Felder, die bisher nur
 * in die Content-Prompts liefen und in keiner Analyse ankamen.
 */
export function reviewEvidenz(
  belege: DriverBeleg[],
  aspekte: RoheAspekte,
): { eigeneNennungen: number; fremdeNennungenUebertragbar: number; negativeErwartungsbrueche: number; unbelegt: string[] } {
  let eigeneNennungen = 0;
  let fremdeNennungenUebertragbar = 0;
  const negative = new Set<string>();
  const unbelegt: string[] = [];
  const gesehen = new Set<string>();

  for (const b of belege.filter((x) => x.quelle === "reviews_eigene" || x.quelle === "reviews_fremde")) {
    const aspekt = findeAspekt(b.fundstelle, aspekte);
    if (!aspekt) {
      unbelegt.push(b.fundstelle);
      continue;
    }
    const schluessel = `${aspekt.typ}:${norm(aspekt.label)}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);

    const roh =
      aspekte.buyingTriggers.find((a) => norm(a.label) === norm(aspekt.label)) ??
      aspekte.painPoints.find((a) => norm(a.label) === norm(aspekt.label));
    if (aspekt.typ === "painPoint") negative.add(schluessel);

    const herkunft = roh?.herkunft;
    if (!herkunft) {
      // Ohne Attribution ehrlich als eigene Fundstellen zählen (Altbestand).
      eigeneNennungen += aspekt.mentionCount ?? 0;
      continue;
    }
    eigeneNennungen += herkunft.eigene;
    // Nicht übertragbare Wettbewerbs-Themen widersprechen unserer Produkt-Wahrheit (D196).
    if (roh?.uebertragbarkeit?.urteil !== "nein") fremdeNennungenUebertragbar += herkunft.fremde;
  }

  return { eigeneNennungen, fremdeNennungenUebertragbar, negativeErwartungsbrueche: negative.size, unbelegt };
}

/** Alle Belege eines Kandidaten über seine Bausteine hinweg. */
const alleBelege = (k: DriverKandidat): DriverBeleg[] => k.bausteine.flatMap((b) => b.belege);

/** Steht mindestens ein Feature des Bausteins im Listing-Text? Trennt „gar nichts“ von „nur das Merkmal“. */
/**
 * Wort-Abdeckung + semantische Treffer zu EINER Bewertung (D281).
 * Die Gesamtstufe wird nach dem Verschmelzen neu bestimmt, sonst bliebe ein
 * hochgestufter Kanal ohne Wirkung auf das Ergebnis.
 */
function veredelteAbdeckung(
  roh: { kanaele: KanalTreffer[]; stufe: AbdeckungsStufe },
  semantisch: SemantischerTreffer[],
  nutzen: string[] | string,
): { kanaele: KanalTreffer[]; stufe: AbdeckungsStufe } {
  const key = (String(Array.isArray(nutzen) ? nutzen[0] : nutzen)).toLowerCase().trim();
  const treffer = semantisch.filter((t) => t.nutzen.toLowerCase().trim() === key);
  if (treffer.length === 0) return roh;
  const kanaele = verschmelzeAbdeckung(roh.kanaele, treffer);
  const hat = (st: AbdeckungsStufe) => kanaele.some((k) => k.stufe === st);
  const stufe: AbdeckungsStufe = hat("prominent")
    ? "prominent"
    : hat("erwaehnt")
      ? "erwaehnt"
      : hat("fehlt")
        ? "fehlt"
        : "nicht_erfasst";
  return { kanaele, stufe };
}

function featureGenannt(features: string[], quellText: string): boolean {
  return features.some((f) => f.trim() && adressiert(quellText, f).ok);
}

/**
 * Vollständiger Aufbau: Kandidaten → bewertete Driver + Blocker + Ballast.
 * Reine Rechnung, kein LLM-Aufruf — deshalb im Test vollständig fahrbar.
 */
export function baueDriver(kandidaten: DriverKandidat[], kontext: AufbauKontext): ConversionDriverPayload {
  const hinweise: string[] = [];
  const quellText = Object.values(quellTexte(kontext.quellen)).join("\n");
  const zusammengefuehrt = fuegeKandidatenZusammen(kandidaten);

  let verworfenVorGate = 0;
  const bewertet: Array<{ kandidat: DriverKandidat; driver: Omit<ConversionDriver, "id"> }> = [];

  for (const k of zusammengefuehrt) {
    if (k.motivKlasse === "hygiene") {
      verworfenVorGate++;
      hinweise.push(
        `„${k.resultat}" ist ein Hygienefaktor (wird erst nach dem Kauf relevant) und damit kein Conversion Driver — wirkt auf Bewertungen und Retouren, nicht auf die Kaufentscheidung.`,
      );
      continue;
    }

    const alleFeatures = [...new Set(k.bausteine.flatMap((b) => b.features ?? []))];
    const feateFrei = pruefeResultatFeatureFrei(k.resultat, alleFeatures);
    if (!feateFrei.ok) {
      verworfenVorGate++;
      hinweise.push(`„${k.resultat}" ist kein Resultat, sondern ein Baustein: ${feateFrei.verstoesse.join("; ")}.`);
      continue;
    }

    const belege = alleBelege(k);
    if (belege.length === 0) {
      verworfenVorGate++;
      hinweise.push(`„${k.resultat}" hat keine Fundstelle — ohne Beleg kein Driver.`);
      continue;
    }

    // Abdeckung je Baustein (Code)
    const bausteine: NutzenBaustein[] = k.bausteine.map((b) => {
      const roh = textAbdeckung(kontext.quellen, b.nutzen);
      // D281: semantische Treffer DIESES Bausteins additiv einweben — nie abstufen.
      const text = veredelteAbdeckung(roh, kontext.semantisch ?? [], b.nutzen);
      const bild = bildAbdeckung(kontext.bilder, b.nutzen);
      return {
        nutzen: b.nutzen,
        features: b.features ?? [],
        belege: b.belege,
        usp: b.usp === true,
        textStufe: text.stufe,
        kanaele: text.kanaele,
        bildStufe: bild.stufe,
        bildSlot: bild.slot,
        bildNote: bild.note,
      };
    });

    const sv = suchvolumenAnteil(belege, kontext.keywords);
    if (sv.unbelegt.length) {
      hinweise.push(
        `Zu „${k.resultat}" wurden ${sv.unbelegt.length} Suchbegriff(e) zugeordnet, die es in der Keyword-Basis nicht gibt — nicht gewertet: ${sv.unbelegt.map((w) => `„${w}"`).join(", ")}.`,
      );
    }
    const rev = reviewEvidenz(belege, kontext.aspekte);
    if (rev.unbelegt.length) {
      hinweise.push(
        `Zu „${k.resultat}" verweisen ${rev.unbelegt.length} Beleg(e) auf ein Kunden-Thema, das die Analyse nicht kennt — nicht gewertet.`,
      );
    }

    const wettbewerberMit = new Set(
      belege.filter((b) => b.quelle === "wettbewerber_listing").map((b) => (b.ref ?? "").trim().toUpperCase()).filter(Boolean),
    ).size;

    const evidenz: DriverEvidenz = {
      motivKlasse: k.motivKlasse,
      suchvolumenAnteil: sv.anteil,
      wettbewerberMit: Math.min(wettbewerberMit, kontext.wettbewerberGesamt),
      wettbewerberGesamt: kontext.wettbewerberGesamt,
      eigeneNennungen: rev.eigeneNennungen,
      stichprobe: kontext.stichprobe,
      fremdeNennungenUebertragbar: rev.fremdeNennungenUebertragbar,
      negativeErwartungsbrueche: rev.negativeErwartungsbrueche,
      harteFakten: belege.filter((b) => b.quelle === "fakten").length,
    };
    const { score, anteile } = driverScore(evidenz);

    bewertet.push({
      kandidat: k,
      driver: {
        resultat: k.resultat,
        motivKlasse: k.motivKlasse,
        motivBegruendung: k.motivBegruendung,
        bausteine,
        score,
        relevanz: relevanzAusScore(score),
        anteile,
        nurKategorie: belege.every((b) => b.quelle === "kategorie"),
      },
    });
  }

  const auswahl = waehleDriver(bewertet.map((b) => ({ ...b, score: b.driver.score })));
  hinweise.push(...auswahl.hinweise);

  const driver: ConversionDriver[] = auswahl.gewaehlt.map((g, i) => ({ id: `CD${i + 1}`, ...g.driver }));
  if (auswahl.mindestDriver && driver[0]) {
    // `nurKategorie` bleibt, was die Belege sagen — ein Pflicht-Driver kann
    // durchaus echte Fundstellen haben und trotzdem unter der Schwelle liegen.
    hinweise.push(
      `„${driver[0].resultat}" steht als Pflicht-Driver mit dünner Evidenz (${driver[0].score} Punkte) — Datenbasis nachschärfen: Wettbewerber-ASINs, Keyword-Export, Bewertungen.`,
    );
  }

  // Blocker: Driver-Baustein ohne (ausreichenden) Beweis — nie ein eigener Befund.
  const blocker: ConversionBlockerNeu[] = [];
  for (const d of driver) {
    for (const b of d.bausteine) {
      const fall = bestimmeBlockerFall({
        textStufe: b.textStufe,
        bildStufe: b.bildStufe,
        featureGenannt: featureGenannt(b.features, quellText),
      });
      if (!fall) continue;
      blocker.push({
        driverId: d.id,
        nutzen: b.nutzen,
        fall,
        titel: blockerTitel({
          fall,
          resultat: d.resultat,
          baustein: b.nutzen,
          features: b.features,
          kanaele: b.kanaele,
          slot: b.bildSlot,
          note: b.bildNote,
        }),
        // D278: derselbe Datensatz, zweite Ausgabestufe — Titel fuer die Liste,
        // Begruendung fuer das Aufklappen.
        begruendung: blockerBegruendung({
          fall,
          resultat: d.resultat,
          baustein: b.nutzen,
          features: b.features,
          kanaele: b.kanaele,
          slot: b.bildSlot,
          note: b.bildNote,
          relevanz: d.relevanz,
          motiv: MOTIV_LABELS[d.motivKlasse],
        }),
        score: blockerScore(d.score, fall),
        bildSlot: b.bildSlot,
        bildNote: b.bildNote,
      });
    }
  }
  blocker.sort((a, b) => b.score - a.score);

  // Nicht bewertbare Kanäle ehrlich benennen statt als Lücke zu behaupten (D145).
  const nichtErfasst = [...new Set(driver.flatMap((d) => d.bausteine).flatMap((b) => b.kanaele.filter((k) => k.stufe === "nicht_erfasst").map((k) => k.kanal)))];
  if (nichtErfasst.length) {
    hinweise.push(`Nicht erfasste Kanäle (dort kann ein Beweis stehen, den der Lauf nicht sieht): ${nichtErfasst.join(", ")}.`);
  }
  if (kontext.bilder.length === 0) {
    hinweise.push("Keine Bildanalyse vorhanden — Bildbeweise sind nicht bewertbar, es wird keine Bildlücke behauptet.");
  }

  // Ballast: Merkmal im Listing, das keinem Resultat zuarbeitet.
  /**
   * Merkmal-Einordnung (D282) — ERSETZT die frühere Ballast-Differenzmenge.
   *
   * Vorher: alle Feature-Titel minus die Features, die in einem Driver-Baustein
   * vorkommen, verglichen über exakte Token-Schlüssel. Der Vergleich traf
   * praktisch nie, deshalb landeten fast alle Merkmale im „Ballast" — im
   * Referenz-Fall sieben von neun, darunter „Erwärmt Aufstellpool mit
   * Sonnenkraft" bei einem Kaufgrund „Poolwasser wird angenehm warm zum Baden".
   *
   * Jetzt trägt JEDES Merkmal seine Klasse aus der inhaltlichen Einordnung
   * (`kontext.merkmalUrteile`). Liegt keine Einordnung vor, bleibt die Klasse
   * offen — die Anzeige behauptet dann nichts (D145: keine Lücke behaupten, wo
   * nicht hingesehen wurde).
   */
  const urteilZu = new Map((kontext.merkmalUrteile ?? []).map((u) => [u.merkmal.toLowerCase().trim(), u]));
  const ballast: BallastFeature[] = kontext.featureBegriffe
    .filter((f) => f.trim())
    .map((f) => {
      const u = urteilZu.get(f.toLowerCase().trim());
      return {
        feature: f,
        fundstelle: textAbdeckung(kontext.quellen, f).stufe,
        ...(u ? { klasse: u.klasse, begruendung: u.begruendung } : {}),
      };
    })
    // Nur was im Listing wirklich steht, belegt auch Fläche.
    .filter((b) => b.fundstelle === "prominent" || b.fundstelle === "erwaehnt");

  return {
    driver,
    blocker,
    ballast,
    // Füllt der Aufrufer aus dem Zuständigkeits-Gate — hier ist keine
    // Produkt-Feedback-Quelle bekannt, und ein leeres Feld ist ehrlicher
    // als ein erfundenes.
    produktFeedback: [],
    verworfen: verworfenVorGate + auswahl.verworfen,
    hinweise,
    stats: {
      stichprobe: kontext.stichprobe,
      wettbewerberGesamt: kontext.wettbewerberGesamt,
      suchvolumenGesamt: suchvolumenAnteil([], kontext.keywords).gesamt,
    },
  };
}
