import { describe, it, expect } from "vitest";
import {
  DRIVER_NOTBREMSE,
  DRIVER_SCHWELLE,
  driverScore,
  pruefeResultatFeatureFrei,
  relevanzAusScore,
  waehleDriver,
  type DriverEvidenz,
} from "./motive";

const leer: DriverEvidenz = {
  motivKlasse: "entscheidung",
  suchvolumenAnteil: null,
  wettbewerberMit: 0,
  wettbewerberGesamt: 0,
  eigeneNennungen: 0,
  stichprobe: 0,
  fremdeNennungenUebertragbar: 0,
  negativeErwartungsbrueche: 0,
  harteFakten: 0,
};

describe("Driver-Score (D265)", () => {
  it("Hygienefaktoren bekommen keine Motiv-Punkte und erreichen die Schwelle nie allein", () => {
    // „Einfacher Aufbau“, „Lieferumfang vollständig“ — post-purchase, kein Kaufgrund.
    const { score } = driverScore({ ...leer, motivKlasse: "hygiene", eigeneNennungen: 40, stichprobe: 182 });
    expect(score).toBeLessThan(DRIVER_SCHWELLE);
  });

  it("ein Kernmotiv ALLEIN reicht nicht — es braucht bestätigende Evidenz", () => {
    expect(driverScore({ ...leer, motivKlasse: "kern" }).score).toBe(40);
    expect(driverScore({ ...leer, motivKlasse: "kern" }).score).toBeLessThan(DRIVER_SCHWELLE);
  });

  it("Kernmotiv mit Suchnachfrage und Wettbewerber-Konsens trägt trotz weniger Review-Nennungen", () => {
    // Der Fall „Rückenbeschwerden“: 2 Fundstellen in 182 Reviews, aber Kaufgrund
    // der ganzen Kategorie. Post-purchase-Häufigkeit darf ihn nicht schlagen.
    const { score, anteile } = driverScore({
      ...leer,
      motivKlasse: "kern",
      suchvolumenAnteil: 0.4,
      wettbewerberMit: 3,
      wettbewerberGesamt: 3,
      eigeneNennungen: 2,
      stichprobe: 182,
      negativeErwartungsbrueche: 1,
      harteFakten: 1,
    });
    expect(score).toBeGreaterThanOrEqual(65);
    expect(relevanzAusScore(score)).toBeGreaterThanOrEqual(4);
    expect(anteile.map((a) => a.quelle)).toContain("Suchnachfrage");
  });

  it("schlägt ein häufig genanntes Hygiene-Thema", () => {
    const kern = driverScore({ ...leer, motivKlasse: "kern", suchvolumenAnteil: 0.4, wettbewerberMit: 3, wettbewerberGesamt: 3, eigeneNennungen: 2, stichprobe: 182 });
    const hygiene = driverScore({ ...leer, motivKlasse: "hygiene", eigeneNennungen: 60, stichprobe: 182 });
    expect(kern.score).toBeGreaterThan(hygiene.score);
  });

  it("ohne Keyword-Export gibt es keinen Suchnachfrage-Anteil (nicht 0 Punkte behaupten)", () => {
    expect(driverScore({ ...leer, suchvolumenAnteil: null }).anteile.map((a) => a.quelle)).not.toContain("Suchnachfrage");
    expect(driverScore({ ...leer, suchvolumenAnteil: 0 }).anteile.map((a) => a.quelle)).toContain("Suchnachfrage");
  });

  it("Score ist auf 100 gedeckelt und Anteile summieren sich darauf", () => {
    const { score } = driverScore({
      motivKlasse: "kern",
      suchvolumenAnteil: 1,
      wettbewerberMit: 5,
      wettbewerberGesamt: 5,
      eigeneNennungen: 100,
      stichprobe: 100,
      fremdeNennungenUebertragbar: 100,
      negativeErwartungsbrueche: 9,
      harteFakten: 4,
    });
    expect(score).toBe(100);
    expect(relevanzAusScore(score)).toBe(5);
  });

  it("teilt nie durch 0", () => {
    expect(() => driverScore({ ...leer, stichprobe: 0, eigeneNennungen: 5, wettbewerberGesamt: 0, wettbewerberMit: 2 })).not.toThrow();
  });
});

