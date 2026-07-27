import { describe, expect, it } from "vitest";
import { bereinigeBildUrls } from "./bilder";

/** D216: Amazon-Größen-Varianten desselben Bilds entdoppeln (Geister-Slots + Verpixelung). */
describe("bereinigeBildUrls", () => {
  it("behält je Bild-ID nur die größte Variante, Reihenfolge des ersten Auftretens", () => {
    const urls = [
      "https://m.media-amazon.com/images/I/71AAA._AC_SL1500_.jpg", // Bild A groß
      "https://m.media-amazon.com/images/I/61BBB._AC_SL1500_.jpg", // Bild B groß
      "https://m.media-amazon.com/images/I/71AAA._AC_SX300_.jpg", // A klein (Dup) → raus
      "https://m.media-amazon.com/images/I/61BBB._SS40_.jpg", // B winzig (Dup) → raus
    ];
    expect(bereinigeBildUrls(urls)).toEqual([
      "https://m.media-amazon.com/images/I/71AAA._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/61BBB._AC_SL1500_.jpg",
    ]);
  });

  it("ersetzt eine zuerst gesehene kleine Variante durch die spätere größere (Position bleibt)", () => {
    const urls = [
      "https://m.media-amazon.com/images/I/71AAA._SX300_.jpg", // klein zuerst
      "https://m.media-amazon.com/images/I/71AAA._AC_SL1600_.jpg", // groß später
    ];
    expect(bereinigeBildUrls(urls)).toEqual(["https://m.media-amazon.com/images/I/71AAA._AC_SL1600_.jpg"]);
  });

  it("entdoppelt exakte Duplikate und behält unterschiedliche Bilder", () => {
    const urls = ["https://x/a.jpg", "https://x/a.jpg", "https://x/b.jpg"];
    expect(bereinigeBildUrls(urls)).toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
  });

  it("leere Liste → leer; leere Einträge werden ignoriert", () => {
    expect(bereinigeBildUrls([])).toEqual([]);
    expect(bereinigeBildUrls(["", "https://x/a.jpg"])).toEqual(["https://x/a.jpg"]);
  });
});
