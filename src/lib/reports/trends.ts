/**
 * Trend-Schiene (D63): Perioden-getaggte Uploads → Verlaufszeilen je Marke.
 * Muster nach reporting-main buildWeeklyRows(businessReports, adsReports):
 * Basis ist der Business Report je Periode; ein Ads-Bericht wird über die
 * größte Perioden-Überlappung zugeordnet. Raten IMMER aus Roh-Summen.
 * Re-Uploads derselben Periode: der neueste gewinnt.
 */

import type { BusinessTotals } from "./business";
import type { AdsTotals } from "./ads";
import { combineWithBusiness } from "./ads";

export type UploadLike = {
  reportType: string;
  parseStatus: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  createdAt: Date;
  parsed: unknown;
};

export type TrendRow = {
  periodStart: Date;
  periodEnd: Date;
  label: string;
  revenue: number;
  sessions: number;
  orders: number;
  units: number;
  cvr: number | null;
  buyBoxPct: number | null;
  spend: number | null; // null = kein Ads-Bericht für die Periode
  acos: number | null;
  tacos: number | null;
  ppcShare: number | null;
  ppcSales: number | null;
  /** Organisch = max(0, Umsatz − PPC-Umsatz) — Näherung, kein Cent-Ledger. */
  orgRevenue: number | null;
};

const d = (x: Date) => x.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });

function overlapMs(aS: Date, aE: Date, bS: Date, bE: Date): number {
  return Math.max(0, Math.min(aE.getTime(), bE.getTime()) - Math.max(aS.getTime(), bS.getTime()));
}

export function buildTrendRows(uploads: UploadLike[]): TrendRow[] {
  const ok = uploads.filter((u) => u.parseStatus === "ok" && u.periodStart && u.periodEnd);
  const newestFirst = [...ok].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Business-Basis: je Periode (Start+Ende) nur der neueste Upload
  const seen = new Set<string>();
  const business = newestFirst.filter((u) => {
    if (u.reportType !== "business") return false;
    const key = `${u.periodStart!.getTime()}-${u.periodEnd!.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ads = newestFirst.filter((u) => u.reportType === "ads");

  return business
    .map((b) => {
      const t = (b.parsed as { totals?: BusinessTotals })?.totals;
      if (!t) return null;
      // Ads-Bericht mit der größten Perioden-Überlappung (0 = keiner)
      const match = ads
        .map((a) => ({ a, ov: overlapMs(b.periodStart!, b.periodEnd!, a.periodStart!, a.periodEnd!) }))
        .filter((x) => x.ov > 0)
        .sort((x, y) => y.ov - x.ov)[0]?.a;
      const at = (match?.parsed as { totals?: AdsTotals })?.totals ?? null;
      const combined = at ? combineWithBusiness(at, { revenue: t.revenue, sessions: t.sessions, orders: t.orders }) : null;
      return {
        periodStart: b.periodStart!,
        periodEnd: b.periodEnd!,
        label: `${d(b.periodStart!)}–${d(b.periodEnd!)}`,
        revenue: t.revenue,
        sessions: t.sessions,
        orders: t.orders,
        units: t.units,
        cvr: t.cvr,
        buyBoxPct: t.buyBoxPct,
        spend: at?.spend ?? null,
        acos: at?.acos ?? null,
        tacos: combined?.tacos ?? null,
        ppcShare: combined?.ppcShare ?? null,
        ppcSales: at?.sales ?? null,
        orgRevenue: at ? Math.max(0, Math.round((t.revenue - at.sales) * 100) / 100) : null,
      };
    })
    .filter((r): r is TrendRow => r !== null)
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
}
