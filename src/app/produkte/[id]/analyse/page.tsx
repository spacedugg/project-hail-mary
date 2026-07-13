import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { analyzeListing, type ListingSnapshot } from "@/lib/analysis/listingAudit";
import { buildImageBrief } from "@/lib/analysis/imageBrief";
import type { SovAudit } from "@/lib/sov/audit";

export const dynamic = "force-dynamic";

/**
 * Präsentationsfertige Listing-Analyse (kundentauglich, druckfreundlich):
 * live berechnet aus Content-Versionen + SOV-Audit + Review-Insights.
 * Jede Dimension weist ihre Evidenz-Klasse aus (kein Fassaden-Score).
 */
export default async function AnalysePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();
  const brand = await db.query.brands.findFirst({ where: eq(schema.brands.id, product.brandId) });

  const versions = await db.query.contentVersions.findMany({
    where: eq(schema.contentVersions.productId, id),
    orderBy: desc(schema.contentVersions.createdAt),
  });
  const latest = (t: string) => versions.find((v) => v.type === t)?.payload as Record<string, unknown> | undefined;
  const snapshot: ListingSnapshot = {
    title: (latest("title")?.text as string) ?? "",
    bullets: (latest("bullets")?.items as string[]) ?? [],
    description: (latest("description")?.text as string) ?? "",
    backendKeywords: (latest("backend_keywords")?.text as string) ?? "",
  };

  const kws = await db.query.keywords.findMany({ where: eq(schema.keywords.productId, id) });
  const insights = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, id),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  const uploads = await db.query.reportUploads.findMany({
    where: eq(schema.reportUploads.brandId, product.brandId),
    orderBy: desc(schema.reportUploads.createdAt),
  });
  const sovUpload = uploads.find(
    (u) => u.reportType === "cerebro" && u.parseStatus === "ok" && (u.parsed as { productId?: string })?.productId === id,
  );
  const sovAudit = (sovUpload?.parsed as { audit?: SovAudit })?.audit ?? null;

  const analysis = analyzeListing({
    snapshot,
    facts: product.facts,
    primaryKeywords: kws.filter((k) => k.tier === "primary").map((k) => k.keyword),
    sovAudit,
    reviewInsights: insights?.payload ?? null,
  });

  const brief = buildImageBrief({
    brand: brand?.name ?? "",
    productName: product.name,
    asin: product.asin,
    facts: product.facts,
    snapshot,
    analysis,
    reviewInsights: insights?.payload ?? null,
  });

  const scoreColor = analysis.overall >= 80 ? "text-emerald-600" : analysis.overall >= 60 ? "text-amber-600" : "text-red-600";
  const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

  return (
    <main className="mx-auto max-w-3xl p-8 print:p-0">
      <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline print:hidden">← Produkt</Link>

      <header className="mt-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <p className="text-xs uppercase tracking-widest text-teal-700 dark:text-teal-400">Listing-Analyse · {brand?.name}</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <div className="text-right">
            <div className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{analysis.overall}<span className="text-base font-normal text-neutral-400">/100</span></div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Gesamt (Ø gemessener Dimensionen)</div>
          </div>
        </div>
        {product.asin && <p className="font-mono text-xs text-neutral-500">{product.asin} · amazon.{product.marketplace}</p>}
      </header>

      {analysis.sov && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Markt-Position (Share of Voice)</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Eigener SOV", `${analysis.sov.brandSOV} %`],
              ["Top-Wettbewerber", analysis.sov.topCompetitor ? `${analysis.sov.topCompetitor.sov} %` : "–"],
              ["Top-10-Abdeckung", `${analysis.sov.top10Coverage} %`],
              ["Quick Wins", String(analysis.sov.quickWinCount)],
            ].map(([l, v]) => (
              <div key={l} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="text-lg font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-neutral-500">{l}</div>
              </div>
            ))}
          </div>
          {analysis.sov.corridor.high > 0 && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Indikatives Potenzial über die Top-Umsatzlücken: <b>{fmt(analysis.sov.corridor.low)}–{fmt(analysis.sov.corridor.high)} €/Monat</b> (Korridor, keine Garantie).
            </p>
          )}
          {analysis.sov.topGaps.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-neutral-200 text-left text-[11px] uppercase text-neutral-500 dark:border-neutral-800">
                  <th className="py-1 pr-2">Keyword</th><th className="pr-2">SV</th><th className="pr-2">Wir</th><th className="pr-2">Bester Comp</th><th className="pr-2">Lücke €/Mo</th><th>Hebel</th>
                </tr></thead>
                <tbody>
                  {analysis.sov.topGaps.map((g) => (
                    <tr key={g.keyword} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="py-1 pr-2 font-medium">{g.keyword}</td>
                      <td className="pr-2 tabular-nums">{fmt(g.sv)}</td>
                      <td className="pr-2 tabular-nums">{g.mainRank || "–"}</td>
                      <td className="pr-2 tabular-nums">{g.bestCompRank || "–"}</td>
                      <td className="pr-2 tabular-nums">{fmt(g.fullRevGap)}</td>
                      <td className="text-xs text-neutral-500">{g.lever}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Dimensionen</h2>
        <div className="mt-2 space-y-3">
          {analysis.dimensions.map((d) => (
            <div key={d.key} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{d.label}</h3>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800">
                    {d.evidence === "deterministic" ? "gemessen" : d.evidence === "llm" ? "KI-Rubrik" : "Experte"}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{d.score}</span>
                </div>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                <div className={`h-full ${d.score >= 80 ? "bg-emerald-500" : d.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d.score}%` }} />
              </div>
              {d.findings.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {d.findings.slice(0, 6).map((f, i) => <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">· {f}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Warum neu konzipieren — die Maßnahmen</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          {analysis.recommendations.length === 0 && <li className="list-none text-neutral-400">Keine offenen Maßnahmen — Listing ist regelkonform.</li>}
        </ol>
      </section>

      {/* Begründungen — für den Kunden: warum die Texte so formuliert sind */}
      {(() => {
        const rationaleSections = [
          { t: "title", label: "Titel" },
          { t: "bullets", label: "Bullet Points" },
          { t: "item_highlights", label: "Item Highlights" },
          { t: "description", label: "Beschreibung" },
          { t: "backend_keywords", label: "Backend-Keywords" },
          { t: "qa", label: "Q&A" },
        ]
          .map(({ t, label }) => ({ label, rationale: (latest(t)?.rationale as Array<{ part: string; source: string; verified: boolean }> | undefined) ?? [] }))
          .filter((s) => s.rationale.length > 0);
        if (rationaleSections.length === 0) return null;
        return (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Warum diese Texte so formuliert sind</h2>
            <p className="mt-1 text-xs text-neutral-500">Jeder Bestandteil mit seiner Herleitung — ✓ = im Text belegt, ⚠︎ = Behauptung nicht belegt.</p>
            <div className="mt-2 space-y-3">
              {rationaleSections.map((s) => (
                <div key={s.label} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
                  <h3 className="text-sm font-medium">{s.label}</h3>
                  <ul className="mt-1 space-y-0.5">
                    {s.rationale.map((r, i) => (
                      <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">
                        {r.verified ? "✓" : "⚠︎"} <b>„{r.part}"</b> ← {r.source}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      <section className="mt-8 print:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Bild-/A+-Brief (copy-paste für Bildgen-Tool)</h2>
        <p className="mt-1 text-xs text-neutral-500">Deterministisch aus der Analyse assembliert — inkl. Reference-Fidelity-Lock und spelling-safe Headlines.</p>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-900">{brief}</pre>
      </section>

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-[10px] text-neutral-400 dark:border-neutral-800">
        temoa · Listing-Analyse · Datenbasis: {sovAudit ? `SOV-Audit (${sovAudit.keywordCount} Keywords)` : "ohne SOV-Report"} · {insights ? `Review-Insights (${insights.dataBasis}, ${insights.confidence})` : "ohne Review-Insights"} · Evidenz je Dimension ausgewiesen
      </footer>
    </main>
  );
}
