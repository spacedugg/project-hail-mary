import { describe, expect, it } from "vitest";
import { BILD_TYPEN, BILD_TYP_LABELS, istBildTyp, typVerteilung, type BildTyp } from "./bildTypen";

/** D209: Bildtypen sind eine Klassifikations-Sprache, keine Regel/Mindestmenge. */
describe("bildTypen", () => {
  it("hat für jeden Typ ein Label", () => {
    for (const t of BILD_TYPEN) expect(BILD_TYP_LABELS[t]).toBeTruthy();
    expect(BILD_TYPEN).toContain("main_image");
    expect(BILD_TYPEN).toHaveLength(7);
  });

  it("istBildTyp akzeptiert nur bekannte Typen", () => {
    expect(istBildTyp("lifestyle_in_use")).toBe(true);
    expect(istBildTyp("phantasie")).toBe(false);
    expect(istBildTyp(null)).toBe(false);
  });

  it("typVerteilung zählt belegte Typen in stabiler Reihenfolge, ignoriert Leeres", () => {
    const typen: Array<BildTyp | null> = ["feature_highlight", "main_image", "feature_highlight", null, "lifestyle_in_use"];
    expect(typVerteilung(typen)).toEqual([
      { typ: "main_image", anzahl: 1 },
      { typ: "feature_highlight", anzahl: 2 },
      { typ: "lifestyle_in_use", anzahl: 1 },
    ]);
    expect(typVerteilung([])).toEqual([]);
  });

  it("mehrere Main-Image-Varianten sind mehrere main_image-Einträge (zählen als 1 Slot regelt der Aufrufer)", () => {
    // Reine Zählung; die Slot-Semantik (Varianten = 1 Slot) liegt bewusst NICHT hier.
    expect(typVerteilung(["main_image", "main_image"])).toEqual([{ typ: "main_image", anzahl: 2 }]);
  });
});
