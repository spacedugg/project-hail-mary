import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SovAudit } from "@/lib/sov/audit";
import type { SqpReport } from "@/lib/reports/sqp";

export const dynamic = "force-dynamic";

/** Sichtbarkeit & Markt — SOV-Audits je Produkt + SQP-Funnel vs. Markt; Opportunity-Matrix folgt. */
export default async function BrandSichtbarkeit({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const audits = uploads
    .filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok" && u.parsed)
    .map((u) => ({ u, productId: (u.parsed as { productId?: string }).productId, audit: (u.parsed as { audit?: SovAudit }).audit }))
    .filter((x) => x.audit);
  const sqpUpload = uploads.find((u) => u.reportType === "sqp" && u.parseStatus === "ok");
  const sqp = (sqpUpload?.parsed as SqpReport | null) ?? null;
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
  const eur = (n: number) => `${fmt(Math.round(n))} €`;
  const dateStr = (d: Date | null) => (d ? d.toLocaleDateString("de-DE") : "–");

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Sichtbarkeit & Markt</h1>
      <p className="mt-1 text-sm text-neutral-500">Share of Voice je Produkt (Cerebro) + Suchanfragen-Funnel vs. Markt (SQP). Opportunity-Matrix folgt.</p>

      <section className="mt-6">
        <h2 className="sect-h">
          Funnel vs. Markt {sqpUpload && <span className="ml-1 font-normal normal-case text-neutral-400">(SQP {sqp?.meta.period ?? ""} · {dateStr(sqpUpload.periodStart)} – {dateStr(sqpUpload.periodEnd)})</span>}
        </h2>
        {sqp ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ["Eure CTR", sqp.totals.brandCtr, sqp.totals.marketCtr],
                ["Eure CVR", sqp.totals.brandCvr, sqp.totals.marketCvr],
              ] as const).map(([l, own, market]) => (
                <div key={l} className="card p-4">
                  <div className="stat-value">{own !== null ? `${own} %` : "–"}</div>
                  <div className="stat-label">{l} · Markt {market !== null ? `${market} %` : "–"}</div>
                </div>
              ))}
              <div className="card p-4">
                <div className="stat-value">{eur(sqp.totals.brandRevenue)}</div>
                <div className="stat-label">Geschätzter Markenumsatz ({fmt(sqp.totals.purchasesBrand)} Käufe)</div>
              </div>
              <div className="card p-4">
                <div className="stat-value">{eur(sqp.totals.totalPotential)}</div>
                <div className="stat-label">Umsatzpotenzial (Conversion-Lücke × Preis)</div>
              </div>
            </div>
            <div className="mt-3 card overflow-x-auto p-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hair text-left text-[11px] uppercase text-neutral-500">
                    <th className="py-1 pr-2">Suchanfrage</th><th className="pr-2">Volumen</th><th className="pr-2">Sichtbarkeit</th>
                    <th className="pr-2">Eure CVR</th><th className="pr-2">Markt-CVR</th><th className="pr-2">Δ pp</th><th>Potenzial</th>
                  </tr>
                </thead>
                <tbody>
                  {sqp.rows.slice(0, 15).map((r) => (
                    <tr key={r.query} className="border-b border-hair last:border-0">
                      <td className="max-w-[14rem] truncate py-1.5 pr-2 font-medium">{r.query}</td>
                      <td className="pr-2 tabular-nums">{fmt(r.volume)}</td>
                      <td className="pr-2 tabular-nums">{r.imprShare !== null ? `${r.imprShare} %` : "–"}</td>
                      <td className="pr-2 tabular-nums">{r.brandCvr !== null ? `${r.brandCvr} %` : "–"}</td>
                      <td className="pr-2 tabular-nums">{r.marketCvr !== null ? `${r.marketCvr} %` : "–"}</td>
                      <td className="pr-2 tabular-nums">{r.cvrDeltaPp !== null ? `${r.cvrDeltaPp > 0 ? "+" : ""}${r.cvrDeltaPp}` : "–"}</td>
                      <td className="tabular-nums">{r.revenuePotential > 0 ? eur(r.revenuePotential) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sqp.rows.length > 15 && <p className="mt-2 text-xs text-neutral-400">Top 15 von {fmt(sqp.totals.rowCount)} Suchanfragen (sortiert nach Potenzial).</p>}
            </div>
          </>
        ) : (
          <p className="mt-2 card border-dashed p-4 text-sm text-muted">
            Noch kein SQP-Bericht — unter <Link href={`/marke/${brandId}/berichte`} className="text-primary-strong underline">Berichte & Daten</Link> hochladen
            (Seller Central → Markenanalysen → Suchanfragenleistung, Markenansicht). Dann erscheinen hier CTR/CVR vs. Markt und das Umsatzpotenzial je Suchanfrage.
          </p>
        )}
      </section>

      <h2 className="mt-8 sect-h">Share of Voice je Produkt</h2>
      {audits.length === 0 && (
        <p className="mt-2 card border-dashed p-6 text-sm text-muted">
          Noch kein SOV-Audit. Cerebro-CSV am Produkt hochladen (Katalog → Produkt → 2b).
        </p>
      )}

      <div className="mt-2 space-y-3">
        {audits.map(({ u, productId, audit }) => {
          const p = products.find((x) => x.id === productId);
          const a = audit!;
          return (
            <div key={u.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{p?.name ?? "Produkt"} <span className="font-mono text-xs text-neutral-500">{a.mainAsin}</span></div>
                {p && <Link href={`/produkte/${p.id}/analyse`} className="text-xs text-primary-strong hover:underline">Analyse →</Link>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["Eigener SOV", `${a.brandSOV} %`],
                  ["Top-Comp", a.topCompetitor ? `${a.topCompetitor.sov} %` : "–"],
                  ["Top-10-Abdeckung", `${a.top10Coverage} %`],
                  ["Quick Wins", String(a.quickWins.length)],
                  ["Korridor €/Mo", a.totalCorridor.high ? `${fmt(a.totalCorridor.low)}–${fmt(a.totalCorridor.high)}` : "–"],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-hair p-2">
                    <div className="text-sm font-semibold tabular-nums">{v}</div>
                    <div className="text-[10px] text-neutral-500">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
