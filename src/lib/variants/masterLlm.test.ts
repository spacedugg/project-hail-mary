import { describe, it, expect, beforeAll } from "vitest";
import { istMockRecipe, klassifiziereSlots, regeneriereSlot } from "./masterLlm";
import type { MasterSlot } from "./master";

/**
 * Mock-Fallback der LLM-Nahtstellen (D221). Ohne Key/erzwungen liefert der Mock
 * das ehrliche, deterministische Minimum — er rät NICHT, was ein LLM täte.
 */

beforeAll(() => {
  process.env.LLM_FORCE_MOCK = "1"; // deterministisch, unabhängig von der Umgebung
});

describe("masterLlm — Mock-Fallback", () => {
  it("erkennt Mock-Modus", () => {
    expect(istMockRecipe("variants.klassifikator")).toBe(true);
    expect(istMockRecipe("variants.regenerator")).toBe(true);
  });

  it("Klassifikator schlägt im Mock nichts vor und meldet mock:true", async () => {
    const slots: MasterSlot[] = [{ id: "b1", quelle: "bullet", index: 1, kind: "locked", template: "Zuckerfrei.", achsen: [] }];
    const res = await klassifiziereSlots(slots, ["flavor"], { flavor: "Erdbeere" });
    expect(res).toEqual({ regenerateIds: [], mock: true });
  });

  it("Regenerator füllt im Mock deterministisch die Token", async () => {
    const slot: MasterSlot = { id: "b2", quelle: "bullet", index: 2, kind: "regenerate", template: "Fruchtiger {{flavor}}-Genuss.", achsen: ["flavor"] };
    expect(await regeneriereSlot(slot, { flavor: "Kiwi" })).toBe("Fruchtiger Kiwi-Genuss.");
  });
});
