import { describe, expect, it } from "vitest";
import { parseAttributes, parseImportantInfo, parseListingCsv } from "./apifyProduct";

/**
 * D145: Attribute + „Wichtige Informationen" tolerant aus Actor-Items erkennen.
 * null heißt „vom Import-Weg nicht erfasst" — nie stilles Erfinden.
 */
describe("parseAttributes", () => {
  it("Array-Variante [{name, value}] → Schlüssel→Wert", () => {
    const out = parseAttributes({
      productInformation: [
        { name: "Marke", value: "Acme" },
        { name: "Artikelform", value: "Tropfen" },
        { name: "kaputt" }, // ohne value → fliegt raus
      ],
    });
    expect(out).toEqual({ Marke: "Acme", Artikelform: "Tropfen" });
  });

  it("Objekt-Variante {Schlüssel: Wert} inkl. Zahlen", () => {
    const out = parseAttributes({ attributes: { Marke: "Acme", Menge: 30 } });
    expect(out).toEqual({ Marke: "Acme", Menge: "30" });
  });

  it("unter 2 brauchbaren Paaren → null (kein Fassaden-Attribut-Set)", () => {
    expect(parseAttributes({ attributes: { Marke: "Acme" } })).toBeNull();
    expect(parseAttributes({})).toBeNull();
  });

  it("klemmt überlange Werte auf 500 Zeichen", () => {
    const out = parseAttributes({ attributes: { A: "x".repeat(900), B: "ok" } });
    expect(out?.A).toHaveLength(500);
  });
});

describe("parseImportantInfo", () => {
  it("String-Variante", () => {
    expect(parseImportantInfo({ importantInformation: " Nur handspülen. " })).toBe("Nur handspülen.");
  });

  it("Sektionen-Variante [{title, content}] → 'Titel: Inhalt' je Zeile", () => {
    const out = parseImportantInfo({
      importantInformation: [
        { title: "Inhaltsstoffe", content: "Ulmenrinde, Fenchel" },
        { title: "Hinweise", content: "Kühl lagern" },
        "Freitext-Zeile",
      ],
    });
    expect(out).toBe("Inhaltsstoffe: Ulmenrinde, Fenchel\nHinweise: Kühl lagern\nFreitext-Zeile");
  });

  it("nichts Brauchbares → null", () => {
    expect(parseImportantInfo({})).toBeNull();
    expect(parseImportantInfo({ importantInformation: [] })).toBeNull();
  });
});

describe("parseListingCsv — erweiterte Quellen ehrlich nicht erfasst", () => {
  it("H10-CSV führt keine Attribute/Wichtige Infos/A+ → null", () => {
    const snap = parseListingCsv('Title,Bullet 1\n"Flasche","hält kalt"');
    expect(snap.attributes).toBeNull();
    expect(snap.importantInfo).toBeNull();
    expect(snap.aplusContent).toBeNull();
  });
});
