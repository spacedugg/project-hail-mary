import { describe, it, expect } from "vitest";
import {
  baueDriver,
  fuegeKandidatenZusammen,
  nutzenSchluessel,
  reviewEvidenz,
  suchvolumenAnteil,
  type AufbauKontext,
  type DriverKandidat,
} from "./driverAufbau";
import type { FeatureQuellen } from "@/lib/analysis/featureRanking";
import type { RoheAspekte } from "@/lib/reviews/verdichtung";

/** Echtes Listing als Fixture (boho office Basic Line, Nutzer-Vorlage 30.07.). */
const QUELLEN: FeatureQuellen = {
  title: "boho office® Basic Line Schreibtisch Gestell elektrisch höhenverstellbar | Kollisionsschutz, 2 Motoren, stufenlos",
  bullets: [
    "BIS ZU 5x SCHNELLER: Elektrisch höhenverstellbarer Schreibtisch mit 2 Hochleistungsmotoren (≤55 dB). Mit 3 Speicherplätzen, Display-Sleep-Funktion und Kindersicherung.",
    "MAXIMALE STABILITÄT UND SICHERHEIT: Bis zu 40% mehr Stahl als herkömmliche Gestelle. 36 kg Gewicht und maximale Seitenstabilität am Bürotisch mit entspannter Beinfreiheit.",
  ],
  description: null,
  attributes: null,
  importantInfo: null,
  aplusContent: null,
  bilder: null,
};

const ASPEKTE: RoheAspekte = {
  painPoints: [
    {
      label: "wackelt bei maximaler Höhe",
      frequencyPct: null,
      mentionCount: 9,
      quotes: [],
      herkunft: { eigene: 6, fremde: 3, jeAsin: {} },
    },
  ],
  buyingTriggers: [
    {
      label: "Motor angenehm leise",
      frequencyPct: null,
      mentionCount: 14,
      quotes: [],
      herkunft: { eigene: 10, fremde: 4, jeAsin: {} },
    },
    {
      label: "hilft gegen Verspannungen",
      frequencyPct: null,
      mentionCount: 5,
      quotes: [],
      herkunft: { eigene: 1, fremde: 4, jeAsin: {} },
      uebertragbarkeit: { urteil: "nein", grund: "andere Bauhöhe" },
    },
  ],
};

const KONTEXT: AufbauKontext = {
  quellen: QUELLEN,
  bilder: [{ slot: 1, text: "Gestell freigestellt auf Weiß", botschaft: 4 }],
  keywords: [
    { keyword: "höhenverstellbarer schreibtisch", searchVolume: 60000 },
    { keyword: "schreibtisch ergonomisch", searchVolume: 20000 },
    { keyword: "tischgestell schwarz", searchVolume: 20000 },
  ],
  wettbewerberGesamt: 3,
  stichprobe: 182,
  aspekte: ASPEKTE,
  featureBegriffe: ["Display-Sleep-Funktion", "Kindersicherung", "2 Motoren"],
};

const beleg = (quelle: DriverKandidat["bausteine"][number]["belege"][number]["quelle"], fundstelle: string, ref?: string) => ({
  quelle,
  fundstelle,
  ref,
});

describe("Verschmelzung (D265)", () => {
  it("gleicher Stamm-Schlüssel = dasselbe Resultat, Bausteine und Belege werden vereinigt", () => {
    const a: DriverKandidat = {
      resultat: "Ohne Rückenbeschwerden durch den Arbeitstag",
      motivKlasse: "entscheidung",
      motivBegruendung: "aus dem Listing",
      bausteine: [{ nutzen: "Sitzen und Stehen im Wechsel", features: ["stufenlos"], belege: [beleg("listing", "höhenverstellbar")] }],
    };
    const b: DriverKandidat = {
      resultat: "ohne Rückenbeschwerden, durch den Arbeitstag",
      motivKlasse: "kern",
      motivBegruendung: "Kaufgrund der Kategorie",
      bausteine: [
        { nutzen: "Sitzen und Stehen im Wechsel", features: ["3 Speicherplätze"], belege: [beleg("wettbewerber_listing", "ergonomisch arbeiten", "B0TEST1")], usp: true },
        { nutzen: "Der Tisch passt zur Körpergröße", features: [], belege: [beleg("fakten", "61–126 cm")] },
      ],
    };
    const [zusammen] = fuegeKandidatenZusammen([a, b]);
    expect(zusammen.bausteine).toHaveLength(2);
    // stärkere Motiv-Klasse gewinnt
    expect(zusammen.motivKlasse).toBe("kern");
    const ersterBaustein = zusammen.bausteine[0];
    expect(ersterBaustein.belege).toHaveLength(2);
    expect(ersterBaustein.features).toEqual(["stufenlos", "3 Speicherplätze"]);
    expect(ersterBaustein.usp).toBe(true);
  });

  it("verändert die Eingabe nicht", () => {
    const k: DriverKandidat = {
      resultat: "Ruhig arbeiten",
      motivKlasse: "kern",
      motivBegruendung: "x",
      bausteine: [{ nutzen: "leise", belege: [beleg("listing", "55 dB")] }],
    };
    fuegeKandidatenZusammen([k, { ...k, bausteine: [{ nutzen: "leise", belege: [beleg("fakten", "55 dB")] }] }]);
    expect(k.bausteine[0].belege).toHaveLength(1);
  });

  it("Schlüssel ignoriert Reihenfolge, Satzzeichen und Groß-/Kleinschreibung", () => {
    expect(nutzenSchluessel("Ruhig und konzentriert arbeiten")).toBe(nutzenSchluessel("konzentriert, RUHIG arbeiten!"));
  });
});

