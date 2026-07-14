import Link from "next/link";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { IconKatalog, IconContent, IconSichtbarkeit, IconReviews, IconHandlungen, IconEuro } from "@/components/icons";

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
  // ACoS/TACoS-Ampel gegen die Account-Marge (reporting-main acosColor); ohne Schwelle keine Färbung
  const ampel = (v: number | null) =>
    v === null || brand?.marginPct == null ? "" : v < brand.marginPct ? "text-good" : "text-bad";

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
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="page-title">Cockpit</h1>
      <p className="page-sub">
        Zustand dieser Marke. Umsatz/CVR/Buybox aus dem Business Report, ACoS/TACoS aus dem Ads-Bericht — Trends folgen mit der Historie.
      </p>

      <div className="stagger mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <div className="stagger mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
