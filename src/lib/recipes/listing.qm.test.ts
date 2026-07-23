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

/** Prüfprotokoll: alle Regeln der Sektion bestanden — außer den explizit verletzten. */
function prueferAntwort(verletzt: Record<string, string> = {}, sektion: "title" | "bullets" = "title"): string {
  const verdikte = pruefRegelnFuerSektion(sektion).map((r) => ({
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

  it("unvollständiges Prüfprotokoll wird beim PRÜFER nachgefordert — nie als Autor-Finding (D193)", async () => {
    // Prüfer lässt Regeln aus → 3 Nachforderungen beim Prüfer → harter Prüfer-Fehler,
    // KEIN QmBlock (der Autor kann ein Prüfer-Versäumnis nicht beheben).
    const halbesProtokoll = JSON.stringify({ verdikte: [{ regel: "title.lesbarkeit", bestanden: true, beleg: "ok" }] });
    const { genPrompts, prueferCallCount } = skriptProvider([gueltig], [halbesProtokoll, halbesProtokoll, halbesProtokoll]);

    try {
      await generateSection("title", inputs);
      expect.unreachable("Prüfer-Ausfall hätte hart scheitern müssen");
    } catch (e) {
      expect(e).not.toBeInstanceOf(QmBlockFehler);
      expect(String((e as Error).message)).toContain("unbeurteilt");
    }
    // Der Autor wurde NICHT erneut generiert — das Problem lag beim Prüfer
    expect(genPrompts).toHaveLength(1);
    expect(prueferCallCount()).toBe(3);
  });
});

describe("Bullet-weise Korrektur (D194)", () => {
  it("regelkonforme Bullets werden gesperrt und vom Code erzwungen übernommen — kein Neuwürfeln", async () => {
    const gut = (h: string, body: string) => `${h}: ${body}`;
    const ersteBullets = [
      gut("HÄLT DEN MAGEN RUHIG", "Heilerde und Fenchel beruhigen den Magen im Alltag zuverlässig und sanft."),
      "kaputte zeile ohne headline und ohne doppelpunkt",
      gut("EINFACHE ANWENDUNG IM ALLTAG", "Einfach als Snack reichen oder unters Futter mischen, ganz ohne Aufwand."),
      gut("GUTE AKZEPTANZ BEIM HUND", "Der Kräuterduft sorgt für gute Akzeptanz auch bei wählerischen Tieren."),
      gut("EHRLICHER LIEFERUMFANG", "Eine Dose reicht für mehrere Wochen, Erwartungen werden ehrlich benannt."),
    ];
    const reparierterBullet = gut("SCHNELLE HILFE IM ALLTAG", "Wirkt zuverlässig und wird gern genommen, ganz ohne künstliche Zusätze.");
    // Versuch 2: das Modell „würfelt" ALLE fünf neu — der Code muss 1, 3, 4, 5 zurückzwingen
    const gewuerfelt = [
      gut("KOMPLETT NEU GEWÜRFELT EINS", "Dieser Inhalt darf nicht übernommen werden, Bullet eins war freigegeben."),
      reparierterBullet,
      gut("KOMPLETT NEU GEWÜRFELT DREI", "Dieser Inhalt darf nicht übernommen werden, Bullet drei war freigegeben."),
      gut("KOMPLETT NEU GEWÜRFELT VIER", "Dieser Inhalt darf nicht übernommen werden, Bullet vier war freigegeben."),
      gut("KOMPLETT NEU GEWÜRFELT FÜNF", "Dieser Inhalt darf nicht übernommen werden, Bullet fünf war freigegeben."),
    ];
    const rationale = [{ part: "Slots", source: "Test" }];
    const { genPrompts, prueferCallCount } = skriptProvider(
      [JSON.stringify({ bullets: ersteBullets, rationale }), JSON.stringify({ bullets: gewuerfelt, rationale })],
      [prueferAntwort({}, "bullets")],
    );
    // Env-Override für die Bullets-Recipes auf den Skript-Provider
    process.env.RECIPE_MODEL_LISTING_BULLETS = "skript:test-modell";
    try {
      const res = await generateSection("bullets", inputs);
      // Gesperrte Bullets wörtlich erhalten, nur Bullet 2 ist neu
      expect(res.payload.items![0]).toBe(ersteBullets[0]);
      expect(res.payload.items![1]).toBe(reparierterBullet);
      expect(res.payload.items![2]).toBe(ersteBullets[2]);
      expect(res.payload.items![3]).toBe(ersteBullets[3]);
      expect(res.payload.items![4]).toBe(ersteBullets[4]);
      // Der Korrektur-Auftrag markiert Sperren und Baustelle
      expect(genPrompts[1]).toContain("FREIGEGEBEN — wörtlich unverändert übernehmen");
      expect(genPrompts[1]).toContain("NEU SCHREIBEN");
      expect(prueferCallCount()).toBe(1);
    } finally {
      delete process.env.RECIPE_MODEL_LISTING_BULLETS;
    }
  });
});
