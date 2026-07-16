import { describe, expect, it } from "vitest";
import { coerceListing } from "./anthropicProduct";

const URL = "https://www.amazon.de/dp/B0TEST0000";

describe("coerceListing — LLM generiert, Code erzwingt", () => {
  it("übernimmt belegte Werte und rundet Zahlen", () => {
    const snap = coerceListing(
      {
        title: "  Edelstahl Trinkflasche 1L  ",
        bullets: ["hält 24h kalt", "", "auslaufsicher"],
        description: "Text",
        imageUrls: ["https://m.media-amazon.com/images/I/abc123.jpg"],
        reviewsTotal: 1343.4,
        ratingAvg: 4.649,
        ratingDist: { "5": 70.4, "4": 15, "3": 6, "2": 3, "1": 6 },
      },
      URL,
    );
    expect(snap.title).toBe("Edelstahl Trinkflasche 1L");
    expect(snap.bullets).toEqual(["hält 24h kalt", "auslaufsicher"]);
    expect(snap.imageUrls).toHaveLength(1);
    expect(snap.reviewsTotal).toBe(1343);
    expect(snap.ratingAvg).toBe(4.6);
    expect(snap.ratingDist).toEqual({ "5": 70, "4": 15, "3": 6, "2": 3, "1": 6 });
  });

  it("verwirft halluzinierte Bild-Hosts — nur media-amazon.com", () => {
    const snap = coerceListing(
      {
        imageUrls: [
          "https://m.media-amazon.com/images/I/real.jpg",
          "https://example.com/fake.jpg",
          "http://m.media-amazon.com/insecure.jpg",
          "https://images-na.ssl-images-amazon.com/other.jpg",
        ],
      },
      URL,
    );
    expect(snap.imageUrls).toEqual(["https://m.media-amazon.com/images/I/real.jpg"]);
  });

  it("verwirft unplausible Zahlen ehrlich zu null", () => {
    const snap = coerceListing({ reviewsTotal: -5, ratingAvg: 7.2, ratingDist: { "5": 200, "9": 10 } }, URL);
    expect(snap.reviewsTotal).toBeNull();
    expect(snap.ratingAvg).toBeNull();
    expect(snap.ratingDist).toBeNull(); // < 3 gültige Klassen
  });

  it("leeres Objekt → leerer, ehrlicher Snapshot mit Quell-URL im raw", () => {
    const snap = coerceListing({}, URL);
    expect(snap.title).toBeNull();
    expect(snap.bullets).toEqual([]);
    expect(snap.ratingDist).toBeNull();
    expect(snap.raw).toEqual({ provider: "anthropic", url: URL });
  });
});
