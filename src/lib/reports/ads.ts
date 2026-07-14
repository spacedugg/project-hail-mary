/**
 * Ads-/Kampagnenbericht-Parser (Sponsored Ads Kampagnenbericht).
 * Portiert nach den reporting-main-Prinzipien (knowledge/sources §4, ads/parser):
 * - Header-Aliasing DE/EN, tolerant gegen Export-Varianten (mit/ohne ID- und
 *   Impressions-Spalte)
 * - ACoS/ROAS/CTR/CVR IMMER aus Rohwerten neu berechnet, nie aus der Datei
 * - fehlen Impressionen: abgeleitet = round(Klicks ÷ CTR aus Datei)
 * - Target-ACoS aus dem Portfolio-Namen geparst („ACOS Ziel 10%" → 0,10)
 * - Totals = Summen; Raten aus Summen (nie Mittelwert der Zeilen-ACoS)
 */

import { parseCsvLine, makeNumParser } from "./business";

export type AdsCampaign = {
  id: string; // Kampagnen-ID, Fallback Name
  name: string;
  type: "SP" | "SB" | "SD" | "other";
  state: string;
  portfolio: string;
  targetAcos: number | null; // aus Portfolio-Namen, 0..1
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  ctr: number | null; // %
  cpc: number | null; // €
  cvr: number | null; // % (orders/clicks)
  acos: number | null; // %
  roas: number | null;
};

export type AdsTotals = {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  ctr: number | null;
  cpc: number | null;
  cvr: number | null;
  acos: number | null;
  roas: number | null;
  campaignCount: number;
  noSaleSpend: number; // Spend von Kampagnen mit 0 Sales (Wasted-Kandidaten)
  noSaleCount: number;
};

export function parseTargetAcos(portfolio: string): number | null {
  const m = portfolio.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) ? n / 100 : null;
}

function mapType(raw: string): AdsCampaign["type"] {
  const t = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (t.includes("sponsoredproducts") || /^sp\d*$/.test(t)) return "SP";
  if (t.includes("sponsoredbrands") || t.includes("sponsoredheadline") || /^sb\d*$/.test(t) || /^hsa$/.test(t)) return "SB";
  if (t.includes("sponsoreddisplay") || /^sd\d*$/.test(t)) return "SD";
  return raw.trim() ? "other" : "SP";
}

const pct = (num: number, den: number, digits = 2) =>
  den > 0 ? Math.round((num / den) * 100 * 10 ** digits) / 10 ** digits : null;
const ratio = (num: number, den: number, digits = 2) =>
  den > 0 ? Math.round((num / den) * 10 ** digits) / 10 ** digits : null;

