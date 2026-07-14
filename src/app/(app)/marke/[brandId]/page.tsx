import Link from "next/link";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { IconKatalog, IconContent, IconSichtbarkeit, IconReviews, IconHandlungen, IconEuro } from "@/components/icons";
import { TrendLine } from "@/components/charts";
import { buildTrendRows } from "@/lib/reports/trends";
import { diagnosePeriods } from "@/lib/reports/diagnose";

export const dynamic = "force-dynamic";

/** Marken-Cockpit: Zustand DIESER Marke + nächste Schritte. */
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
  const businessUpload = uploads.find((u) => u.reportType === "business" && u.parseStatus === "ok");
  const biz = (businessUpload?.parsed as { totals?: import("@/lib/reports/business").BusinessTotals })?.totals ?? null;
  const adsUpload = uploads.find((u) => u.reportType === "ads" && u.parseStatus === "ok");
  const adsTotals = (adsUpload?.parsed as { totals?: import("@/lib/reports/ads").AdsTotals })?.totals ?? null;
  const combined = biz && adsTotals
    ? (await import("@/lib/reports/ads")).combineWithBusiness(adsTotals, { revenue: biz.revenue, sessions: biz.sessions, orders: biz.orders })
    : null;
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, brandId) });
  // ACoS/TACoS-Ampel (reporting-main-Priorität): Account-Marge, sonst Ø Break-even-ACoS der Produkt-Kalkulationen
  const beps = products.map((p) => p.marginCalc?.results.breakEvenAcos).filter((x): x is number => x !== undefined);
  const threshold = brand?.marginPct ?? (beps.length ? beps.reduce((s, x) => s + x, 0) / beps.length : null);
  const ampel = (v: number | null) => (v === null || threshold === null ? "" : v < threshold ? "text-good" : "text-bad");
  const trendRows = buildTrendRows(uploads);

  // Perioden-Diagnose (D64): Ursachen quer über die Module — SOV-Kontext aus den Audits der Marke
  const sovAudits = uploads
    .filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok")
    .map((u) => (u.parsed as { audit?: import("@/lib/sov/audit").SovAudit }).audit)
    .filter((a): a is import("@/lib/sov/audit").SovAudit => Boolean(a));
  const diag = diagnosePeriods(trendRows, {
    sovQuickWins: sovAudits.reduce((s, a) => s + a.quickWins.length, 0),
    sovGapEur: sovAudits.reduce((s, a) => s + a.totalCorridor.high, 0),
    breakEven: threshold,
  });
  const fmtEurS = (n: number) => `${n >= 0 ? "+" : "−"}${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n))} €`;

  const withContent = new Set(versions.map((v) => v.productId)).size;
  const sovCount = uploads.filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok").length;
  const openActions = brandActions.filter((a) => a.status !== "done");
  const upliftSum = openActions.reduce((s, a) => s + (a.upliftEur ?? 0), 0);

  const base = `/marke/${brandId}`;
  const tiles = [
    { label: "Produkte (ASINs)", value: products.length, href: `${base}/katalog` },
    { label: "mit Content", value: withContent, href: `${base}/katalog` },
    { label: "SOV-Audits", value: sovCount, href: `${base}/sichtbarkeit` },
    { label: "Review-Insights", value: insights.length, href: `${base}/katalog` },
    { label: "Offene Handlungen", value: openActions.length, href: `${base}/handlungen` },
    { label: "Hebel offen (€/Mo)", value: upliftSum ? new Intl.NumberFormat("de-DE").format(upliftSum) : "–", href: `${base}/handlungen` },
  ];

  const steps = [
    { done: products.length > 0, text: "Produkt (bestehende ASIN) anlegen", href: `${base}/katalog` },
    { done: sovCount > 0, text: "Cerebro-CSV hochladen → SOV-Audit", href: `${base}/katalog` },
    { done: insights.length > 0, text: "Reviews analysieren (Apify)", href: `${base}/katalog` },
    { done: versions.length > 0, text: "Content generieren (Titel → Q&A)", href: `${base}/katalog` },
    { done: brandActions.length > 0, text: "Handlungen aus Analysen ableiten", href: `${base}/handlungen` },
  ];

  const tileChips = [
    { icon: <IconKatalog />, chip: "chip-violet" },
    { icon: <IconContent />, chip: "chip-teal" },
    { icon: <IconSichtbarkeit />, chip: "chip-pink" },
    { icon: <IconReviews />, chip: "chip-amber" },
    { icon: <IconHandlungen />, chip: "chip-violet" },
    { icon: <IconEuro />, chip: "chip-teal" },
  ];

  return (
    <main className="w-full p-8">
      <h1 className="page-title">Cockpit</h1>
      <p className="page-sub">
        Zustand dieser Marke. Umsatz/CVR/Buybox aus dem Business Report, ACoS/TACoS aus dem Ads-Bericht — Trends folgen mit der Historie.
      </p>

      <div className="stagger mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t, i) => (
          <Link key={t.label} href={t.href} className="card flex items-center gap-3 p-4">
            <span className={`icon-chip ${tileChips[i].chip}`}>{tileChips[i].icon}</span>
            <div className="min-w-0">
              <div className="stat-value">{t.value}</div>
              <div className="stat-label truncate">{t.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="sect-h">
          Performance {businessUpload && <span className="ml-1 font-normal normal-case text-neutral-400">(Business Report {businessUpload.periodStart?.toLocaleDateString("de-DE")} – {businessUpload.periodEnd?.toLocaleDateString("de-DE")})</span>}
        </h2>
        {biz ? (
          <div className="stagger mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            <div className="card-hero col-span-2 row-span-2 flex flex-col justify-between p-5 sm:col-span-2">
              <div className="text-xs font-medium text-white/60">Umsatz (Periode)</div>
              <div>
                <div className="text-4xl font-semibold tabular-nums tracking-tight">
                  {new Intl.NumberFormat("de-DE").format(Math.round(biz.revenue))} €
                </div>
                <div className="mt-1 text-xs text-white/50">
                  {new Intl.NumberFormat("de-DE").format(biz.orders)} Bestellungen · Ø {biz.orders ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(biz.revenue / biz.orders) : "–"} € AOV
                </div>
              </div>
            </div>
            {([
              ["Einheiten", new Intl.NumberFormat("de-DE").format(biz.units), ""],
              ["Sitzungen", new Intl.NumberFormat("de-DE").format(biz.sessions), ""],
              ["CVR", biz.cvr !== null ? `${biz.cvr} %` : "–", ""],
              ["Buybox", biz.buyBoxPct !== null ? `${biz.buyBoxPct} %` : "–", ""],
              ...(adsTotals ? [["ACoS", adsTotals.acos !== null ? `${adsTotals.acos} %` : "–", ampel(adsTotals.acos)] as const] : []),
              ...(combined ? [["TACoS", combined.tacos !== null ? `${combined.tacos} %` : "–", ampel(combined.tacos)] as const] : []),
            ] as ReadonlyArray<readonly [string, string, string]>).map(([l, v, cls]) => (
              <div key={l} className="card p-4">
                <div className={`stat-value ${cls}`}>{v}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 card border-dashed p-4 text-sm text-muted">
            Noch kein Business Report — unter <Link href={`${base}/berichte`} className="text-primary-strong underline">Berichte & Daten</Link> hochladen, dann erscheinen hier Umsatz, CVR & Buybox. ACoS/TACoS folgen mit dem Ads-Bericht.
          </p>
        )}
      </section>

      {/* Verlauf über Perioden (reporting-main: Trendkarten nur ab 2 Punkten — keine Fake-Trends) */}
      {trendRows.length >= 2 ? (
        <section className="mt-8">
          <h2 className="sect-h">Verlauf <span className="ml-1 font-normal normal-case text-neutral-400">({trendRows.length} Perioden)</span></h2>

          {diag && (
            <div className="anim-in mt-2 card p-5">
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
                          <div
                            className={`bar-fill h-full rounded-full ${f.eur >= 0 ? "bg-good" : "bg-bad"}`}
                            style={{ width: `${Math.max(3, (Math.abs(f.eur) / maxAbs) * 100)}%` }}
                          />
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
                    <span>
                      <b>{f.befund}</b>{" "}
                      <span className="text-muted">— {f.evidenz}.</span>{" "}
                      <span className="text-primary-strong">Nächster Schritt: {f.nextStep}.</span>
                    </span>
                  </li>
                ))}
                {diag.findings.length === 0 && <li className="text-sm text-muted">Keine auffälligen Bewegungen zwischen den Perioden.</li>}
              </ul>
              <p className="mt-3 text-[11px] text-muted">Zerlegung: Umsatz = Sitzungen × CVR × AOV (ln-Anteile, Summe = Gesamt-Delta) — Formel im Rechenwerk.</p>
            </div>
          )}

          <div className="stagger mt-3 grid gap-3 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="text-sm font-medium">Umsatz je Periode</h3>
              <div className="mt-2">
                <TrendLine points={trendRows.map((r) => ({ label: r.label, value: Math.round(r.revenue) }))} unit=" €" color="var(--cat-2)" />
              </div>
            </div>
            {trendRows.filter((r) => r.tacos !== null).length >= 2 ? (
              <div className="card p-4">
                <h3 className="text-sm font-medium">TACoS je Periode {threshold !== null && <span className="text-xs font-normal text-muted">· Referenz: Break-even {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(threshold)} %</span>}</h3>
                <div className="mt-2">
                  <TrendLine
                    points={trendRows.filter((r) => r.tacos !== null).map((r) => ({ label: r.label, value: r.tacos! }))}
                    unit=" %"
                    color="var(--cat-1)"
                    refLine={threshold !== null ? { value: threshold, label: "Break-even" } : undefined}
                  />
                </div>
              </div>
            ) : (
              <div className="card border-dashed p-4 text-sm text-muted">
                TACoS-Verlauf braucht Ads-Berichte zu den Perioden — unter <Link href={`${base}/berichte`} className="text-primary-strong underline">Berichte & Daten</Link> nachladen.
              </div>
            )}
          </div>
        </section>
      ) : biz ? (
        <p className="mt-8 text-xs text-muted">
          Verlaufslinien erscheinen, sobald Berichte für mindestens 2 Perioden vorliegen (Berichte & Daten → weitere Perioden hochladen).
        </p>
      ) : null}

      <section className="mt-8 card p-4">
        <h2 className="sect-h">Nächste Schritte</h2>
        <ul className="mt-2 space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={s.done ? "text-good" : "text-muted opacity-50"}>{s.done ? "✓" : "○"}</span>
              <Link href={s.href} className={s.done ? "text-neutral-400 line-through" : "text-neutral-800 hover:underline dark:text-neutral-200"}>
                {s.text}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
