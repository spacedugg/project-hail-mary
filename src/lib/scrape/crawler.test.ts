import { describe, expect, it } from "vitest";
import { mapCrawlerItem } from "./crawler";

const URL = "https://www.amazon.de/dp/B0TEST0000";

describe("mapCrawlerItem — Produkt-Crawler-Output tolerant mappen", () => {
  it("mappt das junglee-Schema (stars, reviewsCount, starsBreakdown als Anteile)", () => {
    const snap = mapCrawlerItem(
      {
        title: "Edelstahl Trinkflasche 1L",
        features: ["hält 24h kalt", "auslaufsicher"],
        description: "Text",
        highResolutionImages: ["https://m.media-amazon.com/images/I/big.jpg"],
        thumbnailImage: "https://m.media-amazon.com/images/I/thumb.jpg",
        stars: 4.6,
        reviewsCount: 1343,
        starsBreakdown: { "5star": 0.7, "4star": 0.15, "3star": 0.06, "2star": 0.03, "1star": 0.06 },
        asin: "B0TEST0000",
      },
      URL,
    );
    expect(snap.title).toBe("Edelstahl Trinkflasche 1L");
    expect(snap.bullets).toHaveLength(2);
    expect(snap.reviewsTotal).toBe(1343);
    expect(snap.ratingAvg).toBe(4.6);
    expect(snap.ratingDist).toEqual({ "5": 70, "4": 15, "3": 6, "2": 3, "1": 6 });
    expect(snap.imageUrls[0]).toBe("https://m.media-amazon.com/images/I/big.jpg");
  });

  it("versteht Prozent-Werte im Breakdown und dedupliziert Bilder", () => {
    const snap = mapCrawlerItem(
      {
        starsBreakdown: { "5 star": 70, "4 star": 15, "3 star": 6 },
        highResolutionImages: ["https://m.media-amazon.com/a.jpg"],
        galleryThumbnails: ["https://m.media-amazon.com/a.jpg", "http://unsicher.example/b.jpg"],
      },
      URL,
    );
    expect(snap.ratingDist).toEqual({ "5": 70, "4": 15, "3": 6 });
    expect(snap.imageUrls).toEqual(["https://m.media-amazon.com/a.jpg"]);
  });

  it("fehlende Felder bleiben ehrlich null/leer", () => {
    const snap = mapCrawlerItem({ starsBreakdown: { "5star": 0.9 } }, URL);
    expect(snap.title).toBeNull();
    expect(snap.reviewsTotal).toBeNull();
    expect(snap.ratingDist).toBeNull(); // < 3 Klassen
    expect(snap.raw).toMatchObject({ provider: "crawler", url: URL });
  });
});
