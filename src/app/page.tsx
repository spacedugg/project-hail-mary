import Link from "next/link";
import { getDb, schema } from "@/db/client";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Cockpit — Startpunkt des Betriebssystems. Zeigt ehrlich den Ist-Zustand:
 * was an Daten/Content da ist, was fehlt, wo die nächsten Schritte liegen.
 * KPI-Karten (Umsatz/ACoS/TACoS…) folgen mit der Reporting-Schiene.
 */
export default async function Cockpit() {
  const db = await getDb();
  const clients = await db.query.clients.findMany();
  const products = await db.query.products.findMany();
  const versions = await db.query.contentVersions.findMany({
    orderBy: desc(schema.contentVersions.createdAt),
    limit: 200,
  });
  const insights = await db.query.reviewInsights.findMany({ limit: 200 });
  const uploads = await db.query.reportUploads.findMany({ limit: 200 });

  const productsWithContent = new Set(versions.map((v) => v.productId)).size;
  const gatePassed = versions.filter((v) => v.validation?.passed).length;
  const sovCount = uploads.filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok").length;

  const tiles = [
    { label: "Kunden", value: clients.length, href: "/katalog" },
    { label: "Produkte (ASINs)", value: products.length, href: "/katalog" },
    { label: "Produkte mit Content", value: productsWithContent, href: "/katalog" },
    { label: "Content-Versionen · Gate ✓", value: `${versions.length} · ${gatePassed}`, href: "/katalog" },
    { label: "SOV-Audits", value: sovCount, href: "/katalog" },
    { label: "Review-Insights", value: insights.length, href: "/katalog" },
  ];

  const steps: Array<{ done: boolean; text: string; href: string }> = [
    { done: clients.length > 0, text: "Ersten Kunden anlegen", href: "/katalog" },
    { done: products.length > 0, text: "Produkt (bestehende ASIN) anlegen", href: "/katalog" },
    { done: sovCount > 0, text: "Cerebro-CSV hochladen → SOV-Audit", href: "/katalog" },
    { done: insights.length > 0, text: "Reviews analysieren (Apify)", href: "/katalog" },
    { done: versions.length > 0, text: "Content generieren (Titel → Q&A)", href: "/katalog" },
  ];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Cockpit</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Der Überblick, der sonst im Tagesgeschäft untergeht. KPI-Karten (Umsatz, ACoS/TACoS, Funnel) folgen mit der Berichte-Schiene — hier der Ist-Zustand des Systems.
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
