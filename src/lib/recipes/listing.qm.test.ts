import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateSection, QmBlockFehler, type RecipeInputs } from "./listing";
import { registerProvider, type LlmRequest, type LlmResponse } from "@/lib/llm/registry";
import { pruefRegelnFuerSektion } from "@/lib/validation/register";

/**
 * QM-Schleife (D182/D183) mit skriptbarem Provider: Kontrakt-Abweisung,
 * Korrektur-Prompt mit Findings, Immer-LLM-Prüfer, harter Block.
 */

const ENV_KEYS = ["LLM_FORCE_MOCK", "RECIPE_MODEL_LISTING_TITLE", "RECIPE_MODEL_LISTING_PRUEFER"] as const;
const envBackup: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const k of ENV_KEYS) envBackup[k] = process.env[k];
  delete process.env.LLM_FORCE_MOCK;
  process.env.RECIPE_MODEL_LISTING_TITLE = "skript:test-modell";
  process.env.RECIPE_MODEL_LISTING_PRUEFER = "skript:test-modell";
});
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
});

const inputs: RecipeInputs = {
  brand: "AquaNova",
  productName: "Edelstahl-Trinkflasche 750 ml",
  marketplace: "de",
  facts: { productType: "Trinkflasche", usps: ["hält 24 h kalt"], dimensions: "750 ml" },
  keywords: { primary: ["Edelstahl-Trinkflasche"], secondary: ["Isolierflasche"], tertiary: [], backendPool: [] },
  reviewInsights: null,
};

const GUTER_TITEL = "AquaNova Edelstahl-Trinkflasche 750 ml, auslaufsicher, isoliert, BPA-frei";
const gueltig = JSON.stringify({
  title: GUTER_TITEL,
  rationale: [{ part: "Edelstahl-Trinkflasche", source: "Hauptkeyword aus Keyword-Analyse" }],
});

/** Prüfprotokoll: alle Titel-Regeln bestanden — außer den explizit verletzten. */
function prueferAntwort(verletzt: Record<string, string> = {}): string {
  const verdikte = pruefRegelnFuerSektion("title").map((r) => ({
    regel: r.id,
    bestanden: !(r.id in verletzt),
    beleg: verletzt[r.id] ?? "regelkonform",
  }));
  return JSON.stringify({ verdikte });
}

/** Skriptbarer Provider: Generierungs-Antworten aus der Queue, Prüfer separat. */
function skriptProvider(genAntworten: string[], prueferAntworten: string[]) {
  const genPrompts: string[] = [];
  let prueferCalls = 0;
  registerProvider({
    name: "skript",
    async generate(model: string, req: LlmRequest): Promise<LlmResponse> {
      const istPruefer = (req.system ?? "").includes("Qualitäts-Prüfer");
      if (istPruefer) {
        prueferCalls++;
        return { text: prueferAntworten.shift() ?? prueferAntwort(), model, provider: "skript" };
      }
      genPrompts.push(req.messages.at(-1)?.content ?? "");
      const text = genAntworten.shift();
      if (text === undefined) throw new Error("Skript-Queue leer — mehr Generier-Calls als erwartet.");
      return { text, model, provider: "skript" };
    },
  });
  return { genPrompts, prueferCallCount: () => prueferCalls };
}

describe("QM-Schleife (D182/D183)", () => {
  it("Kontrakt-Verstoß wird abgewiesen → Korrektur-Prompt trägt die Findings → 2. Versuch besteht", async () => {
    const ohneRationale = JSON.stringify({ title: GUTER_TITEL });
    const { genPrompts, prueferCallCount } = skriptProvider([ohneRationale, gueltig], [prueferAntwort()]);

    const res = await generateSection("title", inputs);
    expect(res.payload.text).toBe(GUTER_TITEL);
    expect(genPrompts).toHaveLength(2);
    // GESETZE aus dem Regel-Register stehen im Prompt (D181: eine Quelle)
    expect(genPrompts[0]).toContain("GESETZE");
    expect(genPrompts[0]).toContain("[sprache.keyword-natuerlich]");
    // Der 2. Versuch bekommt den konkreten Kontrakt-Verstoß als Korrektur-Auftrag
    expect(genPrompts[1]).toContain("KORREKTUR-AUFTRAG");
    expect(genPrompts[1]).toContain("rationale");
    // Immer-LLM-Prüfer: das finale Ergebnis wurde geprüft
    expect(prueferCallCount()).toBe(1);
  });

  it("bleibende Regelverstöße blocken hart nach 3 Versuchen — kein Ergebnis, voller Prüfbericht (D182)", async () => {
    const zuLang = JSON.stringify({
      title: "AquaNova Edelstahl-Trinkflasche 750 ml, auslaufsicher, doppelwandig isoliert, BPA-frei und spülmaschinenfest",
      rationale: [{ part: "Titel", source: "Test" }],
    });
    const { genPrompts, prueferCallCount } = skriptProvider([zuLang, zuLang, zuLang], []);

    try {
      await generateSection("title", inputs);
      expect.unreachable("QM-Gate hätte blocken müssen");
    } catch (e) {
      expect(e).toBeInstanceOf(QmBlockFehler);
      expect((e as QmBlockFehler).issues.map((i) => i.rule)).toContain("title.max-length");
      expect((e as QmBlockFehler).versuche).toBe(3);
    }
    expect(genPrompts).toHaveLength(3);
    // Deterministisch durchgefallen → kein Prüfer-Call verschwendet; ein
    // sichtbares Ergebnis gibt es nur MIT bestandener Prüfung.
    expect(prueferCallCount()).toBe(0);
  });

  it("Prüfer-Verdikt (verletzt) erzwingt Regenerierung mit Beleg im Korrektur-Prompt", async () => {
    const beleg = "Die Suchphrase ‚edelstahl trinkflasche' ist als rohe Suchphrase eingeklebt.";
    const { genPrompts, prueferCallCount } = skriptProvider(
      [gueltig, gueltig],
      [prueferAntwort({ "sprache.keyword-natuerlich": beleg }), prueferAntwort()],
    );

    const res = await generateSection("title", inputs);
    expect(res.payload.text).toBe(GUTER_TITEL);
    expect(genPrompts).toHaveLength(2);
    expect(genPrompts[1]).toContain("KORREKTUR-AUFTRAG");
    expect(genPrompts[1]).toContain("sprache.keyword-natuerlich");
    expect(genPrompts[1]).toContain("rohe Suchphrase");
    expect(prueferCallCount()).toBe(2);
  });

  it("unvollständiges Prüfprotokoll gilt als ungeprüft = Fehler (kein stilles Loch im Gate)", async () => {
    // Prüfer lässt alle Regeln bis auf eine aus → fehlende Verdikte = Errors → Block nach 3 Versuchen
    const halbesProtokoll = JSON.stringify({ verdikte: [{ regel: "title.lesbarkeit", bestanden: true, beleg: "ok" }] });
    skriptProvider([gueltig, gueltig, gueltig], [halbesProtokoll, halbesProtokoll, halbesProtokoll]);

    try {
      await generateSection("title", inputs);
      expect.unreachable("QM-Gate hätte blocken müssen");
    } catch (e) {
      expect(e).toBeInstanceOf(QmBlockFehler);
      expect((e as QmBlockFehler).issues.some((i) => i.message.includes("nicht beurteilt"))).toBe(true);
    }
  });
});
