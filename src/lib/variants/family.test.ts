import { describe, it, expect } from "vitest";
import { pruefeFamilie, istFamilieGueltig, achsenSignatur, istKaufbar } from "./family";
import type { FamilieKontraktInput } from "./family";

/**
 * Daten-Kontrakt „Variations-Familie" (D221/D183). Getestet wird genau das,
 * was Code — nicht das LLM — erzwingen muss: Achsen-Vollständigkeit,
 * Dubletten-Achsenwerte, ASIN-Eindeutigkeit, Parent≠Child.
 */

const gueltig: FamilieKontraktInput = {
  parentAsin: "B000PARENT",
  variationTheme: ["flavor"],
  children: [
    { asin: "B001", axisValues: { flavor: "Erdbeere" } },
    { asin: "B002", axisValues: { flavor: "Kiwi" } },
  ],
};

describe("pruefeFamilie", () => {
  it("akzeptiert eine saubere Familie", () => {
    expect(pruefeFamilie(gueltig)).toEqual([]);
    expect(istFamilieGueltig(gueltig)).toBe(true);
  });

  it("weist leeres/fehlendes variationTheme ab", () => {
    const felder = pruefeFamilie({ ...gueltig, variationTheme: [] }).map((v) => v.feld);
    expect(felder).toContain("variationTheme");
  });

  it("weist doppelte Achse im Theme ab", () => {
    const felder = pruefeFamilie({ ...gueltig, variationTheme: ["flavor", "Flavor"] }).map((v) => v.feld);
    expect(felder.some((f) => f.startsWith("variationTheme["))).toBe(true);
  });

  it("verlangt ≥ 2 Childs (eine ASIN allein ist standalone)", () => {
    const einChild = { ...gueltig, children: [gueltig.children[0]] };
    expect(pruefeFamilie(einChild).map((v) => v.feld)).toContain("children");
  });

  it("verlangt für JEDE Achse einen Wert je Child", () => {
    const zweiAchsen: FamilieKontraktInput = {
      variationTheme: ["size", "color"],
      children: [
        { asin: "B001", axisValues: { size: "500 g" } }, // color fehlt
        { asin: "B002", axisValues: { size: "1 kg", color: "blau" } },
      ],
    };
    const felder = pruefeFamilie(zweiAchsen).map((v) => v.feld);
    expect(felder).toContain("children[0].axisValues.color");
  });

  it("weist Achsen außerhalb des Themes ab", () => {
    const fremd: FamilieKontraktInput = {
      variationTheme: ["flavor"],
      children: [
        { asin: "B001", axisValues: { flavor: "Erdbeere", size: "500 g" } },
        { asin: "B002", axisValues: { flavor: "Kiwi" } },
      ],
    };
    const felder = pruefeFamilie(fremd).map((v) => v.feld);
    expect(felder).toContain("children[0].axisValues.size");
  });

  it("weist zwei Childs mit identischer Achsen-Kombination ab (Dublette, beide Erdbeere)", () => {
    const dublette: FamilieKontraktInput = {
      variationTheme: ["flavor"],
      children: [
        { asin: "B001", axisValues: { flavor: "Erdbeere" } },
        { asin: "B002", axisValues: { flavor: "erdbeere" } }, // gleiche Kombination, andere Schreibung
      ],
    };
    expect(pruefeFamilie(dublette).map((v) => v.feld)).toContain("children[1].axisValues");
  });

  it("weist doppelte Child-ASIN ab", () => {
    const dopplung: FamilieKontraktInput = {
      variationTheme: ["flavor"],
      children: [
        { asin: "B001", axisValues: { flavor: "Erdbeere" } },
        { asin: "B001", axisValues: { flavor: "Kiwi" } },
      ],
    };
    expect(pruefeFamilie(dopplung).map((v) => v.feld)).toContain("children[1].asin");
  });

  it("crasht NICHT bei Nicht-String-Achsenwert, sondern weist ihn ab (Prefill-Härte, D183)", () => {
    const kaputt = {
      variationTheme: ["flavor"],
      children: [
        { asin: "B001", axisValues: { flavor: 500 } },
        { asin: "B002", axisValues: { flavor: "Kiwi" } },
      ],
    } as unknown as FamilieKontraktInput;
    let felder: string[] = [];
    expect(() => {
      felder = pruefeFamilie(kaputt).map((v) => v.feld);
    }).not.toThrow();
    expect(felder).toContain("children[0].axisValues.flavor");
  });

  it("meldet KEINE falsche Dublette, wenn ein Achsenwert selbst „ | \" enthält", () => {
    const mitPipe: FamilieKontraktInput = {
      variationTheme: ["a", "b"],
      children: [
        { asin: "B001", axisValues: { a: "x | y", b: "z" } },
        { asin: "B002", axisValues: { a: "x", b: "y | z" } },
      ],
    };
    // Zwei echt verschiedene Kombinationen — dürfen NICHT als Dublette kollidieren.
    expect(pruefeFamilie(mitPipe)).toEqual([]);
  });

  it("akzeptiert zwei Achsen, wenn sich Childs in genau einer Achse unterscheiden", () => {
    const zweiAchsen: FamilieKontraktInput = {
      variationTheme: ["size", "color"],
      children: [
        { asin: "B001", axisValues: { size: "500 g", color: "blau" } },
        { asin: "B002", axisValues: { size: "1 kg", color: "blau" } },
      ],
    };
    expect(pruefeFamilie(zweiAchsen)).toEqual([]);
  });

  it("weist Parent-ASIN ab, die zugleich Child ist", () => {
    const kollision: FamilieKontraktInput = { ...gueltig, parentAsin: "B001" };
    expect(pruefeFamilie(kollision).map((v) => v.feld)).toContain("parentAsin");
  });

  it("parentAsin ist optional (weglassbar)", () => {
    const ohneParent: FamilieKontraktInput = { variationTheme: ["flavor"], children: gueltig.children };
    expect(pruefeFamilie(ohneParent)).toEqual([]);
  });
});

describe("achsenSignatur", () => {
  it("ist reihenfolgestabil und case-insensitiv", () => {
    const a = achsenSignatur({ asin: "x", axisValues: { size: "500 g", color: "Blau" } }, ["size", "color"]);
    const b = achsenSignatur({ asin: "y", axisValues: { color: "blau", size: "500 g" } }, ["size", "color"]);
    expect(a).toBe(b);
  });

  it("unterscheidet Kombinationen, die sich nur in der Achsen-Zuordnung eines „|\"-Werts unterscheiden", () => {
    const a = achsenSignatur({ asin: "x", axisValues: { a: "x | y", b: "z" } }, ["a", "b"]);
    const b = achsenSignatur({ asin: "y", axisValues: { a: "x", b: "y | z" } }, ["a", "b"]);
    expect(a).not.toBe(b);
  });
});

describe("istKaufbar", () => {
  it("nur der Container-Parent ist nicht kaufbar; Representative-Parent/Child/Standalone schon", () => {
    expect(istKaufbar("parent", true)).toBe(false); // synthetischer Container
    expect(istKaufbar("parent", false)).toBe(true); // Representative bleibt kaufbar
    expect(istKaufbar("child", false)).toBe(true);
    expect(istKaufbar("standalone", false)).toBe(true);
  });
});
