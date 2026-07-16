import { describe, it, expect } from "vitest";
import { deriveKeywordTiers } from "./tiering";
import type { SovAudit, SovKeyword } from "./audit";

const kw = (keyword: string, sv: number, relevanceWeight: number, cluster = "Core Category", oppScore = 0): SovKeyword =>
  ({ keyword, sv, relevanceWeight, cluster, oppScore } as unknown as SovKeyword);

const audit = (keywords: SovKeyword[]): SovAudit => ({ keywords } as unknown as SovAudit);

describe("deriveKeywordTiers", () => {
  it("rankt nach Suchvolumen × Relevanz und schneidet die Tiers 3/13/18", () => {
    const kws = Array.from({ length: 20 }, (_, i) => kw(`kw${i}`, 1000 - i * 10, 1.0));
    const { tiered } = deriveKeywordTiers(audit(kws));
    expect(tiered.filter((k) => k.tier === "primary").map((k) => k.keyword)).toEqual(["kw0", "kw1", "kw2"]);
    expect(tiered.filter((k) => k.tier === "secondary")).toHaveLength(10);
    expect(tiered.filter((k) => k.tier === "tertiary")).toHaveLength(5);
    expect(tiered.filter((k) => k.tier === "backend")).toHaveLength(2);
  });

  it("Relevanzgewicht schlägt rohes Suchvolumen", () => {
    const { tiered } = deriveKeywordTiers(
      audit([kw("discovery riese", 10000, 0.4, "Discovery Terms"), kw("core klein", 6000, 1.0)]),
    );
    expect(tiered[0].keyword).toBe("core klein"); // 6000×1.0 > 10000×0.4
  });

  it("schließt Brand-Alternatives aus (Fremdmarken-Verbot) und meldet sie", () => {
    const { tiered, excludedBrandTerms } = deriveKeywordTiers(
      audit([kw("konkurrenz marke xy", 9000, 0.4, "Brand Alternatives"), kw("edelstahl flasche", 500, 1.0)]),
    );
    expect(tiered.map((k) => k.keyword)).toEqual(["edelstahl flasche"]);
    expect(excludedBrandTerms).toEqual(["konkurrenz marke xy"]);
  });

  it("Gleichstand entscheidet der Opportunity-Score", () => {
    const { tiered } = deriveKeywordTiers(audit([kw("a", 100, 1.0, "Core Category", 0.2), kw("b", 100, 1.0, "Core Category", 0.8)]));
    expect(tiered[0].keyword).toBe("b");
  });

  it("unrankende Kopf-Keywords (extra, D91) werden per Score einsortiert — ‚krabbelmatte' wird primary", () => {
    const { tiered } = deriveKeywordTiers(
      audit([kw("krabbelmatte baby", 4400, 1.0), kw("spielmatte kinder", 3600, 1.0)]),
      [{ keyword: "krabbelmatte", sv: 22000 }], // niemand rankt darauf — trotzdem Basis-Keyword Nr. 1
    );
    expect(tiered[0]).toMatchObject({ keyword: "krabbelmatte", tier: "primary" });
  });

  it("extra-Keywords dedupen gegen das Audit und Brand-Terme fliegen auch dort", () => {
    const { tiered } = deriveKeywordTiers(
      audit([kw("krabbelmatte", 22000, 1.0)]),
      [{ keyword: "Krabbelmatte", sv: 22000 }, { keyword: "krabbelmatte konkurrenz alternative", sv: 9000 }],
    );
    expect(tiered.filter((k) => k.keyword.toLowerCase() === "krabbelmatte")).toHaveLength(1);
    expect(tiered.some((k) => k.keyword.includes("alternative"))).toBe(false);
  });
});
