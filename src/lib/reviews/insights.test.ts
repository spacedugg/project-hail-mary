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

  it("behält herkunft + uebertragbarkeit durch die Verdichtung (D206) — sonst kein Strategie-Block im Text", () => {
    const p = normalisiereInsights({
      buyingTriggers: [
        {
          label: "leiser Betrieb",
          mentionCount: 7,
          herkunft: { eigene: 1, fremde: 6, jeAsin: { B01: 6, B02: 1 } },
          uebertragbarkeit: { urteil: "ja", grund: "Unsere Specs decken den geringen Geräuschpegel." },
        },
      ],
    });
    expect(p.buyingTriggers[0].herkunft).toEqual({ eigene: 1, fremde: 6, jeAsin: { B01: 6, B02: 1 } });
    expect(p.buyingTriggers[0].uebertragbarkeit).toEqual({ urteil: "ja", grund: "Unsere Specs decken den geringen Geräuschpegel." });
  });

  it("verwirft kaputtes uebertragbarkeit-urteil, statt es durchzureichen (Code erzwingt)", () => {
    const p = normalisiereInsights({
      painPoints: [{ label: "x", uebertragbarkeit: { urteil: "vielleicht" }, herkunft: {} }],
    });
    expect(p.painPoints[0].uebertragbarkeit).toBeUndefined();
    expect(p.painPoints[0].herkunft).toBeUndefined(); // leere Herkunft (kein eigene/fremde) → weg
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

describe("Zuständigkeits-Gate im Payload (D266)", () => {
  /**
   * Das Gate läuft einmal beim Speichern; die Felder müssen den Lese-Weg
   * überleben. Sonst wäre das Produkt-Feedback nach dem ersten Reload weg —
   * genau die stille Datenvernichtung, die D266 ausschließt.
   */
  it("Produkt-Feedback und ausgeschlossene Amazon-Themen überleben das Lesen", () => {
    const p = normalisierePayload({
      stats: { reviewsTotal: 182 },
      painPoints: [{ label: "wackelt bei voller Höhe", mentionCount: 9, quotes: [] }],
      buyingTriggers: [],
      produktFeedback: [
        { label: "Karton eingedrückt", typ: "painPoint", mentionCount: 3 },
        { label: "Verpackung hochwertig", typ: "buyingTrigger", mentionCount: 2 },
      ],
      ausgeschlossenAmazon: ["Versand dauerte zu lange"],
      qualitaetsNotizen: ["Zuständigkeits-Gate: 1 Thema betrifft Versand"],
    });
    expect(p.produktFeedback).toHaveLength(2);
    expect(p.produktFeedback![0]).toEqual({ label: "Karton eingedrückt", typ: "painPoint", mentionCount: 3 });
    expect(p.produktFeedback![1].typ).toBe("buyingTrigger");
    expect(p.ausgeschlossenAmazon).toEqual(["Versand dauerte zu lange"]);
    expect(p.qualitaetsNotizen).toHaveLength(1);
  });

  it("ohne die Felder bleibt der Payload unverändert gültig (Altbestand)", () => {
    const p = normalisierePayload({ stats: { reviewsTotal: 5 }, painPoints: [], buyingTriggers: [] });
    expect(p.produktFeedback).toBeUndefined();
    expect(p.ausgeschlossenAmazon).toBeUndefined();
  });

  it("kaputte Einträge fliegen, ohne zu werfen", () => {
    const p = normalisierePayload({
      produktFeedback: [null, { typ: "painPoint" }, { label: "  " }, { label: "echt", typ: "quatsch", mentionCount: "x" }],
      ausgeschlossenAmazon: [null, 42, "Versand"],
    });
    expect(p.produktFeedback).toEqual([{ label: "echt", typ: "painPoint", mentionCount: null }]);
    // `strings()` verwirft null/leer und wandelt Zahlen um — dasselbe Verhalten
    // wie bei allen anderen String-Listen des Payloads, kein Sonderfall hier.
    expect(p.ausgeschlossenAmazon).toEqual(["42", "Versand"]);
  });
});
