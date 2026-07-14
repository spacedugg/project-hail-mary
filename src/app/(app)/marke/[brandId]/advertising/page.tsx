import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { saveBrandMargin } from "@/app/actions";
import type { AdsCampaign, AdsTotals } from "@/lib/reports/ads";
import { combineWithBusiness } from "@/lib/reports/ads";
import type { BusinessTotals } from "@/lib/reports/business";
import type { SearchTermRow, SearchTermTotals } from "@/lib/reports/searchterm";
import { ngramRoots, topConverting, negativeCandidates } from "@/lib/reports/searchterm";
import { Donut } from "@/components/charts";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const eur = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n)} €`;
const eur2 = (n: number) => `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
const dateStr = (d: Date | null) => (d ? d.toLocaleDateString("de-DE") : "–");

/** ACoS/TACoS-Ampel (reporting-main acosColor): unter der Marge grün, ab der Marge rot; ohne Schwelle keine Färbung. */
const acosClass = (value: number | null, threshold: number | null) =>
  value === null || threshold === null ? "" : value < threshold ? "text-good" : "text-bad";

/**
 * Advertising / PPC — echte Zahlen aus Ads- und Search-Term-Bericht.
 * ACoS/ROAS/CTR immer aus Roh-Summen (Parser-Prinzip); TACoS/PPC-Anteil/Org-CR
 * entstehen erst aus Ads × Business Report (reporting-main §3.6).
 * Ampel-Schwelle = Account-Marge (Hand-Eintrag; Margen-Rechner folgt).
 */
