import { describe, it, expect, beforeAll } from "vitest";
import { generateSection, sectionPrompt, einseitigeAspekte, QmBlockFehler, SECTION_ORDER, type RecipeInputs } from "./listing";

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

  it("Quintessenz erreicht den Prompt: Kern-These, Erkenntnisse, Conversion-Blocker (D194)", () => {
    const prompt = sectionPrompt("bullets", {
      ...inputs,
      reviewInsights: {
        sources: [], stats: { reviewsTotal: 50, ratingAvg: 4.2 },
        painPoints: [{ label: "Dichtung undicht", frequencyPct: null, mentionCount: null, quotes: [] }],
        buyingTriggers: [{ label: "hält wirklich kalt", frequencyPct: null, mentionCount: null, quotes: [] }],
        languageToBorrow: [], languageToAvoid: [],
        kernThese: "Käufer lieben die Isolierung, fürchten aber Undichtigkeit.",
        insightCards: [{ titel: "Dichtheit ist die Kauf-Hürde", beschreibung: "Viele zögern wegen Berichten über undichte Deckel.", relevanz: 5, quellen: [], bildIdeen: [], belegAspekte: [] }],
      },
      conversionBlocker: [{ titel: "Spülmaschinen-Frage unbeantwortet", beschreibung: "Kunden fragen nach Reinigung, das Listing schweigt." }],
    });
    expect(prompt).toContain("KERN-THESE DER BEWERTUNGS-ANALYSE");
    expect(prompt).toContain("Dichtheit ist die Kauf-Hürde");
    expect(prompt).toContain("CONVERSION-BLOCKER");
    expect(prompt).toContain("Spülmaschinen-Frage unbeantwortet");
  });

  it("erkannte Fremdmarken erreichen das Gate — Marke im Text BLOCKT den Entwurf hart (D97 + D182)", async () => {
    try {
      await generateSection("title", {
        ...inputs,
        // Template-Titel = Marke + Hauptkeyword → „Hydro Flask" landet im Text
        keywords: { ...inputs.keywords, primary: ["Hydro Flask Trinkflasche"] },
        competitorBrands: ["Hydro Flask"],
      });
      expect.unreachable("QM-Gate hätte blocken müssen (D182: kein Entwurf mit Error-Findings)");
    } catch (e) {
      expect(e).toBeInstanceOf(QmBlockFehler);
      expect((e as QmBlockFehler).issues.map((i) => i.rule)).toContain("title.competitor-brand");
    }
  });
});

describe("Ein-Seiten-Zuordnung + strategische Blöcke (D196)", () => {
  const aspekt = (label: string, eigene: number, fremde: number, urteil?: "ja" | "nein" | "unbekannt") => ({
    label, frequencyPct: null, mentionCount: eigene + fremde, quotes: [],
    herkunft: { eigene, fremde, jeAsin: {} },
    ...(urteil ? { uebertragbarkeit: { urteil, grund: "Spezifikations-Vergleich" } } : {}),
  });

  it("geteilte Themen landen nur auf ihrer Mehrheits-Seite (Zählwert entscheidet)", () => {
    const ri = {
      sources: [], stats: { reviewsTotal: 100, ratingAvg: 4 },
      painPoints: [aspekt("wirkt nicht", 3, 0)],
      buyingTriggers: [aspekt("wirkt zuverlässig", 12, 0)],
      languageToBorrow: [], languageToAvoid: [],
      insightCards: [{
        titel: "Wirkung überzeugt die Mehrheit", beschreibung: "", relevanz: 5, quellen: [], bildIdeen: [],
        belegAspekte: [
          { label: "wirkt zuverlässig", typ: "buyingTrigger" as const, mentionCount: 12 },
          { label: "wirkt nicht", typ: "painPoint" as const, mentionCount: 3 },
        ],
      }],
    };
    const seiten = einseitigeAspekte(ri);
    expect(seiten.buyingTriggers.map((a) => a.label)).toContain("wirkt zuverlässig");
    expect(seiten.painPoints.map((a) => a.label)).not.toContain("wirkt nicht");
  });

  it("Herkunft × Übertragbarkeit steuert die Prompt-Blöcke (Kern-Content, fehlender Kern-Content, Angriffs-Lücke)", () => {
    const prompt = sectionPrompt("bullets", {
      ...inputs,
      reviewInsights: {
        sources: [], stats: { reviewsTotal: 200, ratingAvg: 4.3 },
        painPoints: [
          aspekt("Deckel undicht", 6, 1),
          aspekt("Tablette zu groß zum Schlucken", 0, 9, "nein"),
        ],
        buyingTriggers: [
          aspekt("hält lange kalt", 8, 2),
          aspekt("angenehmer Kräuterduft", 1, 7, "ja"),
          aspekt("hübsche Geschenkbox", 0, 5, "nein"),
        ],
        languageToBorrow: [], languageToAvoid: [],
      },
    });
    expect(prompt).toContain("KAUFAUSLÖSER EIGENER KUNDEN");
    expect(prompt).toContain("hält lange kalt");
    expect(prompt).toContain("ÜBERTRAGBARE WETTBEWERBS-KAUFAUSLÖSER");
    expect(prompt).toContain("angenehmer Kräuterduft");
    expect(prompt).toContain("ANGRIFFS-LÜCKEN");
    expect(prompt).toContain("Tablette zu groß zum Schlucken");
    // nicht übertragbarer Wettbewerbs-Kaufauslöser wird weggelassen
    expect(prompt).not.toContain("hübsche Geschenkbox");
  });
});

describe("Übertragbare Wettbewerber-Informationen im Prompt (D199)", () => {
  it("ja + unbekannt fließen in den Content-Prompt; 'prüfen' markiert die unklaren", () => {
    const prompt = sectionPrompt("bullets", {
      ...inputs,
      wettbewerbsInfos: [
        { info: "tierärztlich entwickelt", urteil: "ja", grund: "Produkt-Wahrheit deckt es" },
        { info: "angenehmer Geruch", urteil: "unbekannt", grund: "keine Angabe" },
      ],
    });
    expect(prompt).toContain("ÜBERTRAGBARE WETTBEWERBER-INFORMATIONEN");
    expect(prompt).toContain("tierärztlich entwickelt");
    expect(prompt).toContain("angenehmer Geruch (prüfen)");
    expect(prompt).toContain("NUR mit UNSEREN belegten Angaben");
  });
});
