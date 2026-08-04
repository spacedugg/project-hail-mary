import { describe, it, expect, beforeAll } from "vitest";
import { generateSection, sectionPrompt, prueferKontext, einseitigeAspekte, QmBlockFehler, SECTION_ORDER, type RecipeInputs } from "./listing";

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
  it("Backend-Keywords werden VOR der Beschreibung generiert (D204)", () => {
    expect(SECTION_ORDER.indexOf("backend")).toBeLessThan(SECTION_ORDER.indexOf("description"));
  });
  it("Feature-Ranking fließt in den Bullet-Prompt (D205)", () => {
    const mitFeatures: RecipeInputs = {
      ...inputs,
      featureRanking: [
        { titel: "Auslaufsicher bei Kohlensäure", beschreibung: "Dichtet auch Sprudel sicher ab.", relevanz: 5, kundenEcho: true },
        { titel: "Pulverbeschichtete Oberfläche", beschreibung: "Griffig, ohne Fingerabdrücke.", relevanz: 1, kundenEcho: false },
      ],
    };
    const prompt = sectionPrompt("bullets", mitFeatures);
    expect(prompt).toContain("FEATURE-RANKING");
    expect(prompt).toContain("Auslaufsicher bei Kohlensäure");
    // Feature ohne Kunden-Echo landet im nachrangigen Block, nicht im Kern
    expect(prompt).toContain("OHNE KUNDEN-ECHO");
  });
  /**
   * D285 (Nutzer-Befund 04.08.2026): Die Kaufgründe waren die einzige
   * Analyse-Stufe ohne Draht in die Generierung — Bullet 1 eröffnete deshalb mit
   * einem Zusatz-Feature statt mit dem Haupt-Nutzen.
   */
  it("Kern-Kaufgründe fließen in den Bullet-Prompt und sind das Leitmotiv (D285)", () => {
    const mitDriver: RecipeInputs = {
      ...inputs,
      conversionDriver: [
        { resultat: "Getränke bleiben 24 h eiskalt", nutzen: ["doppelwandige Vakuum-Isolierung"], motiv: "kern", relevanz: 5 },
        { resultat: "Nichts läuft in der Tasche aus", nutzen: ["Silikondichtung im Schraubdeckel"], motiv: "entscheidung", relevanz: 4 },
      ],
    };
    const prompt = sectionPrompt("bullets", mitDriver);
    expect(prompt).toContain("KERN-KAUFGRÜNDE");
    expect(prompt).toContain("Getränke bleiben 24 h eiskalt");
    // Der stärkste Kaufgrund wird ausdrücklich als Leitmotiv für Bullet 1 benannt
    expect(prompt).toContain("LEITMOTIV DES LISTINGS");
    // Und die Slot-Logik verlangt ihn im ERSTEN Bullet, nicht ein Zusatz-Feature
    expect(prompt).toContain("BULLET 1 = HAUPT-NUTZEN");
  });

  /**
   * D285: Ohne die Bewertungs-Analyse im Prüfer-Kontext konnte der Prüfer nicht
   * erkennen, dass ein Bullet ein belegtes Problem dementiert.
   */
  it("Prüfer-Kontext enthält Pain Points und Kaufgründe (D285)", () => {
    const kontext = prueferKontext({
      ...inputs,
      reviewInsights: {
        sources: [],
        stats: { reviewsTotal: 120, ratingAvg: 4.1 },
        painPoints: [{ label: "Deckel undicht bei Kohlensäure", frequencyPct: null, mentionCount: 19, quotes: ["tropft"] }],
        buyingTriggers: [{ label: "hält wirklich 24 h kalt", frequencyPct: null, mentionCount: 11, quotes: ["eiskalt"] }],
        languageToBorrow: [],
        languageToAvoid: [],
      },
      conversionDriver: [{ resultat: "Getränke bleiben 24 h eiskalt", nutzen: [], motiv: "kern", relevanz: 5 }],
    });
    expect(kontext).toContain("Deckel undicht bei Kohlensäure");
    expect(kontext).toContain("19× belegt");
    expect(kontext).toContain("Dementi");
    expect(kontext).toContain("Getränke bleiben 24 h eiskalt");
  });

  it("Pain-Point-Ehrlichkeit und Haupt-Nutzen stehen als Gesetze im Bullet-Prompt (D285)", () => {
    const prompt = sectionPrompt("bullets", inputs);
    expect(prompt).toContain("[bullets.hauptnutzen]");
    expect(prompt).toContain("[inhalt.pain-point-ehrlich]");
    expect(prompt).toContain("NIE DEMENTIEREN");
  });

  /**
   * D286 (Nutzer-Audit 04.08.2026): Drei Analyse-Ergebnisse hatten keine Wirkung
   * auf den Content. Diese Tests halten die Verdrahtung fest.
   */
  it("Blocker tragen Kaufgrund und zu beweisenden Nutzen in den Prompt (D286)", () => {
    const prompt = sectionPrompt("bullets", {
      ...inputs,
      conversionBlocker: [
        {
          titel: "Kein Bildbeweis für die Dichtigkeit",
          beschreibung: "Das Listing zeigt nirgends, dass der Deckel bei Kohlensäure hält.",
          kaufgrund: "Nichts läuft in der Tasche aus",
          nutzen: "Silikondichtung im Schraubdeckel",
        },
      ],
    });
    expect(prompt).toContain("CONVERSION-BLOCKER");
    expect(prompt).toContain("gehört zum Kaufgrund: Nichts läuft in der Tasche aus");
    expect(prompt).toContain("zu beweisen: Silikondichtung im Schraubdeckel");
  });

  it("Audit-Befunde erreichen die Generierung — gefiltert auf die eigene Sektion (D286)", () => {
    const mitBefunden: RecipeInputs = {
      ...inputs,
      listingBefunde: {
        positionierung: "Die robuste Alltagsflasche für Sport und Büro",
        dimensionen: [
          { key: "bullets", label: "Bullet Points", score10: 4, probleme: ["Kein Bullet nennt die Isolierdauer"], empfehlung: "Isolierdauer in Bullet 1" },
          { key: "title", label: "Titel", score10: 7, probleme: ["Zielgruppe fehlt im Titel"], empfehlung: "Zielgruppe ergänzen" },
        ],
        topActions: ["Isolierdauer prominent belegen"],
      },
    };
    const bulletPrompt = sectionPrompt("bullets", mitBefunden);
    expect(bulletPrompt).toContain("BEFUNDE AM BISHERIGEN BULLET POINTS");
    expect(bulletPrompt).toContain("Kein Bullet nennt die Isolierdauer");
    expect(bulletPrompt).toContain("EMPFEHLUNG DER ANALYSE");
    expect(bulletPrompt).toContain("POSITIONIERUNG");
    expect(bulletPrompt).toContain("TOP-MASSNAHMEN DER ANALYSE");
    // Fremde Sektion bleibt draußen — sonst schreibt der Bullet-Lauf am Titel herum
    expect(bulletPrompt).not.toContain("Zielgruppe fehlt im Titel");
    // …und erscheint beim Titel-Lauf
    expect(sectionPrompt("title", mitBefunden)).toContain("Zielgruppe fehlt im Titel");
  });

  it("Merkmal-Einordnung steuert, was zurückkehren darf (D286)", () => {
    const prompt = sectionPrompt("bullets", {
      ...inputs,
      merkmalEinordnung: { ohneZweck: ["Top-Qualität für höchste Ansprüche"], notwendig: ["Fassungsvermögen 750 ml"] },
    });
    expect(prompt).toContain("OHNE ERKENNBAREN ZWECK");
    expect(prompt).toContain("Top-Qualität für höchste Ansprüche");
    expect(prompt).toContain("NOTWENDIGE ANGABEN");
    expect(prompt).toContain("Fassungsvermögen 750 ml");
  });

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
