import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { AdsCampaign, AdsTotals } from "@/lib/reports/ads";
import { combineWithBusiness } from "@/lib/reports/ads";
import type { BusinessTotals } from "@/lib/reports/business";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const eur = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n)} €`;
const dateStr = (d: Date | null) => (d ? d.toLocaleDateString("de-DE") : "–");

/**
 * Advertising / PPC — echte Zahlen aus dem neuesten Ads-Bericht.
 * ACoS/ROAS/CTR immer aus Roh-Summen (Parser-Prinzip); TACoS/PPC-Anteil/Org-CR
 * entstehen erst aus Ads × Business Report (reporting-main §3.6).
 * Break-even-ACoS folgt mit dem Margen-Modul.
 */
export default async function AdvertisingPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const adsUpload = uploads.find((u) => u.reportType === "ads" && u.parseStatus === "ok");
  const bizUpload = uploads.find((u) => u.reportType === "business" && u.parseStatus === "ok");
  const ads = (adsUpload?.parsed as { campaigns?: AdsCampaign[]; totals?: AdsTotals }) ?? null;
  const biz = (bizUpload?.parsed as { totals?: BusinessTotals })?.totals ?? null;
  const base = `/marke/${brandId}`;

  if (!ads?.totals) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Advertising / PPC</h1>
        <p className="mt-1 text-sm text-neutral-500">Kampagnen-Portfolio dieser Marke — gespeist aus dem Ads-/Kampagnenbericht.</p>
        <div className="mt-6 card border-dashed p-6 text-sm text-muted">
          Noch kein Ads-Bericht. Unter <Link href={`${base}/berichte`} className="text-primary-strong underline">Berichte & Daten</Link> den
          Sponsored-Ads-Kampagnenbericht hochladen (Werbekonsole → Berichte → Kampagnen, alle Anzeigentypen) — dann erscheinen hier
          Ad-Spend, ACoS, ROAS, Kampagnen-Tabelle und Wasted-Spend-Kandidaten. Zusammen mit einem Business Report derselben Periode
          kommen TACoS, PPC-Anteil und Org.-CR dazu.
        </div>
      </main>
    );
  }

  const t = ads.totals;
  const campaigns = ads.campaigns ?? [];
  const combined = biz ? combineWithBusiness(t, { revenue: biz.revenue, sessions: biz.sessions, orders: biz.orders }) : null;
  const byType = (["SP", "SB", "SD", "other"] as const)
    .map((type) => {
      const cs = campaigns.filter((c) => c.type === type);
      const spend = cs.reduce((s, c) => s + c.spend, 0);
      const sales = cs.reduce((s, c) => s + c.sales, 0);
      return { type, count: cs.length, spend, acos: sales > 0 ? Math.round((spend / sales) * 1000) / 10 : null };
    })
    .filter((g) => g.count > 0);
  const wasted = campaigns.filter((c) => c.spend > 0 && c.sales === 0);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Advertising / PPC</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Ads-Bericht {dateStr(adsUpload!.periodStart)} – {dateStr(adsUpload!.periodEnd)} · {t.campaignCount} Kampagnen · Raten aus Roh-Summen berechnet.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-hero col-span-2 row-span-2 flex flex-col justify-between p-5">
          <div className="text-xs font-medium text-white/60">Ad-Spend (Periode)</div>
          <div>
            <div className="text-4xl font-semibold tabular-nums tracking-tight">{eur(t.spend)}</div>
            <div className="mt-1 text-xs text-white/50">
              {eur(t.sales)} PPC-Umsatz · ACoS {t.acos !== null ? `${t.acos} %` : "–"} · ROAS {t.roas !== null ? `${t.roas}×` : "–"}
            </div>
          </div>
        </div>
        {[
          ["Impressionen", fmt(t.impressions)],
          ["Klicks", fmt(t.clicks)],
          ["CTR", t.ctr !== null ? `${t.ctr} %` : "–"],
          ["PPC-CR", t.cvr !== null ? `${t.cvr} %` : "–"],
        ].map(([l, v]) => (
          <div key={l} className="card p-4">
            <div className="stat-value">{v}</div>
            <div className="stat-label">{l}</div>
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="sect-h">Werbung × Business Report</h2>
        {combined ? (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["TACoS", combined.tacos !== null ? `${combined.tacos} %` : "–", "Spend ÷ Gesamtumsatz"],
              ["PPC-Anteil", combined.ppcShare !== null ? `${combined.ppcShare} %` : "–", "PPC-Orders ÷ Bestellungen"],
              ["Org.-CR", combined.orgCvr !== null ? `${combined.orgCvr} %` : "–", "(Orders − PPC) ÷ Sitzungen"],
              ["Organisch-Umsatz", eur(combined.orgRevenue), "Umsatz − PPC-Umsatz (Näherung)"],
            ].map(([l, v, sub]) => (
              <div key={l} className="card p-4">
                <div className="stat-value">{v}</div>
                <div className="stat-label">{l}</div>
                <div className="mt-0.5 text-[10px] text-neutral-400">{sub}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 card border-dashed p-4 text-sm text-muted">
            TACoS, PPC-Anteil und Org.-CR brauchen zusätzlich einen <Link href={`${base}/berichte`} className="text-primary-strong underline">Business Report</Link> derselben Periode.
          </p>
        )}
      </section>

      {byType.length > 1 && (
        <section className="mt-6">
          <h2 className="sect-h">Spend je Anzeigentyp</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {byType.map((g) => (
              <div key={g.type} className="card p-4">
                <div className="stat-value">{eur(g.spend)}</div>
                <div className="stat-label">{g.type === "other" ? "Sonstige" : g.type} · {g.count} Kampagnen · ACoS {g.acos !== null ? `${g.acos} %` : "–"}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {wasted.length > 0 && (
        <section className="mt-6 card p-4">
          <div className="flex items-center justify-between">
            <h2 className="sect-h">Spend ohne Verkäufe — Prüf-Kandidaten</h2>
            <span className="pill pill-warn">{eur(t.noSaleSpend)} · {t.noSaleCount} Kampagnen</span>
          </div>
          <ul className="mt-2 space-y-1">
            {wasted.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{c.name}</span>
                <span className="ml-2 flex-none tabular-nums text-neutral-500">{eur(c.spend)} · {fmt(c.clicks)} Klicks</span>
              </li>
            ))}
            {wasted.length > 6 && <li className="text-xs text-neutral-400">… und {wasted.length - 6} weitere</li>}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">Kampagnen-Ebene ist grob — echte Negativ-Kandidaten liefert der Search-Term-Report (folgt).</p>
        </section>
      )}

      <section className="mt-6">
        <h2 className="sect-h">Kampagnen (nach Spend)</h2>
        <div className="mt-2 card overflow-x-auto p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                <th className="py-1 pr-2">Kampagne</th><th className="pr-2">Typ</th><th className="pr-2">Impr.</th><th className="pr-2">Klicks</th>
                <th className="pr-2">Spend</th><th className="pr-2">PPC-Umsatz</th><th className="pr-2">ACoS</th><th>Ziel</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 25).map((c) => {
                const overTarget = c.acos !== null && c.targetAcos !== null && c.acos > c.targetAcos * 100;
                return (
                  <tr key={c.id} className={`border-b border-hair last:border-0 ${c.spend === 0 && c.impressions === 0 ? "opacity-45" : ""}`}>
                    <td className="max-w-[16rem] truncate py-1.5 pr-2 font-medium">{c.name}</td>
                    <td className="pr-2"><span className="tag">{c.type}</span></td>
                    <td className="pr-2 tabular-nums">{fmt(c.impressions)}</td>
                    <td className="pr-2 tabular-nums">{fmt(c.clicks)}</td>
                    <td className="pr-2 tabular-nums">{eur(c.spend)}</td>
                    <td className="pr-2 tabular-nums">{eur(c.sales)}</td>
                    <td className={`pr-2 tabular-nums ${overTarget ? "text-bad" : ""}`}>{c.acos !== null ? `${c.acos} %` : "–"}</td>
                    <td className="tabular-nums text-neutral-500">{c.targetAcos !== null ? `${Math.round(c.targetAcos * 1000) / 10} %` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {campaigns.length > 25 && <p className="mt-2 text-xs text-neutral-400">Top 25 von {campaigns.length} Kampagnen angezeigt (sortiert nach Spend).</p>}
        </div>
      </section>

      <p className="mt-6 text-xs text-neutral-400">
        Break-even-ACoS-Schwelle folgt mit dem Margen-Modul · N-Gram/Wasted-Spend im Detail folgt mit dem Search-Term-Report · Kampagnen-Builder (Templates → Bulk-Excel) geplant.
      </p>
    </main>
  );
}
