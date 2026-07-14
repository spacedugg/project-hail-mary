import { describe, it, expect } from "vitest";
import { buildTrendRows, type UploadLike } from "./trends";

const D = (s: string) => new Date(s);
const biz = (start: string, end: string, revenue: number, created = "2026-07-01"): UploadLike => ({
  reportType: "business",
  parseStatus: "ok",
  periodStart: D(start),
  periodEnd: D(end),
  createdAt: D(created),
  parsed: { totals: { revenue, sessions: 1000, orders: 100, units: 110, cvr: 10, buyBoxPct: 90 } },
});
const ads = (start: string, end: string, spend: number): UploadLike => ({
  reportType: "ads",
  parseStatus: "ok",
  periodStart: D(start),
  periodEnd: D(end),
  createdAt: D("2026-07-01"),
  parsed: { totals: { spend, sales: spend * 4, orders: 40, clicks: 400, impressions: 10000, ctr: 4, cpc: null, cvr: 10, acos: 25, roas: 4, campaignCount: 3, noSaleSpend: 0, noSaleCount: 0 } },
});

describe("buildTrendRows", () => {
  it("sortiert chronologisch und rechnet TACoS aus dem überlappenden Ads-Bericht", () => {
    const rows = buildTrendRows([
      biz("2026-06-01", "2026-06-30", 20000),
      biz("2026-05-01", "2026-05-31", 10000),
      ads("2026-06-01", "2026-06-30", 1000),
    ]);
    expect(rows.map((r) => r.revenue)).toEqual([10000, 20000]); // chronologisch
    expect(rows[0].spend).toBeNull(); // Mai ohne Ads-Bericht
    expect(rows[1].spend).toBe(1000);
    expect(rows[1].tacos).toBeCloseTo(5, 1); // 1000/20000
    expect(rows[1].label).toContain("1.6.");
  });

  it("Re-Upload derselben Periode: der neueste gewinnt", () => {
    const rows = buildTrendRows([
      biz("2026-06-01", "2026-06-30", 111, "2026-07-01"),
      biz("2026-06-01", "2026-06-30", 222, "2026-07-05"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(222);
  });

  it("Ads-Zuordnung über größte Überlappung; Fehl-Parses und Uploads ohne Periode fliegen raus", () => {
    const broken: UploadLike = { ...biz("2026-06-01", "2026-06-30", 1), parseStatus: "error" };
    const noPeriod: UploadLike = { ...biz("2026-06-01", "2026-06-30", 1), periodStart: null };
    const rows = buildTrendRows([
      biz("2026-06-01", "2026-06-30", 20000),
      ads("2026-06-15", "2026-07-15", 500), // halbe Überlappung
      ads("2026-06-01", "2026-06-30", 900), // volle Überlappung → gewinnt
      broken,
      noPeriod,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(900);
  });
});
