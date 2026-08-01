import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { analysiereWettbewerbsTexte } from "./wettbewerbsTexte";
import { registerProvider, type LlmRequest, type LlmResponse } from "@/lib/llm/registry";
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


/**
 * Wettbewerber-Bilder im Abgleich (D276, Nutzer-Vorgabe 01.08.2026: „ein 100 %
 * volles Bild über den Zustand der Konkurrenz-Listings und die Informationen,
 * die diese kommunizieren").
 *
 * Der Text-Scrape sieht Infografiken nicht. Steht die halbe Argumentation der
 * Konkurrenz im Bild (Vergleichstabelle, Mengenangabe, Anwendungsschritte), war
 * die Informationslücke vorher systematisch zu klein gemessen. Diese Tests
 * halten fest, dass die ausgelesenen Bildinhalte wirklich im Prompt landen —
 * und als Bild gekennzeichnet sind, nicht als Listing-Text.
 */
describe("Wettbewerber-Bildinhalte fließen in den Abgleich (D276)", () => {
  const mitBildern: WettbewerbsTexteKontext = {
    ...ctx,
    wettbewerber: [
      {
        ...ctx.wettbewerber[0],
        bilder: [
          { slot: 2, inhalt: "Infografik mit Dosierungstabelle", textImBild: ["10 kg = 2 Drops"], claims: ["Dosierung nach Gewicht"] },
        ],
      },
    ],
  };

  /** Fängt den Prompt ab, statt die Antwort zu prüfen — der Prompt IST hier das Ergebnis. */
  function promptSpion(): { gesehen: () => string } {
    let letzter = "";
    registerProvider({
      name: "wbskript",
      async generate(model: string, req: LlmRequest): Promise<LlmResponse> {
        letzter = req.messages.map((m) => m.content).join("\n");
        return { text: JSON.stringify({ gaps: [] }), model, provider: "wbskript" };
      },
    });
    return { gesehen: () => letzter };
  }

  it("Bildinhalt, Text-im-Bild und Claims stehen im Prompt", async () => {
    const spion = promptSpion();
    await analysiereWettbewerbsTexte(mitBildern);
    const p = spion.gesehen();
    expect(p).toContain("Infografik mit Dosierungstabelle");
    expect(p).toContain("10 kg = 2 Drops");
    expect(p).toContain("Dosierung nach Gewicht");
  });

  it("Bildaussagen sind als Bild gekennzeichnet, nicht als Listing-Text", async () => {
    const spion = promptSpion();
    await analysiereWettbewerbsTexte(mitBildern);
    expect(spion.gesehen()).toContain("KEIN Listing-Text");
  });

  it("ohne ausgelesene Bilder bleibt der Prompt unverändert schlank", async () => {
    const spion = promptSpion();
    await analysiereWettbewerbsTexte(ctx);
    expect(spion.gesehen()).not.toContain("Bildinhalte");
  });
});
