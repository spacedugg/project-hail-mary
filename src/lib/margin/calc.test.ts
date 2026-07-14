import { describe, it, expect } from "vitest";
import { computeMargin } from "./calc";
import { referralRate, storageFeePerUnit, disposalFeePerUnit } from "./fees";

describe("computeMargin — 1L-Referenz-Fixture (Regressionsanker aus reporting-main)", () => {
  const r = computeMargin({
    orderQty: 100,
    vatRate: 0.19,
    category: "Alles andere",
    customsRate: 0,
    dims: { l: 9, w: 9, h: 27 },
    weightG: 900,
    returnRate: 0.1,
    disposalShare: 0.25,
    purchasePrice: 1.17,
    packagingCost: 0.71,
    fbaShippingFee: 3.4,
    sellingPriceGross: 9.9,
  });

  it("reproduziert alle Golden-Werte", () => {
    expect(r.goodsCostPerUnit).toBeCloseTo(1.88, 6);
    expect(r.referralFee).toBeCloseTo(0.792, 6);
    expect(r.storageFee).toBeCloseTo(0.146714895, 8);
    expect(r.returnCostPerUnit).toBeCloseTo(0.28668, 5);
    expect(r.disposalCostPerUnit).toBeCloseTo(0.28991, 5);
    expect(r.amazonTotalPerUnit).toBeCloseTo(4.915304895, 8);
    expect(r.netPrice).toBeCloseTo(8.319327731, 8);
    expect(r.marginPerUnit).toBeCloseTo(1.524022836, 8);
    expect(r.marginPct).toBeCloseTo(18.31906, 4);
    expect(r.roi).toBeCloseTo(81.065, 3);
    expect(r.payoutPerUnit).toBeCloseTo(4.984695105, 8);
    expect(r.breakEvenAcos).toBeCloseTo(15.394, 3);
    expect(r.totals.revenue).toBeCloseTo(990, 2);
    expect(r.totals.margin).toBeCloseTo(152.4, 1);
    expect(r.totals.payout).toBeCloseTo(498.47, 2);
  });
});

describe("computeMargin — Randfälle", () => {
  it("nur Pflichtfelder (EK 2, VK 10): Netto 8,403361, Referral 0,80, Marge = Netto − 2 − 0,8", () => {
    const r = computeMargin({ purchasePrice: 2, sellingPriceGross: 10 });
    expect(r.netPrice).toBeCloseTo(8.403361, 5);
    expect(r.referralFee).toBeCloseTo(0.8, 6);
    expect(r.storageFee).toBe(0);
    expect(r.marginPerUnit).toBeCloseTo(8.403361 - 2 - 0.8, 5);
  });

  it("Override schlägt Auto-Wert", () => {
    const r = computeMargin({ purchasePrice: 2, sellingPriceGross: 10, storageFeeOverride: 0.5, dims: { l: 9, w: 9, h: 27 } });
    expect(r.storageFee).toBe(0.5);
  });
});

describe("Gebühren-Tabellen", () => {
  it("Staffeln: Beauty 9 €→8 %, 11 €→15 %; Auto 60 €→9 %; Alles andere 100 €→8 %", () => {
    expect(referralRate("Beauty", 9)).toBe(0.08);
    expect(referralRate("Beauty", 11)).toBe(0.15);
    expect(referralRate("Auto & Motorrad", 60)).toBe(0.09);
    expect(referralRate("Alles andere", 100)).toBe(0.08);
    expect(referralRate("Unbekannt", 10)).toBe(0);
  });

  it("Lager: 9×9×27 Alles-andere → 0,146714895 €; Bekleidung billiger", () => {
    expect(storageFeePerUnit({ l: 9, w: 9, h: 27 }, "Alles andere")).toBeCloseTo(0.146714895, 8);
    expect(storageFeePerUnit({ l: 9, w: 9, h: 27 }, "Bekleidung & Schuhe")).toBeLessThan(0.146714895);
  });

  it("Entsorgung: Golden-Werte inkl. Oversize-Weiche (Seite ≥ 46 cm)", () => {
    expect(disposalFeePerUnit(900, { l: 9, w: 9, h: 27 })).toBe(0.45);
    expect(disposalFeePerUnit(150, { l: 9, w: 9, h: 27 })).toBe(0.25);
    expect(disposalFeePerUnit(900, { l: 50, w: 9, h: 27 })).toBe(1.0);
    expect(disposalFeePerUnit(100, { l: 50, w: 9, h: 27 })).toBe(0.5);
    expect(disposalFeePerUnit(0, null)).toBe(0.25);
  });
});
