import { describe, it, expect } from "vitest";
import { vergleiche, alertsAus, aehnlichkeit, normalisiere } from "./accuracy";

const soll = {
  title: "Marke Bettwäsche 135x200 – atmungsaktiv",
  bullets: ["Bullet eins", "Bullet zwei"],
  description: "Beschreibung",
  backendKeywords: "a b c",
  mainImageUrl: "https://cdn.example.com/haupt.jpg",
};

describe("Soll/Ist-Abgleich", () => {
  it("wertet typografische Unterschiede nicht als Abweichung", () => {
    expect(normalisiere('„Test" – A')).toBe('"test" - a');
    expect(aehnlichkeit("Marke – Test", "Marke - Test")).toBe(1);
  });

  it("meldet 100 %, wenn das Live-Listing dem Soll entspricht", () => {
    const e = vergleiche(soll, {
      title: soll.title,
      bullets: soll.bullets,
      description: soll.description,
      imageUrls: ["https://m.media-amazon.com/images/I/xyz.jpg"],
      gecrawltAm: new Date("2026-07-20"),
    });
    expect(e.accuracyPct).toBe(100);
    expect(e.pruefbar).toBe(3); // Titel, Bullets, Beschreibung — Bild/Backend nicht prüfbar
  });

  it("erkennt überschriebenen Text", () => {
    const e = vergleiche(soll, { title: "Ganz anderer Titel vom Kunden", bullets: soll.bullets, description: soll.description, imageUrls: ["x"] });
    expect(e.slots.find((s) => s.slot === "title")?.status).toBe("abweichung");
    expect(e.accuracyPct).toBe(67);
  });

  it("gibt OHNE Ist-Daten null zurück statt 0 oder 100", () => {
    const e = vergleiche(soll, null);
    expect(e.accuracyPct).toBeNull();
    expect(e.pruefbar).toBe(0);
  });

  it("behauptet ohne Crawl NICHT, etwas sei nicht live", () => {
    const e = vergleiche(soll, null);
    // kein Slot darf „fehlt live" heißen, wenn nie nachgesehen wurde
    expect(e.slots.every((s) => s.status === "nicht_pruefbar")).toBe(true);
    expect(alertsAus(e, "Testprodukt")).toEqual([]);
  });

  it("meldet dagegen einen leeren Crawl-Treffer als Befund", () => {
    const e = vergleiche(soll, { title: null, bullets: [], description: null, imageUrls: [], gecrawltAm: new Date("2026-07-20") });
    expect(alertsAus(e, "Testprodukt").map((a) => a.art)).toContain("listing_leer");
  });

  it("markiert Backend-Keywords dauerhaft als nicht prüfbar", () => {
    const e = vergleiche(soll, { title: soll.title, bullets: soll.bullets, description: soll.description, imageUrls: ["x"] });
    expect(e.slots.find((s) => s.slot === "backend_keywords")?.status).toBe("nicht_pruefbar");
  });

  it("leitet Alerts aus dem Abgleich ab", () => {
    const e = vergleiche(soll, { title: "Anderer Titel", bullets: soll.bullets, description: soll.description, imageUrls: [] });
    const alerts = alertsAus(e, "Testprodukt");
    expect(alerts.map((a) => a.art)).toEqual(expect.arrayContaining(["text_ueberschrieben", "hauptbild_weg"]));
    expect(alerts.find((a) => a.art === "hauptbild_weg")?.schwere).toBe("hoch");
  });

  it("meldet ein leeres Listing als möglichen Sperr-Fall", () => {
    const e = vergleiche(soll, { title: null, bullets: [], description: null, imageUrls: ["x"], gecrawltAm: new Date() });
    // kein Ist-Text ⇒ nicht messbar, aber die Slots stehen auf fehlt_live
    expect(e.slots.find((s) => s.slot === "title")?.status).toBe("fehlt_live");
  });
});
