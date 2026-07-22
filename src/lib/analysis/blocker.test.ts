import { describe, expect, it } from "vitest";
import { normalisiereBlockerKarten, findeBlocker } from "./blocker";
import type { FeatureQuellen } from "./featureRanking";

/** D167: Conversion-Blocker — der Match aus Kunden-Thema × fehlender Listing-Antwort. */
const quellen: FeatureQuellen = {
  title: "Magen-Tropfen für Hunde gegen Sodbrennen und Grasfressen",
  bullets: ["GEZIELTE WIRKUNG: hilft bei Sodbrennen und stoppt Grasfressen"],
  description: null,
  attributes: null,
  importantInfo: null,
  aplusContent: null,
  bilder: "Bild 1: Produktdose auf Weiß",
};

const aspekte = {
  painPoints: [{ label: "Hund frisst die Drops nicht", frequencyPct: null, mentionCount: 19, quotes: [] }],
  buyingTriggers: [
    { label: "Produkt hilft gegen Sodbrennen", frequencyPct: null, mentionCount: 27, quotes: [] },
    { label: "Einfache Dosierung", frequencyPct: null, mentionCount: 8, quotes: [] },
  ],
};

describe("normalisiereBlockerKarten — der Match ist die Existenzberechtigung (D137)", () => {
  it("löst Aspekt-Referenzen gegen echte Roh-Themen auf; Relevanz + Quellen-Tags stempelt der Code", () => {
    const { cards, verworfen } = normalisiereBlockerKarten(
      {
        blocker: [
          {
            titel: "Akzeptanz-Frage unbeantwortet",
            problem: "Kunden berichten, dass Hunde die Tropfen verweigern. Das Listing sagt nichts zur Akzeptanz.",
            passendeAspekte: ["Hund frisst die Drops nicht", "Einfache Dosierung"],
          },
        ],
      },
      aspekte,
      ["Reviews", "Listing", "Bilder"],
    );
    expect(verworfen).toBe(0);
    expect(cards).toHaveLength(1);
    expect(cards[0].relevanz).toBe(4); // 2 echte Beleg-Aspekte (D154-Formel)
    expect(cards[0].quellen).toEqual(["Reviews", "Listing", "Bilder"]);
    expect(cards[0].bildIdeen).toEqual([]); // visuelle Umsetzung gehört in die Briefings (D168)
    expect(cards[0].belegAspekte.map((b) => b.typ).sort()).toEqual(["buyingTrigger", "painPoint"]);
  });

  it("Blocker ohne aufgelösten Kunden-Aspekt fliegt GEZÄHLT raus", () => {
    const { cards, verworfen } = normalisiereBlockerKarten(
      {
        blocker: [
          { titel: "Erfunden", problem: "Kein Kunde hat das je erwähnt.", passendeAspekte: ["Thema das es nicht gibt"] },
          { titel: "", problem: "ohne Titel", passendeAspekte: ["Einfache Dosierung"] },
        ],
      },
      aspekte,
      ["Reviews", "Listing"],
    );
    expect(cards).toEqual([]);
    expect(verworfen).toBe(2);
  });

  it("kaputte Antwort → leer, nichts geraten", () => {
    expect(normalisiereBlockerKarten({ blocker: "quatsch" }, aspekte, [])).toEqual({ cards: [], verworfen: 0 });
  });
});

describe("findeBlocker (Mock-Provider ohne Key)", () => {
  it("liefert eine Karte mit echtem Beleg-Aspekt + Hinweis zu nicht erfassten Quellen", async () => {
    const res = await findeBlocker({ quellen, aspekte, reviewsGesamt: 61 });
    expect(res.cards.length).toBeGreaterThan(0);
    expect(res.cards[0].belegAspekte[0].label).toBe("Produkt hilft gegen Sodbrennen");
    expect(res.cards[0].quellen).toContain("Bilder");
    expect(res.hinweise.some((h) => h.includes("Nicht erfasste Quellen"))).toBe(true);
    expect(res.stats.reviewsGesamt).toBe(61);
  });

  it("ohne Listing-Text: ehrlicher Fehler", async () => {
    await expect(
      findeBlocker({
        quellen: { title: null, bullets: [], description: null, attributes: null, importantInfo: null, aplusContent: null },
        aspekte,
        reviewsGesamt: 0,
      }),
    ).rejects.toThrow(/Listing-Inhalt/);
  });

  it("ohne Kunden-Themen: ehrlicher Fehler statt erfundener Blocker", async () => {
    await expect(
      findeBlocker({ quellen, aspekte: { painPoints: [], buyingTriggers: [] }, reviewsGesamt: 0 }),
    ).rejects.toThrow(/Kunden-Themen/);
  });
});