export function parseAdsReport(text: string): { campaigns: AdsCampaign[]; totals: AdsTotals } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Report zu kurz — Header + Datenzeilen erwartet.");
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());

  const find = (...needles: string[]) => {
    for (const n of needles) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const nameIdx = find("kampagnenname", "campaign name", "kampagne", "campaign");
  if (nameIdx === -1) throw new Error("Keine Kampagnen-Spalte gefunden — ist das der Sponsored-Ads-Kampagnenbericht?");
  const idIdx = find("kampagnen-id", "campaign id");
  const typeIdx = find("anzeigentyp", "kampagnentyp", "campaign type", "typ", "type");
  const stateIdx = find("status", "state");
  const portfolioIdx = find("portfolio");
  const imprIdx = find("impressionen", "impressions");
  const clickIdx = find("klicks", "clicks");
  const ctrIdx = find("klickrate", "ctr", "click-through");
  const spendIdx = find("ausgaben", "spend", "kosten", "cost");
  const salesIdx = find("verkäufe", "verkaufe", "sales", "umsätze", "umsatz");
  const ordersIdx = find("bestellungen", "orders", "conversions", "aufträge", "auftrage");
  if (clickIdx === -1 || spendIdx === -1 || salesIdx === -1)
    throw new Error("Pflicht-Spalten fehlen (Klicks / Ausgaben / Verkäufe).");

  const dataLines = lines.slice(1).map((l) => parseCsvLine(l, sep));
  const num = makeNumParser(dataLines.slice(0, 20).map((c) => `${c[spendIdx] ?? ""} ${c[salesIdx] ?? ""}`));

  const campaigns: AdsCampaign[] = dataLines
    .filter((c) => (c[nameIdx] ?? "").trim())
    .map((c) => {
      const name = (c[nameIdx] ?? "").trim();
      const clicks = Math.round(num(c[clickIdx]));
      let impressions = imprIdx >= 0 ? Math.round(num(c[imprIdx])) : 0;
      if (!impressions && ctrIdx >= 0) {
        // Export-Variante ohne Impressions-Spalte: aus Klicks ÷ CTR ableiten.
        // „0,45 %" und „0,0045" bedeuten dieselbe Rate — %-Zeichen entscheidet.
        const raw = (c[ctrIdx] ?? "").trim();
        const n = num(raw);
        const fileCtr = raw.includes("%") || n > 1 ? n / 100 : n;
        if (fileCtr > 0) impressions = Math.round(clicks / fileCtr);
      }
      const spend = num(c[spendIdx]);
      const sales = num(c[salesIdx]);
      const orders = ordersIdx >= 0 ? Math.round(num(c[ordersIdx])) : 0;
      const portfolio = portfolioIdx >= 0 ? (c[portfolioIdx] ?? "").trim() : "";
      return {
        id: idIdx >= 0 && (c[idIdx] ?? "").trim() ? (c[idIdx] ?? "").trim() : name,
        name,
        type: mapType(typeIdx >= 0 ? (c[typeIdx] ?? "") : ""),
        state: stateIdx >= 0 ? (c[stateIdx] ?? "").trim() : "",
        portfolio,
        targetAcos: parseTargetAcos(portfolio),
        impressions,
        clicks,
        spend,
        sales,
        orders,
        ctr: pct(clicks, impressions),
        cpc: ratio(spend, clicks),
        cvr: pct(orders, clicks, 1),
        acos: pct(spend, sales, 1),
        roas: ratio(sales, spend),
      };
    });
  if (campaigns.length === 0) throw new Error("Keine Kampagnen-Zeilen gefunden.");

  const sum = (f: (c: AdsCampaign) => number) => campaigns.reduce((s, c) => s + f(c), 0);
  const impressions = sum((c) => c.impressions);
  const clicks = sum((c) => c.clicks);
  const spend = Math.round(sum((c) => c.spend) * 100) / 100;
  const sales = Math.round(sum((c) => c.sales) * 100) / 100;
  const orders = sum((c) => c.orders);
  const noSale = campaigns.filter((c) => c.spend > 0 && c.sales === 0);

  return {
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    totals: {
      impressions,
      clicks,
      spend,
      sales,
      orders,
      ctr: pct(clicks, impressions),
      cpc: ratio(spend, clicks),
      cvr: pct(orders, clicks, 1),
      acos: pct(spend, sales, 1),
      roas: ratio(sales, spend),
      campaignCount: campaigns.length,
      noSaleSpend: Math.round(noSale.reduce((s, c) => s + c.spend, 0) * 100) / 100,
      noSaleCount: noSale.length,
    },
  };
}

/**
 * Monthly-Reporting-Kennzahlen „Werbung × Business Report" (reporting-main §3.6,
 * Formeln nach den Golden-Werten von computeWeeklyRow):
 * tacos = spend/Umsatz · orgCr = (Orders − PPC-Orders)/Sitzungen ·
 * ppcShare = PPC-Orders/Orders · Organisch-Umsatz = max(0, Umsatz − PPC-Umsatz)
 * („Näherung, kein Cent-Ledger").
 */
export function combineWithBusiness(
  ads: AdsTotals,
  biz: { revenue: number; sessions: number; orders: number },
): { tacos: number | null; ppcShare: number | null; orgCvr: number | null; orgRevenue: number } {
  return {
    tacos: pct(ads.spend, biz.revenue, 1),
    ppcShare: pct(ads.orders, biz.orders, 1),
    orgCvr: pct(Math.max(0, biz.orders - ads.orders), biz.sessions, 1),
    orgRevenue: Math.max(0, Math.round((biz.revenue - ads.sales) * 100) / 100),
  };
}
