import { describe, expect, it } from "vitest";
import { beurteileAnalyseBasis } from "./konfidenz";

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