describe("Feature-Freiheits-Test (D265)", () => {
  const features = ["stufenlose Höhenverstellung", "3 Speicherplätze", "2 Motoren"];

  it("ein Resultat ist feature-frei formuliert", () => {
    expect(pruefeResultatFeatureFrei("Ohne Rückenbeschwerden durch den Arbeitstag", features).ok).toBe(true);
    expect(pruefeResultatFeatureFrei("Dem Tisch Monitor und Equipment ohne Sorge anvertrauen", features).ok).toBe(true);
  });

  it("Zahlen und Maßeinheiten sind Beweise, keine Resultate", () => {
    const r = pruefeResultatFeatureFrei("Stufenlos von 61 bis 126 cm", features);
    expect(r.ok).toBe(false);
    expect(r.verstoesse.join(" ")).toMatch(/Zahl|Maßeinheit/);
  });

  it("ein Feature-Begriff im Titel macht daraus einen Baustein, keinen Driver", () => {
    const r = pruefeResultatFeatureFrei("Leises Verstellen dank Motoren", features);
    expect(r.ok).toBe(false);
    expect(r.verstoesse.join(" ")).toContain("Feature-Begriff");
  });

  it("Funktionswörter lösen keinen Fehlalarm aus", () => {
    // „ohne" steckt als Teilstring in vielen Komposita — ein Fehlalarm würde
    // einen korrekten Driver-Titel blocken.
    expect(pruefeResultatFeatureFrei("Ohne Sorge um die Technik arbeiten", ["Kollisionsschutz ohne Zubehör"]).ok).toBe(true);
    expect(pruefeResultatFeatureFrei("Mehr Ruhe im gemeinsamen Raum", ["mehr Stahl"]).ok).toBe(true);
  });

  it("meldet jeden Verstoß nur einmal", () => {
    const r = pruefeResultatFeatureFrei("2 Motoren und 2 Motoren", ["Motoren"]);
    expect(r.verstoesse.filter((v) => v.includes("Feature-Begriff"))).toHaveLength(1);
  });
});

describe("Driver-Auswahl: Schwelle, Minimum, Notbremse (D265)", () => {
  it("nimmt nur Kandidaten über der Schwelle und zählt die Verworfenen", () => {
    const r = waehleDriver([{ score: 80 }, { score: 50 }, { score: 44 }, { score: 10 }]);
    expect(r.gewaehlt.map((k) => k.score)).toEqual([80, 50]);
    expect(r.verworfen).toBe(2);
    expect(r.mindestDriver).toBe(false);
  });

  it("mindestens EIN Driver ist Pflicht — markiert und mit Hinweis", () => {
    const r = waehleDriver([{ score: 30 }, { score: 12 }]);
    expect(r.gewaehlt).toEqual([{ score: 30 }]);
    expect(r.mindestDriver).toBe(true);
    expect(r.hinweise.join(" ")).toContain("Pflicht-Driver");
  });

  it("das Minimum gilt nur für den ersten — keine Quote durch die Hintertür", () => {
    const r = waehleDriver([{ score: 44 }, { score: 43 }, { score: 42 }]);
    expect(r.gewaehlt).toHaveLength(1);
  });

  it("Notbremse deckelt und meldet sich als Bau-Auftrag", () => {
    const r = waehleDriver(Array.from({ length: 12 }, (_, i) => ({ score: 90 - i })));
    expect(r.gewaehlt).toHaveLength(DRIVER_NOTBREMSE);
    expect(r.hinweise.join(" ")).toContain("Notbremse");
  });

  it("keine Kandidaten = Datenfehler, kein leeres Ergebnis", () => {
    const r = waehleDriver([]);
    expect(r.gewaehlt).toEqual([]);
    expect(r.hinweise.join(" ")).toContain("Datenfehler");
  });
});