describe("Suchnachfrage-Anteil (D265)", () => {
  it("summiert nur Keywords, die es in der echten Basis gibt", () => {
    const r = suchvolumenAnteil(
      [beleg("suchnachfrage", "höhenverstellbarer schreibtisch"), beleg("suchnachfrage", "erfundenes keyword")],
      KONTEXT.keywords,
    );
    expect(r.anteil).toBeCloseTo(0.6, 5);
    expect(r.gesamt).toBe(100000);
    expect(r.unbelegt).toEqual(["erfundenes keyword"]);
  });

  it("zählt dasselbe Keyword nicht doppelt", () => {
    const r = suchvolumenAnteil(
      [beleg("suchnachfrage", "tischgestell schwarz"), beleg("suchnachfrage", "Tischgestell Schwarz")],
      KONTEXT.keywords,
    );
    expect(r.anteil).toBeCloseTo(0.2, 5);
  });

  it("ohne Keyword-Basis behauptet der Score nichts", () => {
    expect(suchvolumenAnteil([beleg("suchnachfrage", "irgendwas")], []).anteil).toBeNull();
    expect(suchvolumenAnteil([], [{ keyword: "x", searchVolume: null }]).anteil).toBeNull();
  });
});

describe("Review-Evidenz nutzt Herkunft und Übertragbarkeit (D196/D265)", () => {
  it("splittet eigene und fremde Fundstellen deterministisch", () => {
    const r = reviewEvidenz([beleg("reviews_eigene", "Motor angenehm leise")], ASPEKTE);
    expect(r.eigeneNennungen).toBe(10);
    expect(r.fremdeNennungenUebertragbar).toBe(4);
  });

  it("nicht übertragbare Wettbewerbs-Themen zählen NICHT als Chance", () => {
    const r = reviewEvidenz([beleg("reviews_fremde", "hilft gegen Verspannungen")], ASPEKTE);
    expect(r.eigeneNennungen).toBe(1);
    expect(r.fremdeNennungenUebertragbar).toBe(0); // urteil "nein"
  });

  it("Pain Points zählen als Erwartungsbruch, nicht als Nennung", () => {
    const r = reviewEvidenz([beleg("reviews_eigene", "wackelt bei maximaler Höhe")], ASPEKTE);
    expect(r.negativeErwartungsbrueche).toBe(1);
  });

  it("erfundene Kunden-Themen werden ausgewiesen, nicht gewertet", () => {
    const r = reviewEvidenz([beleg("reviews_eigene", "Kunden loben die Farbe")], ASPEKTE);
    expect(r.eigeneNennungen).toBe(0);
    expect(r.unbelegt).toHaveLength(1);
  });

  it("zählt denselben Aspekt nur einmal", () => {
    const r = reviewEvidenz(
      [beleg("reviews_eigene", "Motor angenehm leise"), beleg("reviews_fremde", "Motor angenehm leise")],
      ASPEKTE,
    );
    expect(r.eigeneNennungen).toBe(10);
  });
});

