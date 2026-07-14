import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SovAudit } from "@/lib/sov/audit";

export const dynamic = "force-dynamic";

/** Sichtbarkeit & Markt — v0: SOV-Audits der Marke; Funnel/Opportunity-Matrix folgen. */
export default async function BrandSichtbarkeit({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const db = await getDb();
  const uploads = await db.query.reportUploads.findMany({ where: eq(schema.reportUploads.brandId, brandId) });
  const products = await db.query.products.findMany({ where: eq(schema.products.brandId, brandId) });
  const audits = uploads
    .filter((u) => u.reportType === "cerebro" && u.parseStatus === "ok" && u.parsed)
    .map((u) => ({ u, productId: (u.parsed as { productId?: string }).productId, audit: (u.parsed as { audit?: SovAudit }).audit }))
    .filter((x) => x.audit);
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Sichtbarkeit & Markt</h1>
      <p className="mt-1 text-sm text-neutral-500">Share of Voice je Produkt (aus Cerebro-Uploads). Funnel-vs-Markt & Opportunity-Matrix folgen mit dem SQP-Bericht.</p>

      {audits.length === 0 && (
        <p className="mt-8 card border-dashed p-6 text-sm text-muted">
          Noch kein SOV-Audit. Cerebro-CSV am Produkt hochladen (Katalog → Produkt → 2b).
        </p>
      )}

      <div className="mt-6 space-y-3">
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
