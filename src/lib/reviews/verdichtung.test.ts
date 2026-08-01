import { describe, expect, it } from "vitest";
import { filtereEinzelnennungen, kartenTendenz, normalisiereInsightCards, verdichteInsights } from "./verdichtung";
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

  it("ignoriert die LLM-Relevanz vollständig und rechnet sie aus den Beleg-Aspekten (D266)", () => {
    // Vorher übernahm der Code die LLM-Zahl (nur geklemmt) — damit hatten
    // Verdichtung, Feature-Ranking und Blocker-Lauf zwei verschiedene Maßstäbe.
    const { cards } = normalisiereInsightCards(
      {
        insights: [
          { titel: "Ein Beleg", beschreibung: "x", relevanz: 99, belegAspekte: ["Natürliche Inhaltsstoffe"] },
          { titel: "Zwei Belege", beschreibung: "x", relevanz: -3, belegAspekte: ["Produkt hilft gegen Sodbrennen", "Produkt zeigt keine Wirkung"] },
        ],
      },
      aspekte,
      QUELLEN,
    );
    // 2 Beleg-Aspekte → 4 · 1 Beleg-Aspekt → 3; absteigend sortiert
    expect(cards.map((c) => [c.titel, c.relevanz])).toEqual([
      ["Zwei Belege", 4],
      ["Ein Beleg", 3],
    ]);
  });

  it("bei gleicher Relevanz entscheiden die verifizierten Fundstellen", () => {
    const { cards } = normalisiereInsightCards(
      {
        insights: [
          { titel: "Schwächer belegt", beschreibung: "x", belegAspekte: ["Natürliche Inhaltsstoffe"] },
          { titel: "Stärker belegt", beschreibung: "x", belegAspekte: ["Produkt hilft gegen Sodbrennen"] },
        ],
      },
      aspekte,
      QUELLEN,
    );
    expect(cards.map((c) => c.titel)).toEqual(["Stärker belegt", "Schwächer belegt"]);
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

describe("kartenTendenz — Gegensatz-Gewichtung rechnet der Code (D171)", () => {
  it("beide Seiten mit Zählwerten → Richtung aus den verifizierten Fundstellen", () => {
    const t = kartenTendenz({
      belegAspekte: [
        { label: "Hund frisst die Drops nicht", typ: "painPoint", mentionCount: 19 },
        { label: "Hund frisst die Drops gerne", typ: "buyingTrigger", mentionCount: 8 },
      ],
    });
    expect(t).toEqual({ positiv: 8, negativ: 19, richtung: "negativ" });
  });

  it("nur eine Seite oder ohne Zählwerte → null (keine erfundene Tendenz)", () => {
    expect(kartenTendenz({ belegAspekte: [{ label: "x", typ: "painPoint", mentionCount: 19 }] })).toBeNull();
    expect(
      kartenTendenz({
        belegAspekte: [
          { label: "x", typ: "painPoint", mentionCount: null },
          { label: "y", typ: "buyingTrigger", mentionCount: 8 },
        ],
      }),
    ).toBeNull();
  });

  it("Gleichstand → ausgeglichen", () => {
    expect(
      kartenTendenz({
        belegAspekte: [
          { label: "x", typ: "painPoint", mentionCount: 5 },
          { label: "y", typ: "buyingTrigger", mentionCount: 5 },
        ],
      })?.richtung,
    ).toBe("ausgeglichen");
  });
});

describe("filtereEinzelnennungen — Signifikanz-Gate (D170)", () => {
  const selten = { label: "Insektenprotein überrascht", frequencyPct: null, mentionCount: 1, quotes: ["hätte ich das gewusst"] };
  const haeufig = { label: "Hund frisst die Drops nicht", frequencyPct: null, mentionCount: 19, quotes: [] };
  const ohneZahl = { label: "Altbestand ohne Zählwert", frequencyPct: null, mentionCount: null, quotes: [] };

  it("bei großer Stichprobe fliegen Einzelnennungen GEZÄHLT und BENANNT raus", () => {
    const { aspekte, hinweise } = filtereEinzelnennungen({ painPoints: [selten, haeufig], buyingTriggers: [] }, 1000);
    expect(aspekte.painPoints.map((a) => a.label)).toEqual(["Hund frisst die Drops nicht"]);
    expect(hinweise[0]).toContain("Insektenprotein überrascht");
    expect(hinweise[0]).toContain("1000 analysierten Reviews");
  });

  it("ab 500 Reviews braucht ein Aspekt 3 Fundstellen", () => {
    const zwei = { ...selten, mentionCount: 2 };
    expect(filtereEinzelnennungen({ painPoints: [zwei, haeufig], buyingTriggers: [] }, 600).aspekte.painPoints.map((a) => a.label)).toEqual([haeufig.label]);
    expect(filtereEinzelnennungen({ painPoints: [zwei], buyingTriggers: [] }, 200).aspekte.painPoints).toHaveLength(1);
  });

  it("Sicherung: würde das Gate ALLES streichen, bleibt die Roh-Liste stehen (Zählwerte sind Mindestwerte)", () => {
    const { aspekte, hinweise } = filtereEinzelnennungen({ painPoints: [selten], buyingTriggers: [] }, 1000);
    expect(aspekte.painPoints).toHaveLength(1);
    expect(hinweise[0]).toContain("ausgesetzt");
  });

  it("kleine Stichprobe und Altbestand ohne Zählwert bleiben unangetastet", () => {
    expect(filtereEinzelnennungen({ painPoints: [selten], buyingTriggers: [] }, 60).aspekte.painPoints).toHaveLength(1);
    expect(filtereEinzelnennungen({ painPoints: [ohneZahl], buyingTriggers: [] }, 1000).aspekte.painPoints).toHaveLength(1);
  });
});

/**
 * Herkunfts-Kette (D275, Nutzer-Frage 01.08.2026: „ob du wirklich noch im Kopf
 * hast, welche Bewertungen von unserem Produkt stammen und welche bei
 * Fremdprodukten entstehen").
 *
 * Die Roh-Aspekte tragen die Aufschlüsselung seit D196 — `findeAspekt` ließ sie
 * fallen. Ergebnis war ein `mentionCount` auf jeder Karte, der eigene und
 * Wettbewerber-Fundstellen stillschweigend summierte.
 */
describe("Review-Herkunft überlebt die Verdichtung (D275)", () => {
  const mitHerkunft = {
    painPoints: [
      {
        label: "Undichte Anschlüsse",
        frequencyPct: 20,
        mentionCount: 15,
        quotes: [],
        herkunft: { eigene: 3, fremde: 12, jeAsin: { B0EIGEN: 3, B0FREMD: 12 } },
        uebertragbarkeit: { urteil: "unbekannt" as const, grund: "Gleiche Anschlussnorm, andere Dichtung." },
      },
    ],
    buyingTriggers: [
      { label: "Erwärmt zuverlässig", frequencyPct: 10, mentionCount: 9, quotes: [] },
    ],
  };

  it("findeAspekt reicht herkunft und uebertragbarkeit an die Karte durch", () => {
    const { cards } = normalisiereInsightCards(
      { insights: [{ titel: "Dichtungen", beschreibung: "…", belegAspekte: ["Undichte Anschlüsse"] }] },
      mitHerkunft,
      QUELLEN,
    );
    const beleg = cards[0].belegAspekte[0];
    expect(beleg.mentionCount).toBe(15);
    expect(beleg.herkunft).toEqual({ eigene: 3, fremde: 12, jeAsin: { B0EIGEN: 3, B0FREMD: 12 } });
    expect(beleg.uebertragbarkeit?.urteil).toBe("unbekannt");
  });

  it("die Summe bleibt nachvollziehbar: eigene + fremde ergeben den Zählwert", () => {
    const { cards } = normalisiereInsightCards(
      { insights: [{ titel: "Dichtungen", beschreibung: "…", belegAspekte: ["Undichte Anschlüsse"] }] },
      mitHerkunft,
      QUELLEN,
    );
    const b = cards[0].belegAspekte[0];
    expect((b.herkunft!.eigene + b.herkunft!.fremde)).toBe(b.mentionCount);
  });

  it("Aspekte ohne Herkunft behaupten nichts (Alt-Payloads bleiben ehrlich leer)", () => {
    const { cards } = normalisiereInsightCards(
      { insights: [{ titel: "Wärme", beschreibung: "…", belegAspekte: ["Erwärmt zuverlässig"] }] },
      mitHerkunft,
      QUELLEN,
    );
    expect(cards[0].belegAspekte[0].herkunft).toBeUndefined();
  });
});
