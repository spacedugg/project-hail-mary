import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { llmJsonLauf, QmLaufFehler } from "./qmLauf";
import { registerProvider, type LlmRequest, type LlmResponse } from "./registry";

/** QM-Lauf (D182/D183 generisch): Kontrakt-Abweisung → Korrektur → harter Fehler. */

const ENV_KEY = "RECIPE_MODEL_KEYWORDS_BRANDS";
let backup: string | undefined;

beforeAll(() => {
  backup = process.env[ENV_KEY];
  process.env[ENV_KEY] = "qmskript:test-modell";
});
afterAll(() => {
  if (backup === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = backup;
});

function providerMitAntworten(antworten: string[]) {
  const prompts: string[] = [];
  registerProvider({
    name: "qmskript",
    async generate(model: string, req: LlmRequest): Promise<LlmResponse> {
      prompts.push(req.messages.at(-1)?.content ?? "");
      const text = antworten.shift();
      if (text === undefined) throw new Error("Antwort-Queue leer.");
      return { text, model, provider: "qmskript" };
    },
  });
  return prompts;
}

const kontrakt = (parsed: Record<string, unknown>) =>
  Array.isArray(parsed.marken)
    ? { wert: parsed.marken as unknown[] }
    : { verstoesse: ["Feld „marken“ fehlt oder ist kein Array — auch eine leere Liste als Array liefern."] };

describe("llmJsonLauf", () => {
  it("kaputtes JSON und Kontrakt-Verstoß werden mit Korrektur-Auftrag wiederholt, dann Erfolg", async () => {
    const prompts = providerMitAntworten([
      "gar kein json",
      '{"falschesFeld": true}',
      '{"marken": [{"keyword": "nuk schnuller", "marke": "NUK"}]}',
    ]);
    const wert = await llmJsonLauf({ recipeKey: "keywords.brands", prompt: "PROMPT", kontrakt });
    expect(wert).toHaveLength(1);
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain("KORREKTUR-AUFTRAG");
    expect(prompts[2]).toContain("marken");
  });

  it("nach maxVersuche ohne kontrakt-konformes Ergebnis: harter QmLaufFehler mit Verstößen", async () => {
    providerMitAntworten(['{"x":1}', '{"x":2}', '{"x":3}']);
    try {
      await llmJsonLauf({ recipeKey: "keywords.brands", prompt: "PROMPT", kontrakt });
      expect.unreachable("QM-Lauf hätte hart scheitern müssen");
    } catch (e) {
      expect(e).toBeInstanceOf(QmLaufFehler);
      expect((e as QmLaufFehler).verstoesse[0]).toContain("marken");
      expect((e as QmLaufFehler).versuche).toBe(3);
    }
  });

  it("erste saubere Antwort geht ohne Wiederholung durch", async () => {
    const prompts = providerMitAntworten(['{"marken": []}']);
    const wert = await llmJsonLauf({ recipeKey: "keywords.brands", prompt: "PROMPT", kontrakt });
    expect(wert).toEqual([]);
    expect(prompts).toHaveLength(1);
  });
});
