import { describe, it, expect } from "vitest";
import { validateExtractedFees } from "./feesFromPdf";
import { DEFAULT_FEE_CONFIG } from "./fees";

describe("validateExtractedFees (deterministische Prüfung der LLM-Extraktion)", () => {
  it("übernimmt plausible Änderungen und listet sie als Diff", () => {
    const r = validateExtractedFees({ referralFlat: { "Alles andere": 0.1 } }, DEFAULT_FEE_CONFIG);
    expect(r.config.referralFlat["Alles andere"]).toBe(0.1);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].feld).toContain("Alles andere");
    expect(DEFAULT_FEE_CONFIG.referralFlat["Alles andere"]).toBe(0.08); // Default unberührt
  });

  it("normalisiert Prozent-Angaben (15 → 0,15) und verwirft Unplausibles", () => {
    const r = validateExtractedFees(
      { referralFlat: { Schmuck: 15, Baumarkt: 0.9 } }, // 0,9 = 90 % → unplausibel
      DEFAULT_FEE_CONFIG,
    );
    expect(r.config.referralFlat["Schmuck"]).toBe(0.15);
    expect(r.config.referralFlat["Baumarkt"]).toBe(DEFAULT_FEE_CONFIG.referralFlat["Baumarkt"]);
    expect(r.warnings.some((w) => w.includes("Baumarkt"))).toBe(true);
  });

  it("überspringt unbekannte Kategorien mit Warnung statt sie anzulegen", () => {
    const r = validateExtractedFees({ referralFlat: { "Fantasie-Kategorie": 0.12 } }, DEFAULT_FEE_CONFIG);
    expect("Fantasie-Kategorie" in r.config.referralFlat).toBe(false);
    expect(r.warnings.some((w) => w.includes("Fantasie-Kategorie"))).toBe(true);
    expect(r.changes).toHaveLength(0);
  });

  it("Entsorgungs-Tabelle: sortiert absteigend, Auffangwert bleibt erhalten", () => {
    const r = validateExtractedFees({ disposalStandard: [[1000, 0.6], [5000, 2.2]] }, DEFAULT_FEE_CONFIG);
    expect(r.config.disposalStandard[0][0]).toBe(5000);
    expect(r.config.disposalStandard[r.config.disposalStandard.length - 1][0]).toBe(-1); // Auffangwert ergänzt
  });

  it("Staffeln: nur bekannte Kategorien, Diff-Text nennt alt und neu", () => {
    const r = validateExtractedFees(
      { referralTiered: [{ category: "Beauty", thresholdEur: 12, belowOrEq: 0.08, above: 0.15 }] },
      DEFAULT_FEE_CONFIG,
    );
    expect(r.config.referralTiered.find((t) => t.category === "Beauty")!.thresholdEur).toBe(12);
    expect(r.changes[0].alt).toContain("10");
    expect(r.changes[0].neu).toContain("12");
  });
});
