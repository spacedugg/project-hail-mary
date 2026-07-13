import { describe, it, expect } from "vitest";
import { parseCerebroCsv, computeSovAudit, clusterKeyword } from "./audit";
import { spellingSafe } from "@/lib/analysis/imageBrief";
import { analyzeListing } from "@/lib/analysis/listingAudit";

const CSV = `Keyword Phrase,Search Volume,Position (Rank),Keyword Sales,CPR,B0MAINASIN,B0COMPAAAA,B0COMPBBBB
edelstahl trinkflasche,18100,12,40,32,12,3,8
thermosflasche,9900,-,25,48,-,2,15
nischenwort,50,1,2,8,1,0,0
irrelevant leer,0,5,1,9,5,1,2
unsichtbar gross,8000,-,0,64,-,4,9`;

describe("SOV-Audit (portiertes Formelwerk)", () => {
  const rows = parseCerebroCsv(CSV, "B0MAINASIN");

  it("parst Cerebro-CSV: ASIN-Spalten, parseRank('-')=0, SV<=0-Filter", () => {
    expect(rows).toHaveLength(4); // "irrelevant leer" fliegt raus (SV 0)
    const t = rows.find((r) => r.keyword === "thermosflasche")!;
    expect(t.mainRank).toBe(0); // "-" = unranked
    expect(t.compRanks["B0COMPAAAA"]).toBe(2);
  });

  it("klassifiziert Opportunities korrekt", () => {
    const audit = computeSovAudit(rows, { price: 30, mainAsin: "B0MAINASIN" });
    const byKw = Object.fromEntries(audit.keywords.map((k) => [k.keyword, k]));
    // Rang 12, Comp in Top 10, ks>0 → Quick Win
    expect(byKw["edelstahl trinkflasche"].opportunityType).toBe("Quick Win");
    // unranked, Comp Rang 2 (Top 20), ks>0 → Strategic Gap
    expect(byKw["thermosflasche"].opportunityType).toBe("Strategic Gap");
    // Rang 1, kein besserer Comp → Strong Position
    expect(byKw["nischenwort"].opportunityType).toBe("Strong Position");
    // ks=0 → Monitor, Korridor 0
    expect(byKw["unsichtbar gross"].opportunityType).toBe("Monitor");
    expect(byKw["unsichtbar gross"].corridors).toEqual({ low: 0, base: 0, high: 0 });
  });

  it("Revenue-Gap: wöchentliche KS ×4.36, rankShare-Differenz, Korridor 20/60/95 %", () => {
    const audit = computeSovAudit(rows, { price: 30, mainAsin: "B0MAINASIN" });
    const qw = audit.keywords.find((k) => k.keyword === "edelstahl trinkflasche")!;
    // Pool = 40×4.36×30 = 5232; Gap = Pool×(rankShare(3)-rankShare(12)) = 5232×(0.125-0.007)
    expect(qw.fullRevGap).toBeCloseTo(5232 * (0.125 - 0.007), 1);
    expect(qw.corridors.high).toBe(Math.round(qw.fullRevGap * 0.95));
  });

  it("brandSOV & invisible keywords", () => {
    const audit = computeSovAudit(rows, { price: 30, mainAsin: "B0MAINASIN" });
    expect(audit.brandSOV).toBeGreaterThan(0);
    expect(audit.brandSOV).toBeLessThan(100);
    // unranked UND SV >= Median (9900): thermosflasche ja, "unsichtbar gross" (8000) knapp darunter
    expect(audit.invisibleKeywords).toContain("thermosflasche");
    expect(audit.invisibleKeywords).not.toContain("nischenwort"); // gerankt
  });

  it("Cluster-Kaskade", () => {
    expect(clusterKeyword("flasche gegen auslaufen")).toBe("Problem / Solution");
    expect(clusterKeyword("wie reinige ich trinkflasche richtig")).toBe("Usage Intent");
    expect(clusterKeyword("bottle")).toBe("Core Category");
  });
});

describe("spellingSafe (12-Zeichen-Regel)", () => {
  it("ersetzt bekannte Risiko-Wörter und kürzt lange", () => {
    expect(spellingSafe("EINGEBAUTER BEWEGUNGSMELDER").safe).toContain("PIR-SENSOR");
    expect(spellingSafe("HÄLT 24 STUNDEN KALT").changed).toBe(false);
  });
});

describe("analyzeListing", () => {
  it("liefert deterministische Dimensionen + SEO-Abdeckung aus SOV", () => {
    const rowsAll = parseCerebroCsv(CSV, "B0MAINASIN");
    const audit = computeSovAudit(rowsAll, { price: 30, mainAsin: "B0MAINASIN" });
    const analysis = analyzeListing({
      snapshot: {
        title: "Marke Edelstahl Trinkflasche 750 ml auslaufsicher isoliert für Sport und Büro, BPA-frei mattschwarz",
        bullets: ["HÄLT LANGE KALT: Guter Text mit ausreichend Länge für die Bewertung der Regel im Gate und noch etwas mehr Substanz dazu, damit die Bytes im Zielkorridor liegen können."],
        description: "Eine ausführliche Beschreibung mit vollständigen Sätzen und Antworten auf typische Fragen.",
        backendKeywords: "campingflasche wanderflasche",
      },
      facts: { usps: ["auslaufsicher"] },
      primaryKeywords: ["Edelstahl Trinkflasche"],
      sovAudit: audit,
      reviewInsights: null,
    });
    expect(analysis.dimensions.map((d) => d.key)).toContain("seo-coverage");
    expect(analysis.dimensions.every((d) => d.evidence === "deterministic")).toBe(true);
    expect(analysis.overall).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });
});
