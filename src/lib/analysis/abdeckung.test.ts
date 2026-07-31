import { describe, it, expect } from "vitest";
import { bildAbdeckung, bildBelegeAusSnapshot, textAbdeckung, type BildBeleg } from "./abdeckung";
import type { FeatureQuellen } from "@/lib/analysis/featureRanking";

/**
 * Fixture ist ein echtes Listing (boho office Basic Line, Nutzer-Vorlage
 * 30.07.) — an ihm ist der Nebensatz-Fall aufgefallen: „entspannter
 * Beinfreiheit" steht mitten in Bullet 2 und ist damit faktisch vorhanden,
 * praktisch aber unsichtbar.
 */
const QUELLEN: FeatureQuellen = {
  title:
    "boho office® Basic Line Schreibtisch Gestell elektrisch höhenverstellbar | Schwarz - ultraschnelle 80 mm/Sek, Memoryfunktion, Kollisionsschutz, 2 Motoren, 3-Fach Teleskop, stufenlos",
  bullets: [
    "BIS ZU 5x SCHNELLER: Elektrisch höhenverstellbarer Schreibtisch mit 2 Hochleistungsmotoren (≤55 dB) mit ultraschnellen 80 mm/Sek. für eine branchenführende Höhenverstellung. Mit 3 Speicherplätzen, Display-Sleep-Funktion und Kindersicherung.",
    "MAXIMALE STABILITÄT UND SICHERHEIT: Bis zu 40% mehr Stahl als herkömmliche Schreibtisch Gestelle. 36 kg Gewicht und maximale Seitenstabilität am Bürotisch mit entspannter Beinfreiheit. Ein Anti-Kollisionssystem garantiert Arbeitssicherheit.",
    "HÖCHSTE FLEXIBILITÄT AM ARBEITSPLATZ: Die Breite lässt sich teleskopisch von 116 cm bis 180 cm anpassen und bietet damit perfekte Anpassung an unterschiedliche Tischplatten.",
    "ERWEITERTE GARANTIE UND SERVICE + TÜV-GEPRÜFTE SICHERHEIT: 5 Jahre erweiterte Garantie und Produktservice mit persönlichem Ansprechpartner.",
    "60 TAGE UNVERBINDLICH TESTEN: Wir garantieren eine kostenlose Rücknahme innerhalb von 60 Tagen.",
  ],
  description: null,
  attributes: null,
  importantInfo: null,
  aplusContent: null,
  bilder: null,
};

describe("Text-Abdeckung (D265)", () => {
  it("Treffer im Titel ist prominent", () => {
    const r = textAbdeckung(QUELLEN, "Kollisionsschutz");
    expect(r.stufe).toBe("prominent");
    expect(r.kanaele.find((k) => k.kanal === "title")?.stufe).toBe("prominent");
  });

  it("Nebensatz im hinteren Teil eines späteren Bullets ist nur „erwähnt“", () => {
    // Der Befund, der die dritte Stufe erzwungen hat.
    const r = textAbdeckung({ ...QUELLEN, title: "Schreibtisch Gestell elektrisch" }, "Beinfreiheit");
    expect(r.stufe).toBe("erwaehnt");
    const bullets = r.kanaele.find((k) => k.kanal === "bullets");
    expect(bullets?.stufe).toBe("erwaehnt");
    expect(bullets?.position).toBe(2);
  });

  it("Treffer am Anfang eines späteren Bullets ist prominent", () => {
    const r = textAbdeckung({ ...QUELLEN, title: "Schreibtisch Gestell" }, "Flexibilität");
    expect(r.kanaele.find((k) => k.kanal === "bullets")?.stufe).toBe("prominent");
    expect(r.kanaele.find((k) => k.kanal === "bullets")?.position).toBe(3);
  });

  it("ein Nutzen, der nirgends steht, fehlt", () => {
    const r = textAbdeckung(QUELLEN, "Rückenbeschwerden");
    expect(r.stufe).toBe("fehlt");
  });

  it("leere Quellen sind „nicht erfasst“, nicht „fehlt“ (D145)", () => {
    const leer: FeatureQuellen = {
      title: null, bullets: [], description: null, attributes: null, importantInfo: null, aplusContent: null, bilder: null,
    };
    const r = textAbdeckung(leer, "Beinfreiheit");
    expect(r.stufe).toBe("nicht_erfasst");
    expect(r.kanaele.every((k) => k.stufe === "nicht_erfasst")).toBe(true);
  });

  it("erfasst jeden Kanal genau einmal", () => {
    const kanaele = textAbdeckung(QUELLEN, "Garantie").kanaele.map((k) => k.kanal);
    expect(new Set(kanaele).size).toBe(kanaele.length);
    expect(kanaele).toContain("aplus");
    expect(kanaele).toContain("attributes");
  });
});

describe("Bild-Abdeckung (D265)", () => {
  const bild = (slot: number, text: string, botschaft: number | null): BildBeleg => ({ slot, text, botschaft });

  it("kein Bild trifft das Thema → Bildbeweis fehlt", () => {
    expect(bildAbdeckung([bild(1, "Produkt freigestellt auf Weiß", 4)], "Beinfreiheit").stufe).toBe("fehlt");
  });

  it("ohne Bilder ist die Lage unbekannt, keine Lücke", () => {
    expect(bildAbdeckung([], "Beinfreiheit").stufe).toBe("nicht_erfasst");
    expect(bildAbdeckung([bild(1, "   ", null)], "Beinfreiheit").stufe).toBe("nicht_erfasst");
  });

  it("Treffer mit guter Botschafts-Note ist belegt", () => {
    const r = bildAbdeckung([bild(3, "Untersicht zeigt die Beinfreiheit unter der Platte", 4)], "Beinfreiheit");
    expect(r).toMatchObject({ stufe: "belegt", slot: 3, note: 4 });
  });

  it("selbst der beste Treffer unter der Schwelle bleibt „schwach“", () => {
    const r = bildAbdeckung(
      [bild(3, "Beinfreiheit angedeutet", 1.5), bild(5, "Beinfreiheit klein im Hintergrund", 2.5)],
      "Beinfreiheit",
    );
    expect(r).toMatchObject({ stufe: "schwach", slot: 5, note: 2.5 });
  });

  it("ohne Bild-Audit wird keine Note erfunden", () => {
    const r = bildAbdeckung([bild(2, "Beinfreiheit sichtbar", null)], "Beinfreiheit");
    expect(r).toMatchObject({ stufe: "nicht_bewertet", note: null });
  });

  it("liest Belege aus dem Snapshot-Format inkl. Botschafts-Note", () => {
    const belege = bildBelegeAusSnapshot([
      {
        slot: 2,
        inhalt: "Mann am Stehschreibtisch",
        textImBild: ["ERGONOMISCH ARBEITEN"],
        claims: ["80 mm/Sek"],
        faktoren: { message: { score: 2 }, design: { score: 4 }, clarity: { score: 3 } },
      },
    ]);
    expect(belege[0].slot).toBe(2);
    expect(belege[0].botschaft).toBe(2);
    expect(belege[0].text).toContain("ERGONOMISCH");
    expect(bildBelegeAusSnapshot(null)).toEqual([]);
  });
});
