import { describe, expect, it } from "vitest";
import { normalisiereInsightCards, verdichteInsights } from "./verdichtung";
import type { ReviewInsightsPayload } from "@/db/schema";

/** Roh-Themen wie aus der Analyse-Etappe (D131-Basis). */
const aspekte = {
  painPoints: [
    { label: "Hund frisst die Drops nicht", frequencyPct: 20, mentionCount: 19, quotes: ["verweigert sie"] },
    { label: "Produkt zeigt keine Wirkung", frequencyPct: 6, mentionCount: 6, quotes: [] },
  ],
  buyingTriggers: [
    { label: "Produkt hilft gegen Sodbrennen", frequencyPct: 30, mentionCount: 27, quotes: ["frisst kein Gras mehr"] },
    { label: "Natürliche Inhaltsstoffe", frequencyPct: 10, mentionCount: 9, quotes: [] },
  ],
};

const QUELLEN = ["Reviews: eigenes Produkt", "Reviews: 2 Wettbewerber"];

describe("normalisiereInsightCards — LLM generiert, Code erzwingt", () => {
  it("löst Beleg-Referenzen gegen echte Roh-Themen auf und stempelt Zählwerte + Quellen vom Code", () => {
    const { cards, verworfen } = normalisiereInsightCards(
      {
        insights: [
          {
            titel: "Wirksamkeit überzeugt, aber nicht garantiert",
            beschreibung: "Die meisten sehen Wirkung, eine Minderheit nicht — Erwartungs-Management nötig.",
            relevanz: 5,
            bildIdeen: ["Vorher/Nachher-Galeriebild"],
            belegAspekte: ["Produkt hilft gegen Sodbrennen", "Produkt zeigt keine Wirkung"],
          },
        ],
      },
      aspekte,
      QUELLEN,
    );
    expect(verworfen).toBe(0);
    expect(cards).toHaveLength(1);
    expect(cards[0].quellen).toEqual(QUELLEN);
    // Zählwerte kommen aus der Roh-Analyse, nicht vom LLM
    expect(cards[0].belegAspekte).toEqual([
      { label: "Produkt hilft gegen Sodbrennen", typ: "buyingTrigger", mentionCount: 27 },
      { label: "Produkt zeigt keine Wirkung", typ: "painPoint", mentionCount: 6 },
    ]);
  });

  it("Karte ohne gültigen Beleg fliegt raus und wird GEZÄHLT (D133)", () => {
    const { cards, verworfen } = normalisiereInsightCards(
      {
        insights: [
          { titel: "Erfundenes", beschreibung: "ohne Basis", relevanz: 5, belegAspekte: ["gibt es nicht"] },
          { titel: "Echt", beschreibung: "belegt", relevanz: 4, belegAspekte: ["Natürliche Inhaltsstoffe"] },
        ],
      },
      aspekte,
      QUELLEN,
    );
    expect(cards.map((c) => c.titel)).toEqual(["Echt"]);
    expect(verworfen).toBe(1);
  });

  it("Dedup-Gate (D137): identischer Titel wird zusammengelegt statt wiederholt", () => {
    const doppelt = {
      titel: "Akzeptanz ist die Hürde",
      beschreibung: "Wählerische Fresser verweigern die Drops.",
      relevanz: 4,
      belegAspekte: ["Hund frisst die Drops nicht"],
    };
    const { cards, verworfen } = normalisiereInsightCards(
      { insights: [doppelt, { ...doppelt, bildIdeen: ["GIF: Hund nimmt Drops"] }, doppelt] },
      aspekte,
      QUELLEN,
    );
    expect(cards).toHaveLength(1);
    expect(verworfen).toBe(2);
    expect(cards[0].bildIdeen).toContain("GIF: Hund nimmt Drops");
  });

  it("sortiert nach Relevanz absteigend, klemmt Relevanz auf 1–5", () => {
    const { cards } = normalisiereInsightCards(
      {
        insights: [
          { titel: "B", beschreibung: "x", relevanz: 99, belegAspekte: ["Natürliche Inhaltsstoffe"] },
          { titel: "A", beschreibung: "x", relevanz: -3, belegAspekte: ["Hund frisst die Drops nicht"] },
        ],
      },
      aspekte,
      QUELLEN,
    );
    expect(cards.map((c) => [c.titel, c.relevanz])).toEqual([
      ["B", 5],
      ["A", 1],
    ]);
  });

  it("kaputte Antwort → keine Karten, nichts geraten", () => {
    const { cards } = normalisiereInsightCards({ insights: "quatsch" }, aspekte, QUELLEN);
    expect(cards).toEqual([]);
  });
});

describe("verdichteInsights (Mock-Provider ohne Key)", () => {
  const payload: ReviewInsightsPayload = {
    sources: [],
    stats: { reviewsTotal: 61, ratingAvg: 4.2 },
    ...aspekte,
    languageToBorrow: [],
    languageToAvoid: [],
  };

  it("liefert Karten aus ECHTEN Top-Aspekten mit gestempelten Quellen", async () => {
    const res = await verdichteInsights(payload, { quellen: QUELLEN });
    expect(res.cards.length).toBeGreaterThan(0);
    expect(res.cards[0].quellen).toEqual(QUELLEN);
    expect(res.cards[0].belegAspekte[0].label).toBe("Produkt hilft gegen Sodbrennen");
    expect(res.kernThese).toBeTruthy();
  });

  it("ohne Roh-Themen: ehrlicher Fehler statt leerer Fassade", async () => {
    await expect(
      verdichteInsights({ ...payload, painPoints: [], buyingTriggers: [] }, { quellen: QUELLEN }),
    ).rejects.toThrow(/Roh-Themen/);
  });
});
