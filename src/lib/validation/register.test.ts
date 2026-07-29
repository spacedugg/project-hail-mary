import { describe, it, expect } from "vitest";
import { REGELN, regelnFuerSektion, pruefRegelnFuerSektion, regelnAlsPromptBlock } from "./register";

/**
 * Verbindlichkeits-Nachweis (D180/D181): Eine Regel existiert nur, wenn sie
 * (a) im Register steht, (b) in den Generierungs-Prompt fließt und (c) geprüft wird.
 * Diese Tests halten genau diese Kette fest — nicht die Formulierung einer Regel.
 */

describe("Regel-Register: Wirksamkeits-Kette", () => {
  it("jede Regel hat eine nicht-leere id und einen Regeltext", () => {
    for (const r of REGELN) {
      expect(r.id.trim()).not.toBe("");
      expect(r.text.trim().length).toBeGreaterThan(20);
    }
  });

  it("Regel-IDs sind eindeutig", () => {
    const ids = REGELN.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("jede llm-Regel einer Sektion landet im Prompt UND beim Prüfer", () => {
    for (const sektion of ["title", "bullets", "highlights", "description", "qa"] as const) {
      const block = regelnAlsPromptBlock(sektion);
      for (const r of regelnFuerSektion(sektion)) expect(block).toContain(r.id);
      // Prüfer bekommt genau die llm-Regeln der Sektion
      const prueferIds = pruefRegelnFuerSektion(sektion).map((r) => r.id);
      for (const r of regelnFuerSektion(sektion).filter((x) => x.art === "llm")) expect(prueferIds).toContain(r.id);
    }
  });

  it("Kollokations-Regel (D251) ist für alle Textsektionen scharf", () => {
    const regel = REGELN.find((r) => r.id === "sprache.kollokation");
    expect(regel).toBeTruthy();
    expect(regel!.severity).toBe("error"); // blockt, wird nicht nur gewarnt
    expect(regel!.art).toBe("llm"); // semantisch — nicht deterministisch prüfbar
    for (const sektion of ["title", "bullets", "highlights", "description", "qa"] as const)
      expect(pruefRegelnFuerSektion(sektion).map((r) => r.id)).toContain("sprache.kollokation");
    // Backend ist eine Wortliste, keine Sätze → dort bewusst NICHT geprüft
    expect(pruefRegelnFuerSektion("backend").map((r) => r.id)).not.toContain("sprache.kollokation");
  });

  it("familie-Regeln sind deterministisch und stehen NICHT in den Content-Prompts", () => {
    for (const r of regelnFuerSektion("familie")) expect(r.art).toBe("deterministisch");
    for (const sektion of ["title", "bullets", "description"] as const)
      expect(regelnAlsPromptBlock(sektion)).not.toContain("familie.");
  });
});
