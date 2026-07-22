import { describe, expect, it } from "vitest";
import { normalisiereInsights, normalisierePayload } from "./insights";

/**
 * D103: Der Findings-Dashboard-Crash — ein LLM-Payload ohne erzwungene
 * Struktur (fehlende Arrays, snake_case, kaputte Einträge) wurde gespeichert
 * und crashte die Seite bei `p.painPoints.map(...)`. Diese Tests decken
 * genau die Fälle, die eine echte LLM-Antwort produzieren kann.
 */

describe("normalisiereInsights", () => {
  it("fehlende Felder werden leere Arrays — nie undefined (der Crash-Fall)", () => {
    const p = normalisiereInsights({});
    expect(p.painPoints).toEqual([]);
    expect(p.buyingTriggers).toEqual([]);
    expect(p.languageToBorrow).toEqual([]);
    expect(p.languageToAvoid).toEqual([]);
    expect(normalisiereInsights(null).painPoints).toEqual([]);
    expect(normalisiereInsights("kaputt").painPoints).toEqual([]);
  });

  it("akzeptiert snake_case-Varianten (pain_points, buying_triggers, language_to_*)", () => {
    const p = normalisiereInsights({
      pain_points: [{ label: "Dichtung undicht", frequency_pct: 30, mention_count: 3, quotes: ["tropft"] }],
      buying_triggers: [{ label: "hält kalt" }],
      language_to_borrow: ["nach 24h eiskalt"],
      language_to_avoid: ["Premium"],
    });
    expect(p.painPoints).toEqual([{ label: "Dichtung undicht", frequencyPct: 30, mentionCount: 3, quotes: ["tropft"] }]);
    expect(p.buyingTriggers[0]).toMatchObject({ label: "hält kalt", frequencyPct: null, mentionCount: null, quotes: [] });
    expect(p.languageToBorrow).toEqual(["nach 24h eiskalt"]);
    expect(p.languageToAvoid).toEqual(["Premium"]);
  });

  it("kaputte Einträge fliegen raus, Zahlen-Strings werden koerziert, Quotes auf 15 gekappt (D170)", () => {
    const p = normalisiereInsights({
      painPoints: [
        { label: "", frequencyPct: 10 }, // ohne Label → raus
        null,
        { label: "zu klein", frequencyPct: "25,5", quotes: [...Array.from({ length: 16 }, (_, i) => `zitat ${i + 1}`), 5] },
      ],
    });
    expect(p.painPoints).toHaveLength(1);
    expect(p.painPoints[0]).toMatchObject({ label: "zu klein", frequencyPct: 25.5 });
    expect(p.painPoints[0].quotes).toHaveLength(15); // Basis des echten Zählwerts (D170)
    expect(p.painPoints[0].quotes[0]).toBe("zitat 1");
  });
});

describe("normalisierePayload (Lese-Schutz fürs Dashboard)", () => {
  it("sichert auch stats/sources ab — gespeicherte kaputte Zeilen rendern statt zu crashen", () => {
    const p = normalisierePayload({ painPoints: undefined, stats: undefined });
    expect(p.stats).toEqual({ reviewsTotal: 0, ratingAvg: null });
    expect(p.sources).toEqual([]);
    expect(p.painPoints).toEqual([]);
  });
});
