import { describe, expect, it } from "vitest";
import { bildBloeckeAus, bildContentBlocks, MAX_VISION_BILDER, visionUrls } from "./bildVision";

/** D211: gemeinsamer, cachebarer Bild-Prefix für Auslese + Audit. */
describe("bildVision", () => {
  it("visionUrls filtert Nicht-https und begrenzt auf MAX_VISION_BILDER", () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`);
    expect(visionUrls(["http://x", "ftp://y", "https://a.jpg"])).toEqual(["https://a.jpg"]);
    expect(visionUrls(many)).toHaveLength(MAX_VISION_BILDER);
  });

  it("visionUrls entdoppelt Größen-Varianten desselben Bilds → keine Phantom-Slots (D216)", () => {
    // Dasselbe Amazon-Bild in groß + klein + eine kleine Variante eines 2. Bilds:
    // ergibt NICHT 3 Slots, sondern 2 (je die größte Variante), Reihenfolge erhalten.
    const urls = [
      "https://m.media-amazon.com/images/I/71ABC._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/72DEF._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/71ABC._SX300_.jpg", // verpixelte Dublette von Bild 1
    ];
    expect(visionUrls(urls)).toEqual([
      "https://m.media-amazon.com/images/I/71ABC._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/72DEF._AC_SL1500_.jpg",
    ]);
  });

  it("bildContentBlocks: je Bild Label + Bild, Cache-Breakpoint NUR auf dem letzten Bild", () => {
    const blocks = bildContentBlocks(["https://a.jpg", "https://b.jpg"]);
    expect(blocks).toHaveLength(4); // 2 Bilder × (Label + Bild)
    // erstes Label markiert das Hauptbild
    expect(String((blocks[0] as Record<string, unknown>).text)).toContain("(HAUPTBILD)");
    // erstes Bild ohne Cache-Marker, letztes Bild MIT Cache-Marker (Prefix-Ende)
    expect(blocks[1].cache_control).toBeUndefined();
    expect(blocks[3].cache_control).toEqual({ type: "ephemeral" });
  });

  it("Ein-Bild-Fall: Cache-Marker sitzt auf diesem einen Bild", () => {
    const blocks = bildContentBlocks(["https://only.jpg"]);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
  });

  // D220: base64-Pfad für hochgeladene A+-Bilder
  it("bildBloeckeAus baut base64-Quellen, ohne HAUPTBILD-Marker, Cache auf letztem Bild", () => {
    const blocks = bildBloeckeAus(
      [
        { base64: { mediaType: "image/jpeg", data: "AAA" } },
        { base64: { mediaType: "image/png", data: "BBB" } },
      ],
      { hauptbild: false },
    );
    expect(blocks).toHaveLength(4);
    expect(String((blocks[0] as Record<string, unknown>).text)).not.toContain("HAUPTBILD");
    expect(blocks[1].source).toEqual({ type: "base64", media_type: "image/jpeg", data: "AAA" });
    expect(blocks[1].cache_control).toBeUndefined();
    expect(blocks[3].cache_control).toEqual({ type: "ephemeral" });
  });

  it("bildBloeckeAus mischt url + base64 in derselben Reihenfolge", () => {
    const blocks = bildBloeckeAus([{ url: "https://a.jpg" }, { base64: { mediaType: "image/jpeg", data: "ZZ" } }]);
    expect(blocks[1].source).toEqual({ type: "url", url: "https://a.jpg" });
    expect(blocks[3].source).toEqual({ type: "base64", media_type: "image/jpeg", data: "ZZ" });
  });
});
