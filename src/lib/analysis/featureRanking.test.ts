import { describe, expect, it } from "vitest";
import { featureRelevanz, normalisiereFeatureKarten, rankeFeatures, type FeatureQuellen } from "./featureRanking";

/** D141/D146: Listing-Features nach Kunden-Relevanz — Code erzwingt Belege + Relevanz. */
const quellen: FeatureQuellen = {
  title: "Magen-Tropfen für Hunde gegen Sodbrennen und Grasfressen",
  bullets: ["GEZIELTE WIRKUNG: hilft bei Sodbrennen und stoppt Grasfressen", "NATÜRLICH: Ulmenrinde, Heilmoor und Fenchel"],
  description: null,
  attributes: { Artikelform: "Tropfen", Geschmacksrichtung: "Neutral" },
  importantInfo: "Zusammensetzung: Ulmenrinde, Heilmoor, Fenchel. Täglich 2 Tropfen je 5 kg.",
  aplusContent: null,
};

const aspekte = {
  painPoints: [{ label: "Hund frisst die Drops nicht", frequencyPct: null, mentionCount: 19, quotes: [] }],
  buyingTriggers: [{ label: "Produkt hilft gegen Sodbrennen", frequencyPct: null, mentionCount: 27, quotes: [] }],
};

describe("featureRelevanz — deterministisch aus dem Erwähnungs-Anteil", () => {
  it("Schwellen: 15 % → 5 · 10 % → 4 · 5 % → 3 · 2 % → 2 · darunter 1", () => {
    expect(featureRelevanz(15, 100)).toBe(5);
    expect(featureRelevanz(10, 100)).toBe(4);
    expect(featureRelevanz(5, 100)).toBe(3);
    expect(featureRelevanz(2, 100)).toBe(2);
    expect(featureRelevanz(1, 100)).toBe(1);
    expect(featureRelevanz(0, 100)).toBe(1);
  });
});

describe("normalisiereFeatureKarten — Verbatim-Verifikation (D133)", () => {
  it("Quellen-Tag nur, wenn das Zitat WÖRTLICH in der Quelle steht; Relevanz rechnet der Code", () => {
    const { cards, verworfen } = normalisiereFeatureKarten(
      {
        features: [
          {
            titel: "Gezielte Wirkung bei Sodbrennen",
            beschreibung: "Hilft laut Listing gegen Sodbrennen und Grasfressen.",
            belege: [
              { quelle: "bullets", zitat: "hilft bei Sodbrennen" },
              { quelle: "title", zitat: "gegen Sodbrennen und Grasfressen" },
              { quelle: "description", zitat: "steht nirgends" },
            ],
            passendeAspekte: ["Produkt hilft gegen Sodbrennen"],
            bildIdeen: ["Vorher/Nachher-Galeriebild"],
          },
        ],
      },
      quellen,
      aspekte,
      100,
    );
    expect(verworfen).toBe(0);
    expect(cards[0].quellen).toEqual(["Bullets", "Titel"]); // description-Beleg platzt
    expect(cards[0].belegAspekte[0].mentionCount).toBe(27); // Zählwert vom Code
    expect(cards[0].relevanz).toBe(5); // 27 von 100 = 27 % ≥ 15 %
  });

  it("Feature ohne einen einzigen verifizierten Beleg fliegt GEZÄHLT raus", () => {
    const { cards, verworfen } = normalisiereFeatureKarten(
      {
        features: [
          { titel: "Erfunden", beschreibung: "steht nicht im Listing", belege: [{ quelle: "bullets", zitat: "gibt es nicht" }], passendeAspekte: [], bildIdeen: [] },
        ],
      },
      quellen,
      aspekte,
      100,
    );
    expect(cards).toEqual([]);
    expect(verworfen).toBe(1);
  });

  it("ohne Kunden-Echo: Relevanz 1, Karte bleibt (ehrliches Signal, kein Rauswurf)", () => {
    const { cards } = normalisiereFeatureKarten(
      {
        features: [
          { titel: "Neutrale Geschmacksrichtung", beschreibung: "Attribut laut Produktinformation.", belege: [{ quelle: "attributes", zitat: "Geschmacksrichtung: Neutral" }], passendeAspekte: [], bildIdeen: [] },
        ],
      },
      quellen,
      aspekte,
      100,
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].relevanz).toBe(1);
    expect(cards[0].belegAspekte).toEqual([]);
  });
});

describe("rankeFeatures (Mock-Provider ohne Key)", () => {
  it("liefert Karten + ehrlichen USP-Hinweis (D144: Wettbewerber-Listings fehlen)", async () => {
    const res = await rankeFeatures({
      quellen,
      aspekte,
      reviewsGesamt: 100,
      belegText: "Tropfen für Hunde",
      wettbewerberAsins: 2,
    });
    expect(res.cards.length).toBeGreaterThan(0);
    expect(res.hinweise[0]).toContain("nicht bewertbar");
    expect(res.hinweise[0]).toContain("2 Wettbewerber-ASINs");
  });

  it("ohne jeden Listing-Text: ehrlicher Fehler", async () => {
    await expect(
      rankeFeatures({
        quellen: { title: null, bullets: [], description: null, attributes: null, importantInfo: null, aplusContent: null },
        aspekte,
        reviewsGesamt: 100,
        belegText: "",
        wettbewerberAsins: 0,
      }),
    ).rejects.toThrow(/Listing-Inhalt/);
  });
});
