import { describe, it, expect, beforeAll } from "vitest";
import { generateSection, sectionPrompt, SECTION_ORDER, type RecipeInputs } from "./listing";

/**
 * Recipe-Pipeline im Mock-Modus (LLM_FORCE_MOCK): deterministischer Template-Pfad.
 * Prüft, dass die Pipeline läuft, Byte-Limits deterministisch erzwungen werden
 * und das Gate angeschlossen ist.
 */

beforeAll(() => {
  process.env.LLM_FORCE_MOCK = "1";
});

const inputs: RecipeInputs = {
  brand: "AquaNova",
  productName: "Edelstahl-Trinkflasche 750 ml",
  marketplace: "de",
  facts: {
    productType: "Trinkflasche",
    materials: ["18/8-Edelstahl", "Silikondichtung"],
    dimensions: "750 ml, 7,3 cm Durchmesser",
    usps: ["hält 24 h kalt", "auslaufsicher", "BPA-frei"],
    targetAudience: "Sport und Büro",
  },
  keywords: {
    primary: ["Edelstahl-Trinkflasche", "Thermosflasche"],
    secondary: ["Isolierflasche", "Sportflasche", "Wasserflasche", "Outdoor Flasche", "Fahrradflasche"],
    tertiary: ["kohlensäure geeignet", "spülmaschinenfest"],
    backendPool: Array.from({ length: 80 }, (_, i) => `keywordvariante${i} mitumlautäöü${i}`),
  },
  reviewInsights: null,
};

describe("listing recipes (mock)", () => {
  it("alle Sektionen liefern Payloads", async () => {
    for (const section of SECTION_ORDER) {
      const res = await generateSection(section, inputs);
      expect(res.provider).toBe("mock");
      if (section === "bullets") expect(res.payload.items).toHaveLength(5);
      else if (section === "qa") expect(res.payload.pairs).toHaveLength(5);
      else expect((res.payload.text ?? "").length).toBeGreaterThan(0);
      // Begründungs-Pflicht: jede Sektion liefert eine Rationale
      expect((res.payload.rationale ?? []).length).toBeGreaterThan(0);
    }
  });

  it("Backend wird deterministisch auf 249 Bytes getrimmt — auch bei riesigem Pool", async () => {
    const res = await generateSection("backend", inputs);
    const bytes = new TextEncoder().encode(res.payload.text!).length;
    expect(bytes).toBeLessThanOrEqual(249);
    expect(res.issues.filter((i) => i.rule === "backend.max-bytes")).toEqual([]);
    // Satzzeichen werden deterministisch entfernt (Blog 07/2026: Amazon ignoriert sie)
    expect(res.payload.text).not.toMatch(/[,;.!?:]/);
  });

  it("Titel enthält Hauptkeyword im Mobile-Fenster", async () => {
    const res = await generateSection("title", inputs);
    expect(res.issues.map((i) => i.rule)).not.toContain("title.keyword-window");
  });

  it("Validation-Report ist an jede Sektion angehängt (Gate ist Pflicht, kein Opt-in)", async () => {
    const res = await generateSection("bullets", inputs);
    expect(Array.isArray(res.issues)).toBe(true);
  });

  it("Listing-IST + Zusatz-Infos erreichen den Prompt; ohne Analyse steht der Erfindungs-Verbots-Hinweis (D108)", () => {
    const prompt = sectionPrompt("bullets", {
      ...inputs,
      reviewInsights: null,
      listingIst: { title: "Alter Titel", bullets: ["alter bullet eins"] },
      zusatzKontext: "Vorbild: Konkurrenz-Bullet über Isolierung",
    });
    expect(prompt).toContain("AKTUELLES LISTING (IST-Zustand");
    expect(prompt).toContain("Alter Titel");
    expect(prompt).toContain("ZUSATZ-INFOS VOM TEAM");
    expect(prompt).toContain("Vorbild: Konkurrenz-Bullet über Isolierung");
    expect(prompt).toContain("KEINE Bewertungs-Analyse");
    // Mit Analyse verschwindet der Hinweis
    const mitAnalyse = sectionPrompt("bullets", {
      ...inputs,
      reviewInsights: { sources: [], stats: { reviewsTotal: 10, ratingAvg: 4.5 }, painPoints: [], buyingTriggers: [], languageToBorrow: [], languageToAvoid: [] },
    });
    expect(mitAnalyse).not.toContain("KEINE Bewertungs-Analyse");
  });

  it("erkannte Fremdmarken erreichen das Gate — Marke im Text wird als Fehler geflaggt (D97)", async () => {
    const res = await generateSection("title", {
      ...inputs,
      // Template-Titel = Marke + Hauptkeyword → „Hydro Flask" landet im Text
      keywords: { ...inputs.keywords, primary: ["Hydro Flask Trinkflasche"] },
      competitorBrands: ["Hydro Flask"],
    });
    expect(res.issues.map((i) => i.rule)).toContain("title.competitor-brand");
  });
});
