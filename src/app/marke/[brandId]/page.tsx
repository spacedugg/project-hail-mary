import Link from "next/link";
import { eq, inArray, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

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

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Cockpit</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Zustand dieser Marke. KPI-Karten (Umsatz, ACoS/TACoS, Funnel) folgen mit der Berichte-Schiene.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-lg border border-neutral-200 p-4 hover:border-teal-600 dark:border-neutral-800">
            <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
            <div className="mt-0.5 text-xs text-neutral-500">{t.label}</div>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Nächste Schritte</h2>
        <ul className="mt-2 space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={s.done ? "text-emerald-600" : "text-neutral-300 dark:text-neutral-600"}>{s.done ? "✓" : "○"}</span>
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
