import { describe, expect, it } from "vitest";
import { bildContentBlocks, MAX_VISION_BILDER, visionUrls } from "./bildVision";

/** D211: gemeinsamer, cachebarer Bild-Prefix für Auslese + Audit. */
describe("bildVision", () => {
  it("visionUrls filtert Nicht-https und begrenzt auf MAX_VISION_BILDER", () => {
    const many = Array.from({ length: 20 }, (_, i) => `https://x/${i}.jpg`);
    expect(visionUrls(["http://x", "ftp://y", "https://a.jpg"])).toEqual(["https://a.jpg"]);
    expect(visionUrls(many)).toHaveLength(MAX_VISION_BILDER);
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
});