describe("Vollständiger Aufbau (D265)", () => {
  const kern: DriverKandidat = {
    resultat: "Ohne Rückenbeschwerden durch den Arbeitstag",
    motivKlasse: "kern",
    motivBegruendung: "Kaufgrund der Kategorie",
    bausteine: [
      {
        nutzen: "Sitzen und Stehen im Wechsel",
        features: ["stufenlose Höhe", "3 Speicherplätze"],
        belege: [
          beleg("suchnachfrage", "höhenverstellbarer schreibtisch"),
          beleg("wettbewerber_listing", "ergonomisch arbeiten", "B0COMP1"),
          beleg("wettbewerber_listing", "gesünder arbeiten", "B0COMP2"),
          beleg("fakten", "61–126 cm"),
        ],
      },
    ],
  };

  it("baut Driver mit ID, Score, Relevanz und Abdeckung", () => {
    const p = baueDriver([kern], KONTEXT);
    expect(p.driver).toHaveLength(1);
    expect(p.driver[0].id).toBe("CD1");
    expect(p.driver[0].score).toBeGreaterThanOrEqual(45);
    expect(p.driver[0].relevanz).toBeGreaterThanOrEqual(2);
    expect(p.driver[0].bausteine[0].bildStufe).toBe("fehlt");
    expect(p.stats.suchvolumenGesamt).toBe(100000);
  });

  it("jeder Blocker verweist auf einen Driver — Doppelung ist unmöglich", () => {
    const p = baueDriver([kern], KONTEXT);
    const ids = new Set(p.driver.map((d) => d.id));
    expect(p.blocker.length).toBeGreaterThan(0);
    for (const b of p.blocker) expect(ids.has(b.driverId)).toBe(true);
    expect(p.blocker.length).toBeLessThanOrEqual(p.driver.flatMap((d) => d.bausteine).length);
  });

  it("Hygienefaktoren werden benannt verworfen, nie stiller Driver", () => {
    const hygiene: DriverKandidat = {
      resultat: "Schnell und einfach aufgebaut",
      motivKlasse: "hygiene",
      motivBegruendung: "wird erst nach dem Kauf relevant",
      bausteine: [{ nutzen: "Aufbau in 20 Minuten", belege: [beleg("reviews_eigene", "Motor angenehm leise")] }],
    };
    const p = baueDriver([kern, hygiene], KONTEXT);
    expect(p.driver.map((d) => d.resultat)).not.toContain(hygiene.resultat);
    expect(p.verworfen).toBeGreaterThanOrEqual(1);
    expect(p.hinweise.join(" ")).toContain("Hygienefaktor");
  });

  it("ein Resultat mit Merkmal drin wird als Baustein abgewiesen", () => {
    const falsch: DriverKandidat = {
      resultat: "Stufenlos von 61 bis 126 cm verstellbar",
      motivKlasse: "kern",
      motivBegruendung: "x",
      bausteine: [{ nutzen: "Höhe passt", features: ["stufenlos"], belege: [beleg("fakten", "61–126 cm")] }],
    };
    const p = baueDriver([kern, falsch], KONTEXT);
    expect(p.driver.map((d) => d.resultat)).not.toContain(falsch.resultat);
    expect(p.hinweise.join(" ")).toContain("kein Resultat, sondern ein Baustein");
  });

  it("Kandidat ohne Fundstelle fliegt", () => {
    const p = baueDriver([{ resultat: "Einfach besser leben", motivKlasse: "kern", motivBegruendung: "x", bausteine: [{ nutzen: "irgendwas", belege: [] }] }], KONTEXT);
    expect(p.hinweise.join(" ")).toContain("keine Fundstelle");
  });

  it("Pflicht-Driver: auch unter der Schwelle bleibt einer stehen, sichtbar markiert", () => {
    const schwach: DriverKandidat = {
      resultat: "Ruhig arbeiten im gemeinsamen Raum",
      motivKlasse: "absicherung",
      motivBegruendung: "dünn",
      bausteine: [{ nutzen: "Verstellen stört niemanden", belege: [beleg("kategorie", "Kategorie-Kernmotiv")] }],
    };
    const p = baueDriver([schwach], { ...KONTEXT, keywords: [], wettbewerberGesamt: 0, stichprobe: 0, aspekte: { painPoints: [], buyingTriggers: [] } });
    expect(p.driver).toHaveLength(1);
    expect(p.driver[0].nurKategorie).toBe(true);
    expect(p.hinweise.join(" ")).toContain("Pflicht-Driver");
  });

  it("Ballast: Merkmale im Listing, die keinem Resultat zuarbeiten", () => {
    const p = baueDriver([kern], KONTEXT);
    const ballast = p.ballast.map((b) => b.feature);
    expect(ballast).toContain("Display-Sleep-Funktion");
    expect(ballast).toContain("Kindersicherung");
  });

  it("ein Merkmal, das einem Driver-Baustein zuarbeitet, ist kein Ballast", () => {
    const mitMotoren: DriverKandidat = {
      ...kern,
      bausteine: [{ ...kern.bausteine[0], features: [...kern.bausteine[0].features!, "2 Motoren"] }],
    };
    const p = baueDriver([mitMotoren], KONTEXT);
    expect(p.ballast.map((b) => b.feature)).not.toContain("2 Motoren");
  });

  it("ohne Bildanalyse wird keine Bildlücke behauptet", () => {
    const p = baueDriver([kern], { ...KONTEXT, bilder: [] });
    expect(p.hinweise.join(" ")).toContain("keine Bildlücke");
    expect(p.blocker.every((b) => b.fall !== "bildbeweis_fehlt")).toBe(true);
  });
});