export default async function AdvertisingPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const { brandId } = await params;
  const { n } = await searchParams;
  const ngramN = n === "2" ? 2 : n === "3" ? 3 : 1;
  const db = await getDb();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  const marginPct = brand?.marginPct ?? null;
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const adsUpload = uploads.find((u) => u.reportType === "ads" && u.parseStatus === "ok");
  const bizUpload = uploads.find((u) => u.reportType === "business" && u.parseStatus === "ok");
  const stUpload = uploads.find((u) => u.reportType === "searchterm" && u.parseStatus === "ok");
  const ads = (adsUpload?.parsed as { campaigns?: AdsCampaign[]; totals?: AdsTotals }) ?? null;
  const biz = (bizUpload?.parsed as { totals?: BusinessTotals })?.totals ?? null;
  const st = (stUpload?.parsed as { rows?: SearchTermRow[]; totals?: SearchTermTotals }) ?? null;
  const base = `/marke/${brandId}`;

  if (!ads?.totals) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="page-title">Advertising / PPC</h1>
        <p className="page-sub">Kampagnen-Portfolio dieser Marke — gespeist aus dem Ads-/Kampagnenbericht.</p>
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
      <h1 className="page-title">Advertising / PPC</h1>
      <p className="page-sub">
        Ads-Bericht {dateStr(adsUpload!.periodStart)} – {dateStr(adsUpload!.periodEnd)} · {t.campaignCount} Kampagnen · Raten aus Roh-Summen berechnet.
      </p>

      <div className="stagger mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card-hero col-span-2 row-span-2 flex flex-col justify-between p-5">
          <div className="text-xs font-medium text-white/60">Ad-Spend (Periode)</div>
          <div>
            <div className="text-4xl font-semibold tabular-nums tracking-tight">{eur(t.spend)}</div>
            <div className="mt-1 text-xs text-white/50">
              {eur(t.sales)} PPC-Umsatz · ACoS{" "}
              <span className={t.acos !== null && marginPct !== null ? (t.acos < marginPct ? "text-emerald-400" : "text-red-400") : ""}>
                {t.acos !== null ? `${t.acos} %` : "–"}
              </span>{" "}
              · ROAS {t.roas !== null ? `${t.roas}×` : "–"}
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
            {([
              ["TACoS", combined.tacos !== null ? `${combined.tacos} %` : "–", "Spend ÷ Gesamtumsatz", acosClass(combined.tacos, marginPct)],
              ["PPC-Anteil", combined.ppcShare !== null ? `${combined.ppcShare} %` : "–", "PPC-Orders ÷ Bestellungen", ""],
              ["Org.-CR", combined.orgCvr !== null ? `${combined.orgCvr} %` : "–", "(Orders − PPC) ÷ Sitzungen", ""],
              ["Organisch-Umsatz", eur(combined.orgRevenue), "Umsatz − PPC-Umsatz (Näherung)", ""],
            ] as const).map(([l, v, sub, cls]) => (
              <div key={l} className="card p-4">
                <div className={`stat-value ${cls}`}>{v}</div>
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

      <section className="mt-6 card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="sect-h">Ampel-Schwelle: Account-Marge / Break-even-ACoS</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {marginPct !== null
                ? `${new Intl.NumberFormat("de-DE").format(marginPct)} % — ACoS/TACoS darunter profitabel (grün), ab der Marge wird Umsatz unprofitabel erkauft (rot).`
                : "Noch keine Marge hinterlegt — ohne Schwelle keine Färbung von ACoS/TACoS. Der volle Margen-Rechner (Gebühren-Tabellen) folgt; bis dahin zählt der Hand-Eintrag."}
            </p>
          </div>
          <form action={saveBrandMargin} className="flex items-center gap-2">
            <input type="hidden" name="brandId" value={brandId} />
            <input
              name="marginPct"
              inputMode="decimal"
              defaultValue={marginPct ?? ""}
              placeholder="z. B. 18,3"
              className="input-base w-28 text-right"
            />
            <span className="text-xs text-neutral-500">%</span>
            <button className="btn-dark text-xs">Speichern</button>
          </form>
        </div>
      </section>

      {byType.length > 1 && (
        <section className="anim-in mt-6 card p-5" style={{ animationDelay: "0.2s" }}>
          <h2 className="sect-h">Spend je Anzeigentyp</h2>
          <div className="mt-4">
            <Donut
              segments={byType.map((g) => ({
                label: g.type === "other" ? "Sonstige" : g.type,
                value: g.spend,
                detail: `${eur(g.spend)} · ACoS ${g.acos !== null ? `${g.acos} %` : "–"}`,
              }))}
              centerValue={eur(t.spend)}
              centerLabel="Ad-Spend"
            />
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
        <h2 className="sect-h">Suchbegriffe & N-Gram {stUpload && <span className="ml-1 font-normal normal-case text-neutral-400">(Search-Term-Report {dateStr(stUpload.periodStart)} – {dateStr(stUpload.periodEnd)})</span>}</h2>
        {st?.totals && st.rows ? (() => {
          const roots = ngramRoots(st.rows, ngramN);
          const conv = topConverting(roots);
          const negs = negativeCandidates(roots);
          const asinWaste = st.rows.filter((r) => r.isAsin && r.spend > 0 && r.orders === 0);
          return (
            <>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="card p-4">
                  <div className="stat-value text-bad">{eur2(st.totals.wastedSpend)}</div>
                  <div className="stat-label">Wasted Spend · {st.totals.zeroOrderTerms} Suchbegriffe ohne Kauf</div>
                </div>
                {[
                  ["davon ASIN-Ziele", eur2(st.totals.asinWastedSpend)],
                  ["Konvertierende Terme", `${fmt(st.totals.convertingTerms)} / ${fmt(st.totals.termCount)}`],
                  ["Suchbegriff-Spend", eur(st.totals.spend)],
                ].map(([l, v]) => (
                  <div key={l} className="card p-4">
                    <div className="stat-value">{v}</div>
                    <div className="stat-label">{l}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">Wort-Muster:</span>
                {([1, 2, 3] as const).map((k) => (
                  <Link
                    key={k}
                    href={`${base}/advertising?n=${k}`}
                    className={k === ngramN ? "btn-primary px-3 py-1 text-xs" : "btn-ghost px-3 py-1 text-xs"}
                  >
                    {k}-Wort
                  </Link>
                ))}
                <span className="text-xs text-neutral-400">· {fmt(roots.length)} Wurzeln · ASIN-Ziele ausgeschlossen</span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="card p-4">
                  <h3 className="text-sm font-medium">↗ Top Converting Intent</h3>
                  <ul className="mt-2 space-y-1">
                    {conv.map((r) => (
                      <li key={r.root} className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{r.root}</span>
                        <span className="ml-2 flex-none tabular-nums text-neutral-500">{eur(r.sales)} · {fmt(r.orders)} Orders</span>
                      </li>
                    ))}
                    {conv.length === 0 && <li className="text-xs text-neutral-400">Keine konvertierenden Wurzeln in diesem Muster.</li>}
                  </ul>
                </div>
                <div className="card p-4">
                  <h3 className="text-sm font-medium">↘ Negativ-Kandidaten</h3>
                  <ul className="mt-2 space-y-1">
                    {negs.map((r) => (
                      <li key={r.root} className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{r.root}</span>
                        <span className="ml-2 flex-none tabular-nums text-neutral-500">{eur2(r.spend)} · 0 Orders</span>
                      </li>
                    ))}
                    {negs.length === 0 && <li className="text-xs text-neutral-400">Keine budgetfressenden Wurzeln — sauber!</li>}
                  </ul>
                </div>
              </div>

              <div className="mt-3 card overflow-x-auto p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                      <th className="py-1 pr-2">Wurzel</th><th className="pr-2">Freq.</th><th className="pr-2">Impr.</th><th className="pr-2">Klicks</th>
                      <th className="pr-2">Spend</th><th className="pr-2">Umsatz</th><th className="pr-2">Orders</th><th className="pr-2">CVR</th><th>ACoS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roots.slice(0, 20).map((r) => (
                      <tr key={r.root} className="border-b border-hair last:border-0">
                        <td className="max-w-[14rem] truncate py-1.5 pr-2 font-medium">{r.root}</td>
                        <td className="pr-2 tabular-nums">{fmt(r.frequency)}</td>
                        <td className="pr-2 tabular-nums">{fmt(r.impressions)}</td>
                        <td className="pr-2 tabular-nums">{fmt(r.clicks)}</td>
                        <td className="pr-2 tabular-nums">{eur2(r.spend)}</td>
                        <td className="pr-2 tabular-nums">{eur(r.sales)}</td>
                        <td className="pr-2 tabular-nums">{fmt(r.orders)}</td>
                        <td className="pr-2 tabular-nums">{r.cvr !== null ? `${r.cvr} %` : "–"}</td>
                        <td className={`tabular-nums ${r.orders === 0 && r.spend > 0 ? "text-bad" : r.sales > 0 ? "text-good" : ""}`}>
                          {r.acos !== null ? `${r.acos} %` : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {roots.length > 20 && <p className="mt-2 text-xs text-neutral-400">Top 20 von {fmt(roots.length)} Wurzeln (sortiert nach Spend).</p>}
              </div>

              {asinWaste.length > 0 && (
                <div className="mt-3 card p-4">
                  <h3 className="text-sm font-medium">ASIN-Ziele ohne Conversion</h3>
                  <ul className="mt-2 space-y-1">
                    {asinWaste.slice(0, 6).map((r) => (
                      <li key={r.term} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs uppercase">{r.term}</span>
                        <span className="ml-2 flex-none tabular-nums text-neutral-500">{r.campaign && `${r.campaign} · `}{eur2(r.spend)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          );
        })() : (
          <p className="mt-2 card border-dashed p-4 text-sm text-muted">
            Noch kein Search-Term-Report — unter <Link href={`${base}/berichte`} className="text-primary-strong underline">Berichte & Daten</Link> hochladen
            (Werbekonsole → Berichte → Suchbegriff, Sponsored Products). Dann erscheinen hier Wasted Spend, N-Gram-Wurzeln und echte Negativ-Kandidaten.
          </p>
        )}
      </section>

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
        Voller Margen-Rechner (Gebühren-Tabellen, Break-even je Produkt) folgt · Kampagnen-Builder (Templates → Bulk-Excel) geplant.
      </p>
    </main>
  );
}
