import { describe, expect, it } from "vitest";
import { bilderAlsText, leseBilderAus, normalisiereBildAuslese } from "./bildAuslese";

/** D158: Bild-Auslese — Struktur erzwungen, nichts Erfundenes. */
describe("normalisiereBildAuslese", () => {
  it("übernimmt gültige Slots, klemmt und dedupliziert", () => {
    const res = normalisiereBildAuslese(
      {
        bilder: [
          { slot: 1, textImBild: ["STOPPT GRASFRESSEN", ""], inhalt: " Produktdose auf Weiß ", claims: ["hilft bei Sodbrennen"] },
          { slot: 1, textImBild: [], inhalt: "Duplikat", claims: [] },
          { slot: 99, inhalt: "gibt es nicht", textImBild: [], claims: [] },
          { slot: "kaputt", inhalt: "x" },
        ],
      },
      7,
    );
    expect(res.bilder).toHaveLength(1);
    expect(res.bilder[0]).toEqual({ slot: 1, textImBild: ["STOPPT GRASFRESSEN"], inhalt: "Produktdose auf Weiß", claims: ["hilft bei Sodbrennen"] });
    expect(res.befunde).toEqual([]); // Regel-Urteile abgeschafft (D165)
  });

  it("kaputte Antwort → leer, nichts geraten", () => {
    expect(normalisiereBildAuslese({ bilder: "quatsch" }, 5)).toEqual({ bilder: [], befunde: [] });
  });
});

describe("bilderAlsText — Quelle Bilder für Ranking/Wahrheits-Filter", () => {
  it("baut je Bild eine Zeile mit Inhalt, Text und Claims", () => {
    const t = bilderAlsText([{ slot: 2, textImBild: ["2 TROPFEN / 5 KG"], inhalt: "Dosierungs-Infografik", claims: ["einfache Dosierung"] }]);
    expect(t).toBe("Bild 2: Dosierungs-Infografik — Text im Bild: 2 TROPFEN / 5 KG — Claims: einfache Dosierung");
    expect(bilderAlsText(null)).toBe("");
  });
});

describe("leseBilderAus — ehrlich ohne Key", () => {
  it("ohne ANTHROPIC_API_KEY: null statt Mock (erfundene Bild-Inhalte wären Gift)", async () => {
    expect(await leseBilderAus(["https://m.media-amazon.com/images/I/x.jpg"])).toBeNull();
  });

  it("ohne Bilder: null", async () => {
    expect(await leseBilderAus([])).toBeNull();
  });
});
