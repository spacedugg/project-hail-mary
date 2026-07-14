import { describe, it, expect } from "vitest";
import { decomposeRevenueDelta, diagnosePeriods } from "./diagnose";
import type { TrendRow } from "./trends";

const row = (o: Partial<TrendRow>): TrendRow => ({
  periodStart: new Date("2026-05-01"),
  periodEnd: new Date("2026-05-31"),
  label: "1.5.–31.5.",
  revenue: 10000,
  sessions: 1000,
  orders: 100,
  units: 100,
  cvr: 10,
  buyBoxPct: 90,
  spend: 500,
  acos: 20,
  tacos: 5,
  ppcShare: 40,
  ppcSales: 2000,
  orgRevenue: 8000,
  ...o,
});

describe("decomposeRevenueDelta (ln-Zerlegung Umsatz = Sitzungen × CVR × AOV)", () => {
  it("reiner Traffic-Effekt: 100 % des Deltas auf Sitzungen", () => {
    const d = decomposeRevenueDelta(
      { revenue: 1000, sessions: 1000, orders: 100 },
      { revenue: 1200, sessions: 1200, orders: 120 },
    )!;
    expect(d.deltaEur).toBeCloseTo(200, 2);
    expect(d.factors.find((f) => f.key === "sessions")!.eur).toBeCloseTo(200, 1);
    expect(d.factors.find((f) => f.key === "cvr")!.eur).toBeCloseTo(0, 6);
    expect(d.factors.find((f) => f.key === "aov")!.eur).toBeCloseTo(0, 6);
  });

  it("gemischter Fall: Beiträge summieren sich EXAKT zum Gesamt-Delta", () => {
    const d = decomposeRevenueDelta(
      { revenue: 10000, sessions: 1000, orders: 100 }, // CVR 10 %, AOV 100
      { revenue: 9000, sessions: 1200, orders: 90 }, // Traffic hoch, CVR runter, AOV hoch
    )!;
    const sum = d.factors.reduce((s, f) => s + f.eur, 0);
    expect(sum).toBeCloseTo(d.deltaEur, 1);
    expect(d.factors.find((f) => f.key === "sessions")!.eur).toBeGreaterThan(0);
    expect(d.factors.find((f) => f.key === "cvr")!.eur).toBeLessThan(0);
  });

  it("gibt null zurück statt erfundener Zahlen bei Null-Werten", () => {
    expect(decomposeRevenueDelta({ revenue: 0, sessions: 100, orders: 10 }, { revenue: 100, sessions: 100, orders: 10 })).toBeNull();
  });
});

describe("diagnosePeriods (Ursachen-Abgleich quer über die Module)", () => {
  it("Traffic-Rückgang + offene SOV-Lücken → Sichtbarkeits-Diagnose mit Evidenz", () => {
    const d = diagnosePeriods(
      [row({}), row({ label: "1.6.–30.6.", revenue: 8000, sessions: 800, orders: 80 })],
      { sovQuickWins: 5, sovGapEur: 3000 },
    )!;
    const f = d.findings[0];
    expect(f.befund).toContain("Sichtbarkeits");
    expect(f.evidenz).toContain("5 Quick Wins");
    expect(f.severity).toBe("bad");
  });

  it("CVR-Rückgang + Buybox-Verlust → Buybox vor Listing", () => {
    const d = diagnosePeriods(
      [row({}), row({ label: "1.6.–30.6.", revenue: 8500, sessions: 1000, orders: 85, cvr: 8.5, buyBoxPct: 82 })],
      {},
    )!;
    expect(d.findings[0].befund).toContain("Buybox");
    expect(d.findings[0].nextStep).toContain("Buybox");
  });

  it("TACoS über Break-even → unprofitabel erkauft, auch bei Wachstum", () => {
    const d = diagnosePeriods(
      [row({}), row({ label: "1.6.–30.6.", revenue: 12000, sessions: 1200, orders: 120, tacos: 20 })],
      { breakEven: 15 },
    )!;
    expect(d.findings.some((f) => f.befund.includes("unprofitabel") && f.severity === "bad")).toBe(true);
  });

  it("fehlender Ads-Bericht wird ehrlich benannt statt still gelückt", () => {
    const d = diagnosePeriods(
      [row({ spend: null, tacos: null }), row({ label: "1.6.–30.6.", revenue: 12000, spend: null, tacos: null })],
      {},
    )!;
    expect(d.findings.some((f) => f.befund.includes("Werbe-Signal fehlt"))).toBe(true);
  });
});
