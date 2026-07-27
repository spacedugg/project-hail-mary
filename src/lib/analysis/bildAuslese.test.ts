import { describe, expect, it } from "vitest";
import { aplusAlsText, bilderAlsText, leseAplusAus, leseBilderAus, normalisiereBildAuslese } from "./bildAuslese";

/** D158: Bild-Auslese — Struktur erzwungen, nichts Erfundenes. */
describe("normalisiereBildAuslese", () => {
  it("übernimmt gültige Slots, erzwingt das Typ-Enum, klemmt und dedupliziert", () => {
    const res = normalisiereBildAuslese(
      {
        bilder: [
          { slot: 1, typ: "MAIN_IMAGE", textImBild: ["STOPPT GRASFRESSEN", ""], inhalt: " Produktdose auf Weiß ", claims: ["hilft bei Sodbrennen"] },
          { slot: 2, typ: "lifestyle_in_use", textImBild: [], inhalt: "Hund auf Wiese", claims: [] },
          { slot: 3, typ: "phantasie-typ", textImBild: [], inhalt: "unklarer Typ", claims: [] },
          { slot: 1, textImBild: [], inhalt: "Duplikat", claims: [] },
          { slot: 99, inhalt: "gibt es nicht", textImBild: [], claims: [] },
          { slot: "kaputt", inhalt: "x" },
        ],
      },
      7,
    );
    expect(res.bilder).toHaveLength(3);
    // Groß-/Kleinschreibung normalisiert, Enum durchgesetzt
    expect(res.bilder[0]).toEqual({ slot: 1, typ: "main_image", textImBild: ["STOPPT GRASFRESSEN"], inhalt: "Produktdose auf Weiß", claims: ["hilft bei Sodbrennen"] });
    expect(res.bilder[1].typ).toBe("lifestyle_in_use");
    expect(res.bilder[2].typ).toBeNull(); // ungültiger Typ auf Slot>1 → ehrlich null, nichts geraten (D209)
    expect(res.befunde).toEqual([]); // Regel-Urteile abgeschafft (D165)
  });

  it("Slot 1 ist auf Amazon garantiert das Hauptbild → main_image auch ohne/mit ungültigem Label", () => {
    const res = normalisiereBildAuslese(
      { bilder: [{ slot: 1, textImBild: [], inhalt: "Freisteller", claims: [] }, { slot: 4, typ: "quatsch", textImBild: [], inhalt: "y", claims: [] }] },
      7,
    );
    expect(res.bilder[0].typ).toBe("main_image");
    expect(res.bilder[1].typ).toBeNull(); // Slot > 1 wird NICHT geraten
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

  it("nimmt den Bildtyp als Label mit auf, wenn vorhanden (D209)", () => {
    const t = bilderAlsText([{ slot: 1, typ: "main_image", textImBild: [], inhalt: "Freisteller auf Weiß", claims: [] }]);
    expect(t).toBe("Bild 1 [Main Image]: Freisteller auf Weiß");
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

// D220: A+-Bild-Auslese — einmal auslesen, Text behalten, Bytes verwerfen
describe("aplusAlsText", () => {
  it("formatiert je A+-Bild Text + Inhalt + Aussagen", () => {
    const t = aplusAlsText([
      { slot: 1, typ: null, textImBild: ["100 % BIO", "MADE IN GERMANY"], inhalt: "Herstellung im Werk", claims: ["nachhaltig produziert"] },
    ]);
    expect(t).toBe("A+-Bild 1: 100 % BIO · MADE IN GERMANY — Herstellung im Werk — Aussagen: nachhaltig produziert");
  });
  it("leere Bildliste → leerer String", () => {
    expect(aplusAlsText([])).toBe("");
  });
});

describe("leseAplusAus — ehrlich ohne Key", () => {
  it("ohne ANTHROPIC_API_KEY: null statt Mock", async () => {
    expect(await leseAplusAus([{ mediaType: "image/jpeg", data: "AAA" }])).toBeNull();
  });
  it("ohne Bilder: null", async () => {
    expect(await leseAplusAus([])).toBeNull();
  });
  it("filtert Nicht-Bilder heraus → null, wenn nichts Gültiges bleibt", async () => {
    expect(await leseAplusAus([{ mediaType: "application/pdf", data: "AAA" }])).toBeNull();
  });
});
