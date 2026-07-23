import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { analysiereWettbewerbsTexte } from "./wettbewerbsTexte";
import { registerProvider, type LlmResponse } from "@/lib/llm/registry";
import type { WettbewerbsTexteKontext } from "./wettbewerbsTexte";

/** Wettbewerber-Listing-Abgleich (D199): Widerspruch-Lücken fliegen, ASIN-Attribution wird bereinigt. */

const KEY = "RECIPE_MODEL_REVIEWS_WETTBEWERB_TEXTE";
let backup: string | undefined;
beforeAll(() => { backup = process.env[KEY]; process.env[KEY] = "wbskript:test"; });
afterAll(() => { if (backup === undefined) delete process.env[KEY]; else process.env[KEY] = backup; });

const ctx: WettbewerbsTexteKontext = {
  produktName: "Ulmenrinde-Drops für Hunde",
  facts: { productType: "Drops", materials: ["Ulmenrinde", "Heilerde"], usps: ["gegen Sodbrennen"] },
  eigenesListing: { title: "Ulmenrinde-Drops für Hunde", bullets: ["Mit Heilerde"], description: null },
  wettbewerber: [
    { asin: "B0KONK00001", title: "Konkurrenz-Paste", bullets: ["tierärztlich empfohlen", "auch für Katzen"], description: null, attributes: null },
  ],
};

function provider(antwort: string) {
  registerProvider({
    name: "wbskript",
    async generate(model: string): Promise<LlmResponse> {
      return { text: antwort, model, provider: "wbskript" };
    },
  });
}

describe("analysiereWettbewerbsTexte", () => {
  it("verwirft nein-Lücken (Widerspruch), behält ja/unbekannt, bereinigt Fremd-ASINs", async () => {
    provider(JSON.stringify({
      gaps: [
        { info: "tierärztlich empfohlen", quellen: ["B0KONK00001"], urteil: "ja", grund: "Produkt-Wahrheit nennt tierärztliche Entwicklung" },
        { info: "auch für Katzen geeignet", quellen: ["B0KONK00001"], urteil: "nein", grund: "unser Produkt ist laut Wahrheit nur für Hunde" },
        { info: "angenehmer Geruch", quellen: ["B0KONK00001", "B0FREMD9999"], urteil: "unbekannt", grund: "keine Angabe in der Produkt-Wahrheit" },
      ],
    }));
    const { gaps } = await analysiereWettbewerbsTexte(ctx);
    // nein ist raus
    expect(gaps.map((g) => g.urteil)).not.toContain("nein");
    expect(gaps.map((g) => g.info)).toEqual(["tierärztlich empfohlen", "angenehmer Geruch"]);
    // erfundene Fremd-ASIN wurde aus den Quellen gefiltert
    expect(gaps.find((g) => g.info === "angenehmer Geruch")!.quellen).toEqual(["B0KONK00001"]);
  });

  it("ohne Wettbewerber-Listings ehrlich leer", async () => {
    const { gaps } = await analysiereWettbewerbsTexte({ ...ctx, wettbewerber: [] });
    expect(gaps).toEqual([]);
  });
});
