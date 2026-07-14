import { describe, it, expect } from "vitest";
import { parseAdsReport, parseTargetAcos, combineWithBusiness } from "./ads";

const US_CSV = [
  "Campaign Name,Campaign ID,Campaign Type,State,Portfolio,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders",
  'TE-DE-Flasche-Exact,8684861467846,sponsoredProducts,enabled,"ACOS Ziel 10%",72384,913,"1,189.66","8,102.29",364',
  "TE-DE-Brand-Video,123,sponsoredBrands,paused,Max Conversion,10000,50,100.00,0.00,0",
  "TE-DE-Display,456,sponsoredDisplay,enabled,,5000,25,50.00,200.00,4",
].join("\n");

const DE_CSV = [
  "Kampagnenname;Typ;Status;Portfolio;Klicks;Klickrate (CTR);Ausgaben;Verkäufe;Bestellungen",
  'Flasche Auto;SP;aktiviert;ACoS Ziel 20%;123;0,45 %;"2.447,18 €";"9.000,00 €";80',
  'Brand SB;SB2;aktiviert;Ziel 12,5%;863;1,2 %;"1.119,86 €";"7.025,27 €";249',
].join("\n");

describe("parseAdsReport", () => {
  it("parst US-Export und rechnet Raten IMMER aus Rohwerten neu", () => {
    const { campaigns, totals } = parseAdsReport(US_CSV);
    expect(campaigns).toHaveLength(3);
    const c = campaigns.find((x) => x.id === "8684861467846")!;
    expect(c.type).toBe("SP");
    expect(c.spend).toBeCloseTo(1189.66, 2);
    expect(c.sales).toBeCloseTo(8102.29, 2);
    expect(c.orders).toBe(364);
    expect(c.impressions).toBe(72384);
    expect(c.clicks).toBe(913);
    expect(c.acos).toBeCloseTo((1189.66 / 8102.29) * 100, 1);
    expect(c.roas).toBeCloseTo(8102.29 / 1189.66, 2);
    expect(c.ctr).toBeCloseTo((913 / 72384) * 100, 2);
    expect(c.targetAcos).toBe(0.1);
    expect(campaigns.find((x) => x.id === "123")!.targetAcos).toBeNull();
    expect(campaigns.find((x) => x.id === "123")!.type).toBe("SB");
    expect(campaigns.find((x) => x.id === "456")!.type).toBe("SD");
    // Totals = Summen; Raten aus Summen, nie ACoS-Mittelwert
    expect(totals.spend).toBeCloseTo(1339.66, 2);
    expect(totals.sales).toBeCloseTo(8302.29, 2);
    expect(totals.acos).toBeCloseTo((1339.66 / 8302.29) * 100, 1);
    // Kampagne mit Spend ohne Sales → Wasted-Kandidat
    expect(totals.noSaleCount).toBe(1);
    expect(totals.noSaleSpend).toBeCloseTo(100, 2);
  });

  it("parst deutschen Export ohne ID/Impressions: Name als ID, Impressionen aus Klicks÷CTR", () => {
    const { campaigns, totals } = parseAdsReport(DE_CSV);
    const c = campaigns.find((x) => x.name === "Flasche Auto")!;
    expect(c.id).toBe("Flasche Auto");
    expect(c.spend).toBeCloseTo(2447.18, 2);
    expect(c.impressions).toBe(Math.round(123 / 0.0045));
    expect(c.targetAcos).toBe(0.2);
    const sb = campaigns.find((x) => x.name === "Brand SB")!;
    expect(sb.type).toBe("SB");
    expect(sb.targetAcos).toBe(0.125);
    expect(totals.clicks).toBe(986);
    expect(totals.spend).toBeCloseTo(3567.04, 2);
  });

  it("wirft bei fehlenden Pflicht-Spalten und leeren Dateien", () => {
    expect(() => parseAdsReport("Kampagnenname;Klicks\nA;5")).toThrow(/Pflicht-Spalten/);
    expect(() => parseAdsReport("nur eine zeile")).toThrow(/zu kurz/);
  });
});

describe("parseTargetAcos", () => {
  it("liest Prozent-Ziele inkl. Komma-Dezimal, null-tolerant", () => {
    expect(parseTargetAcos("ACoS Ziel 20%")).toBe(0.2);
    expect(parseTargetAcos("Ziel 12,5%")).toBe(0.125);
    expect(parseTargetAcos("Max Conversion")).toBeNull();
    expect(parseTargetAcos("")).toBeNull();
  });
});

describe("combineWithBusiness", () => {
  it("rechnet TACoS/Org-CR/PPC-Anteil nach den reporting-main-Golden-Formeln", () => {
    // KW20-Goldwerte: sessions 1266, orders 327, revenue 8575,10; Ads: spend 1119,86, orders 249
    const combined = combineWithBusiness(
      { spend: 1119.86, sales: 7025.27, orders: 249, clicks: 986, impressions: 0, ctr: null, cpc: null, cvr: null, acos: null, roas: null, campaignCount: 2, noSaleSpend: 0, noSaleCount: 0 },
      { revenue: 8575.1, sessions: 1266, orders: 327 },
    );
    expect(combined.tacos).toBeCloseTo((1119.86 / 8575.1) * 100, 1);
    expect(combined.orgCvr).toBeCloseTo(((327 - 249) / 1266) * 100, 1);
    expect(combined.ppcShare).toBeCloseTo((249 / 327) * 100, 1);
    expect(combined.orgRevenue).toBeCloseTo(8575.1 - 7025.27, 2);
  });
});
