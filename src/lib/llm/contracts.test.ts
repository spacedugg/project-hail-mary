import { describe, it, expect } from "vitest";
import { pruefeKontrakt, kontraktVerstoesseAlsText } from "./contracts";

/**
 * Daten-Kontrakte (D183): Schema-Verstöße werden an der Grenze abgewiesen —
 * die Tests decken genau die Fälle, die vorher stillschweigend weiterflossen
 * (leerer Titel via String(parsed.title ?? ""), halbe Bullet-Arrays).
 */

const rationale = [{ part: "Hauptkeyword", source: "Keyword-Analyse" }];

describe("pruefeKontrakt", () => {
  it("leerer/fehlender Titel wird abgewiesen (vorher: stiller Leerstring)", () => {
    expect(pruefeKontrakt("title", { rationale }).map((v) => v.feld)).toContain("title");
    expect(pruefeKontrakt("title", { title: "   ", rationale }).map((v) => v.feld)).toContain("title");
    expect(pruefeKontrakt("title", { title: "AquaNova Edelstahl-Trinkflasche 750 ml", rationale })).toEqual([]);
  });

  it("Bullets: falsche Anzahl und leere Einträge werden abgewiesen", () => {
    const dreiStatts5 = pruefeKontrakt("bullets", { bullets: ["a", "b", "c"], rationale });
    expect(dreiStatts5.map((v) => v.feld)).toContain("bullets");
    const mitLeerem = pruefeKontrakt("bullets", { bullets: ["a", "b", "", "d", "e"], rationale });
    expect(mitLeerem.map((v) => v.feld)).toContain("bullets[2]");
    expect(pruefeKontrakt("bullets", { bullets: ["a", "b", "c", "d", "e"], rationale })).toEqual([]);
  });

  it("Q&A: Paar ohne Antwort wird abgewiesen", () => {
    const pairs = [
      { q: "F1?", a: "A1" }, { q: "F2?", a: "" }, { q: "F3?", a: "A3" }, { q: "F4?", a: "A4" }, { q: "F5?", a: "A5" },
    ];
    expect(pruefeKontrakt("qa", { pairs, rationale }).map((v) => v.feld)).toContain("pairs[1]");
  });

  it("fehlende Rationale wird abgewiesen (Begründungs-Pflicht)", () => {
    expect(pruefeKontrakt("title", { title: "Ok-Titel" }).map((v) => v.feld)).toContain("rationale");
    expect(pruefeKontrakt("title", { title: "Ok-Titel", rationale: [{ part: "x" }] }).map((v) => v.feld)).toContain("rationale[0]");
  });

  it("Verstoß-Text ist LLM-tauglich präzise (Feld + Problem)", () => {
    const text = kontraktVerstoesseAlsText(pruefeKontrakt("bullets", { bullets: "kein array", rationale }));
    expect(text).toContain("bullets");
    expect(text).toContain("Array");
  });
});
