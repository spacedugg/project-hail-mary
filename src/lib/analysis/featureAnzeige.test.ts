import { describe, expect, it } from "vitest";
import { ordneFeatures } from "./featureAnzeige";
import type { InsightCard } from "@/db/schema";
import type { BallastFeature } from "@/lib/analysis/driverTypen";

const karte = (titel: string, relevanz: number, aspekte: InsightCard["belegAspekte"] = []): InsightCard => ({
  titel,
  beschreibung: `Beschreibung zu ${titel}`,
  relevanz,
  quellen: ["Bullets"],
  bildIdeen: [],
  belegAspekte: aspekte,
});

const urteil = (feature: string, klasse: BallastFeature["klasse"], begruendung = "weil"): BallastFeature => ({
  feature,
  fundstelle: "prominent",
  klasse,
  begruendung,
});

describe("ordneFeatures — Merkmals-Ordnung nach Klasse (D284)", () => {
  it("Pflichtangabe rutscht unter das Kaufargument, auch bei höherer Relevanz", () => {
    const { merkmale } = ordneFeatures(
      [karte("Anschluss Ø 38 mm mit Lieferumfang", 5), karte("Absorberfläche aus schwarzem HDPE", 3)],
      [
        urteil("Anschluss Ø 38 mm mit Lieferumfang", "notwendige_spezifikation"),
        urteil("Absorberfläche aus schwarzem HDPE", "stuetzt_kaufgrund"),
      ],
    );
    expect(merkmale.map((m) => m.karte.titel)).toEqual([
      "Absorberfläche aus schwarzem HDPE",
      "Anschluss Ø 38 mm mit Lieferumfang",
    ]);
    expect(merkmale[1].klasseLabel).toBe("notwendige Angabe");
  });

  it("Ergebnis-Einträge sind keine Merkmale — raus aus der Liste, aber ausgewiesen", () => {
    const { merkmale, ergebnisse } = ordneFeatures(
      [karte("Spürbar wärmeres Poolwasser durch Sonnenkraft", 4), karte("15 l Wasserinhalt", 1)],
      [urteil("Spürbar wärmeres Poolwasser durch Sonnenkraft", "ergebnis", "Zustand beim Kunden")],
    );
    expect(merkmale.map((m) => m.karte.titel)).toEqual(["15 l Wasserinhalt"]);
    expect(ergebnisse).toHaveLength(1);
    expect(ergebnisse[0].begruendung).toBe("Zustand beim Kunden");
  });

  it("ohne Einordnung bleibt die Ranking-Reihenfolge und es wird nichts behauptet", () => {
    const { merkmale, ergebnisse } = ordneFeatures([karte("A", 5), karte("B", 3)], null);
    expect(merkmale.map((m) => m.karte.titel)).toEqual(["A", "B"]);
    expect(merkmale.every((m) => m.klasse === null && m.klasseLabel === null)).toBe(true);
    expect(ergebnisse).toEqual([]);
  });

  it("unklassifiziertes Merkmal steht vor der Pflichtangabe, nicht dahinter", () => {
    const { merkmale } = ordneFeatures(
      [karte("Pflichtmaß", 5), karte("Unklassifiziert", 1)],
      [urteil("Pflichtmaß", "notwendige_spezifikation")],
    );
    expect(merkmale.map((m) => m.karte.titel)).toEqual(["Unklassifiziert", "Pflichtmaß"]);
  });

  it("bei gleicher Klasse und Relevanz gewinnt die stärkere Zustimmung", () => {
    const stark = karte("Stark belegt", 3, [{ label: "gut", typ: "buyingTrigger", mentionCount: 12 }]);
    const schwach = karte("Schwach belegt", 3, [{ label: "ok", typ: "buyingTrigger", mentionCount: 2 }]);
    const { merkmale } = ordneFeatures([schwach, stark], [
      urteil("Stark belegt", "stuetzt_kaufgrund"),
      urteil("Schwach belegt", "stuetzt_kaufgrund"),
    ]);
    expect(merkmale.map((m) => m.karte.titel)).toEqual(["Stark belegt", "Schwach belegt"]);
  });
});
