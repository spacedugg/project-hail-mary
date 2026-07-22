import { describe, expect, it } from "vitest";
import { belegStufe, beurteileAnalyseBasis } from "./konfidenz";

/** D138: Konfidenz in Worten, deterministisch — keine Fassaden-Prozente. */
describe("beurteileAnalyseBasis", () => {
  it("Referenz-Fall: 100 von 374 (27 %) → richtungsweisend", () => {
    const k = beurteileAnalyseBasis(100, 374);
    expect(k.stufe).toBe("richtungsweisend");
    expect(k.text).toContain("100 von 374");
    expect(k.text).toContain("27 %");
    expect(k.text).toContain("richtungsweisend");
  });

  it("große Stichprobe mit hohem Anteil → belastbar", () => {
    expect(beurteileAnalyseBasis(300, 600).stufe).toBe("belastbar");
  });

  it("150+ bei winzigem Anteil bleibt richtungsweisend (Anteil < 30 %)", () => {
    expect(beurteileAnalyseBasis(200, 5000).stufe).toBe("richtungsweisend");
  });

  it("Gesamtzahl unbekannt: Einordnung nur über die Stichprobe, ehrlich benannt", () => {
    const k = beurteileAnalyseBasis(180, null);
    expect(k.stufe).toBe("belastbar");
    expect(k.text).toContain("Gesamtzahl unbekannt");
  });

  it("Stufengrenzen: 19 nicht belastbar · 20 dünn · 60 richtungsweisend", () => {
    expect(beurteileAnalyseBasis(19, 100).stufe).toBe("nicht belastbar");
    expect(beurteileAnalyseBasis(20, 100).stufe).toBe("dünn");
    expect(beurteileAnalyseBasis(60, 100).stufe).toBe("richtungsweisend");
  });

  it("liefert die Herleitung zum Nachrechnen mit", () => {
    expect(beurteileAnalyseBasis(100, 374).herleitung).toContain("≥60 richtungsweisend");
  });
});

describe("belegStufe", () => {
  it("27 von 100 → stark, mit n-von-m-Ausweis", () => {
    const b = belegStufe(27, 100);
    expect(b.stufe).toBe("stark");
    expect(b.text).toBe("stark belegt (27 von 100 Reviews)");
  });

  it("4 von 100 → dünn · 8 von 200 → mittel (Stück-Schwelle)", () => {
    expect(belegStufe(4, 100).stufe).toBe("dünn");
    expect(belegStufe(8, 200).stufe).toBe("mittel");
  });

  it("Anteils-Schwelle greift auch bei kleiner Stichprobe (5 von 30 = 17 % → stark)", () => {
    expect(belegStufe(5, 30).stufe).toBe("stark");
  });

  it("ohne Zählwert: unbeziffert statt geratener Stufe", () => {
    expect(belegStufe(null, 100).stufe).toBe("unbeziffert");
  });
});
