import Link from "next/link";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { IconHandlungen, IconArrowRight } from "@/components/icons";
import { TrendLine, StackedBars, Sparkline } from "@/components/charts";
import { buildTrendRows } from "@/lib/reports/trends";
import { diagnosePeriods } from "@/lib/reports/diagnose";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const fmt1 = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

/**
 * KPI-Hierarchie (Nutzer-Vorgabe): 1. Umsatz mit Organisch/PPC-Split + Delta,
 * Handlungen & Hebel — 2. Kern-KPIs mit Sparkline + Trend-Badge (echte
 * Zeitreihe) — 3. Diagnose & Verläufe — 4. Datenbestand nur als Fußzeile.
 */
export default async function BrandCockpit({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const pids = products.map((p) => p.id);

  const versions = pids.length
    ? await db.query.contentVersions.findMany({ where: inArray(schema.contentVersions.productId, pids), orderBy: desc(schema.contentVersions.createdAt) })
    : [];
  const insights = pids.length
    ? await db.query.reviewInsights.findMany({ where: inArray(schema.reviewInsights.productId, pids) })
    : [];
  const uploads = await db.query.reportUploads.findMany({ where: eq(schema.reportUploads.brandId, brandId) });
  const brandActions = await db.query.actions.findMany({ where: eq(schema.actions.brandId, brandId) });

  // Content-Accuracy fürs Cockpit — dieselbe Rechnung wie im CMS, keine zweite Quelle.
  const { ladeMarkenCms, ladeLiveScores } = await import("@/lib/cms/laden");
  const cms = await ladeMarkenCms(brandId);
  const cmsAccuracy = cms?.accuracyPct ?? null;
  const liveSchnitt = (await ladeLiveScores(brandId)).schnitt;
  const offeneContentAlerts = (
    await db.query.contentAlerts.findMany({ where: eq(schema.contentAlerts.brandId, brandId) })
  ).filter((a) => a.status === "offen").length;
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });

  // Ampel-Schwelle: Account-Marge (Hand) → sonst Ø Break-even-ACoS der Produkt-Kalkulationen
  const beps = products.map((p) => p.marginCalc?.results.breakEvenAcos).filter((x): x is number => x !== undefined);
  const threshold = brand?.marginPct ?? (beps.length ? beps.reduce((s, x) => s + x, 0) / beps.length : null);
  const ampel = (v: number | null) => (v === null || threshold === null ? "" : v < threshold ? "text-good" : "text-bad");

  const trendRows = buildTrendRows(uploads);
  const curr = trendRows[trendRows.length - 1];
  const prev = trendRows.length >= 2 ? trendRows[trendRows.length - 2] : undefined;

  // Perioden-Diagnose (D64) mit SOV-Kontext
  const sovAudits = uploads
    .filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok")
    .map((u) => (u.parsed as { audit?: import("@/lib/sov/audit").SovAudit }).audit)
    .filter((a): a is import("@/lib/sov/audit").SovAudit => Boolean(a));
  const diag = diagnosePeriods(trendRows, {
    sovQuickWins: sovAudits.reduce((s, a) => s + a.quickWins.length, 0),
    sovGapEur: sovAudits.reduce((s, a) => s + a.totalCorridor.high, 0),
    breakEven: threshold,
  });
  const fmtEurS = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(Math.round(n)))} €`;

  const openActions = brandActions.filter((a) => a.status !== "done");
  const upliftSum = openActions.reduce((s, a) => s + (a.upliftEur ?? 0), 0);
  const base = `/marke/${brandId}`;

  const revDeltaPct = curr && prev && prev.revenue > 0 ? ((curr.revenue / prev.revenue - 1) * 100) : null;

  /** Kern-KPIs: Wert der letzten Periode + Sparkline über alle Perioden + Δ-Badge (pp). */
  const kpis = curr
    ? ([
        { label: "ACoS", value: curr.acos, series: trendRows.map((r) => r.acos), goodWhenDown: true, cls: ampel(curr.acos) },
        { label: "TACoS", value: curr.tacos, series: trendRows.map((r) => r.tacos), goodWhenDown: true, cls: ampel(curr.tacos) },
        { label: "CVR", value: curr.cvr, series: trendRows.map((r) => r.cvr), goodWhenDown: false, cls: "" },
        { label: "Buybox", value: curr.buyBoxPct, series: trendRows.map((r) => r.buyBoxPct), goodWhenDown: false, cls: "" },
      ] as const)
    : [];

  const badge = (currV: number | null, prevV: number | null | undefined, goodWhenDown: boolean) => {
    if (currV === null || prevV === null || prevV === undefined) return null;
    const d = Math.round((currV - prevV) * 10) / 10;
    if (Math.abs(d) < 0.05) return <span className="pill pill-neutral">→ 0,0 pp</span>;
    const good = goodWhenDown ? d < 0 : d > 0;
    return <span className={`pill ${good ? "pill-good" : "pill-bad"}`}>{d > 0 ? "↑" : "↓"} {fmt1(Math.abs(d))} pp</span>;
  };

  const dataInventory = [
    [products.length, "Produkte", `${base}/katalog`],
    [new Set(versions.map((v) => v.productId)).size, "mit Content", `${base}/katalog`],
    [uploads.filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok").length, "SOV-Audits", `${base}/sichtbarkeit`],
    [insights.length, "Review-Insights", `${base}/katalog`],
    [trendRows.length, "Berichts-Perioden", `${base}/berichte`],
  ] as const;

  return (
    <main className="w-full p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="page-title">Cockpit</h1>
          <p className="page-sub">
            {curr ? `Periode ${curr.label}` : "Noch keine Berichts-Periode"} · amazon.de
            {threshold !== null && ` · Break-even ${fmt1(threshold)} %`}
          </p>
        </div>
      </div>

      {/* Retail-Readiness: Content-Accuracy als Kachel fürs Cockpit (Bauplan CMS).
          Steht bewusst VOR den Umsatz-Kacheln und unabhängig von Berichts-Perioden —
          sie ist auch dann aussagekräftig, wenn noch kein Bericht hochgeladen ist. */}
      <div className="stagger mt-5 grid gap-3 sm:grid-cols-2">
        <Link href={`${base}/publish/alerts`} className="card group flex items-center justify-between gap-3 p-5">
          <div>
            <div className="stat-label">Retail-Readiness · Live-Qualität</div>
            <div className={`stat-value ${liveSchnitt === null ? "" : liveSchnitt >= 80 ? "text-good" : "text-bad"}`}>
              {liveSchnitt === null ? "–" : `${liveSchnitt}/100`}
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {liveSchnitt === null
                ? "Nicht messbar — noch kein gecrawlter Live-Stand"
                : `Qualität des Live-Stands · retail-ready ab 80${cmsAccuracy !== null ? ` · ${cmsAccuracy} % unseres Solls live` : ""}`}
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong transition group-hover:gap-2">
            öffnen <IconArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
        <Link href={`${base}/publish/alerts`} className="card group flex items-center justify-between gap-3 p-5">
          <div>
            <div className="stat-label">Offene Content-Alerts</div>
            <div className={`stat-value ${offeneContentAlerts > 0 ? "text-bad" : "text-good"}`}>{offeneContentAlerts}</div>
            <div className="mt-0.5 text-xs text-muted">
              {offeneContentAlerts > 0 ? "Hauptbild weg, Text überschrieben, Listing leer" : "Keine Abweichung zum freigegebenen Stand"}
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong transition group-hover:gap-2">
            öffnen <IconArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </div>

      {curr ? (
        <>
          {/* 1 · Hero: Umsatz + Split + Handlungen/Hebel */}
          <div className="stagger mt-6 grid gap-3 lg:grid-cols-3">
            <div className="card-hero flex flex-col justify-between p-6 lg:col-span-2">
              <div className="flex items-start justify-between">
                <div className="text-xs font-medium text-white/60">Umsatz ({curr.label})</div>
                {revDeltaPct !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${revDeltaPct >= 0 ? "bg-emerald-400/20 text-emerald-300" : "bg-red-400/20 text-red-300"}`}>
                    {revDeltaPct >= 0 ? "↑" : "↓"} {fmt1(Math.abs(revDeltaPct))} % vs. Vorperiode
                  </span>
                )}
              </div>
              <div>
                <div className="text-5xl font-semibold tabular-nums tracking-tight">{fmt(Math.round(curr.revenue))} €</div>
                {curr.orgRevenue !== null && curr.ppcSales !== null ? (
                  <div className="mt-3">
                    <div className="flex h-2.5 w-full max-w-md overflow-hidden rounded-full bg-white/10">
                      <div className="bar-fill h-full rounded-l-full" style={{ width: `${(curr.orgRevenue / curr.revenue) * 100}%`, background: "var(--cat-2)" }} />
                      <div className="bar-fill h-full" style={{ width: `${(Math.min(curr.ppcSales, curr.revenue) / curr.revenue) * 100}%`, background: "var(--cat-1)", marginLeft: 2 }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/70">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--cat-2)" }} /> Organisch {fmt(Math.round(curr.orgRevenue))} € ({fmt1((curr.orgRevenue / curr.revenue) * 100)} %)</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--cat-1)" }} /> PPC {fmt(Math.round(curr.ppcSales))} € ({fmt1((curr.ppcSales / curr.revenue) * 100)} %)</span>
                      <span className="text-white/40">{fmt(curr.orders)} Bestellungen · Ø {fmt1(curr.revenue / curr.orders)} € AOV</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-white/50">{fmt(curr.orders)} Bestellungen · Organisch/PPC-Split braucht den Ads-Bericht der Periode</div>
                )}
              </div>
            </div>
            <Link href={`${base}/handlungen`} className="card group flex flex-col justify-between p-5">
              <div className="flex items-center justify-between">
                <span className="icon-chip chip-violet"><IconHandlungen /></span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-strong transition group-hover:gap-2">öffnen <IconArrowRight className="h-3.5 w-3.5" /></span>
              </div>
              <div>
                <div className="stat-value !text-3xl">{openActions.length}</div>
                <div className="stat-label">Offene Handlungen{upliftSum > 0 && <> · Hebel ~<b className="text-foreground">{fmt(upliftSum)} €/Mo</b> (indikativ, Quelle je Handlung)</>}</div>
              </div>
            </Link>
          </div>

          {/* 2 · Kern-KPIs mit Sparkline + Trend-Badge */}
          <div className="stagger mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {kpis.map((k) => {
              const series = k.series.filter((v): v is number => v !== null);
              return (
                <div key={k.label} className="card flex items-center justify-between gap-2 p-4">
                  <div>
                    <div className="stat-label">{k.label}</div>
                    <div className={`stat-value ${k.cls}`}>{k.value !== null ? `${fmt1(k.value)} %` : "–"}</div>
                    <div className="mt-1">{badge(k.value, prev?.[k.label === "ACoS" ? "acos" : k.label === "TACoS" ? "tacos" : k.label === "CVR" ? "cvr" : "buyBoxPct"], k.goodWhenDown)}</div>
                  </div>
                  <Sparkline values={series} color={k.label === "CVR" || k.label === "Buybox" ? "var(--cat-2)" : "var(--cat-1)"} />
                </div>
              );
            })}
          </div>

          {/* 3 · Diagnose + Verläufe */}
          {diag && (
            <div className="anim-in mt-3 card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Was hat sich verändert — und warum? <span className="font-normal text-muted">({diag.vorher} → {diag.nachher})</span></h3>
                {diag.decomposition && (
                  <span className={`text-lg font-semibold tabular-nums ${diag.decomposition.deltaEur >= 0 ? "text-good" : "text-bad"}`}>
                    {fmtEurS(diag.decomposition.deltaEur)} <span className="text-xs font-normal text-muted">({diag.decomposition.deltaPct >= 0 ? "+" : ""}{diag.decomposition.deltaPct} %)</span>
                  </span>
                )}
              </div>
              {diag.decomposition && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {diag.decomposition.factors.map((f) => {
                    const maxAbs = Math.max(...diag.decomposition!.factors.map((x) => Math.abs(x.eur)), 1);
                    return (
                      <div key={f.key} className="rounded-xl border border-hair p-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-medium">{f.label}</span>
                          <span className={`text-sm font-semibold tabular-nums ${f.eur > 0 ? "text-good" : f.eur < 0 ? "text-bad" : "text-muted"}`}>{fmtEurS(f.eur)}</span>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hair">
                          <div className={`bar-fill h-full rounded-full ${f.eur >= 0 ? "bg-good" : "bg-bad"}`} style={{ width: `${Math.max(3, (Math.abs(f.eur) / maxAbs) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <ul className="mt-4 space-y-2">
                {diag.findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={`pill flex-none pill-${f.severity === "good" ? "good" : f.severity === "warn" ? "warn" : "bad"}`}>
                      {f.severity === "good" ? "✓" : f.severity === "warn" ? "△" : "!"}
                    </span>
                    <span><b>{f.befund}</b> <span className="text-muted">— {f.evidenz}.</span> <span className="text-primary-strong">Nächster Schritt: {f.nextStep}.</span></span>
                  </li>
                ))}
                {diag.findings.length === 0 && <li className="text-sm text-muted">Keine auffälligen Bewegungen zwischen den Perioden.</li>}
              </ul>
            </div>
          )}

          {trendRows.length >= 2 && (
            <div className="stagger mt-3 grid gap-3 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="text-sm font-medium">Umsatz-Split je Periode <span className="text-xs font-normal text-muted">· Organisch = Umsatz − PPC (Näherung)</span></h3>
                <div className="mt-3">
                  <StackedBars
                    periods={trendRows.map((r) => ({ label: r.label, segments: [r.ppcSales ?? 0, r.orgRevenue ?? Math.max(0, r.revenue - (r.ppcSales ?? 0))] }))}
                    legend={["PPC-Umsatz", "Organisch"]}
                    unit=" €"
                  />
                </div>
              </div>
              {trendRows.filter((r) => r.acos !== null).length >= 2 ? (
                <div className="card p-4">
                  <h3 className="text-sm font-medium">ACoS je Periode {threshold !== null && <span className="text-xs font-normal text-muted">· Referenz: Break-even {fmt1(threshold)} %</span>}</h3>
                  <div className="mt-2">
                    <TrendLine
                      points={trendRows.filter((r) => r.acos !== null).map((r) => ({ label: r.label, value: r.acos! }))}
                      unit=" %"
                      color="var(--cat-1)"
                      refLine={threshold !== null ? { value: threshold, label: "Break-even" } : undefined}
                    />
                  </div>
                </div>
              ) : (
                <div className="card border-dashed p-4 text-sm text-muted">ACoS-Verlauf braucht Ads-Berichte zu den Perioden.</div>
              )}
              <div className="card p-4">
                <h3 className="text-sm font-medium">CVR je Periode</h3>
                <div className="mt-2">
                  <TrendLine points={trendRows.filter((r) => r.cvr !== null).map((r) => ({ label: r.label, value: r.cvr! }))} unit=" %" color="var(--cat-2)" />
                </div>
              </div>
              {trendRows.filter((r) => r.tacos !== null).length >= 2 && (
                <div className="card p-4">
                  <h3 className="text-sm font-medium">TACoS je Periode {threshold !== null && <span className="text-xs font-normal text-muted">· Referenz: Break-even {fmt1(threshold)} %</span>}</h3>
                  <div className="mt-2">
                    <TrendLine
                      points={trendRows.filter((r) => r.tacos !== null).map((r) => ({ label: r.label, value: r.tacos! }))}
                      unit=" %"
                      color="var(--cat-1)"
                      refLine={threshold !== null ? { value: threshold, label: "Break-even" } : undefined}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 card border-dashed p-6 text-sm text-muted">
          Noch keine Berichts-Periode. Unter <Link href={`${base}/berichte`} className="text-primary-strong underline">Berichte & Daten</Link> Business Report
          (+ Ads-Bericht) hochladen — dann erscheinen hier Umsatz mit Organisch/PPC-Split, ACoS/TACoS/CVR mit Verlauf und die Perioden-Diagnose.
        </div>
      )}

      {/* 4 · Datenbestand — bewusst klein (Meta, keine KPI) */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="font-medium uppercase tracking-wide">Datenbestand</span>
        {dataInventory.map(([v, l, href]) => (
          <Link key={l} href={href} className="transition hover:text-primary-strong"><b className="text-foreground">{v}</b> {l}</Link>
        ))}
      </div>
    </main>
  );
}
