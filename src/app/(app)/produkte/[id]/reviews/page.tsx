import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { IconReviews, IconCheck, IconContent } from "@/components/icons";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

/**
 * Findings-Dashboard der Bewertungs-Analyse (D71): Datenbasis transparent
 * (Sterne-Verteilung, ASINs, Konfidenz), Pain Points & Kaufauslöser mit
 * Häufigkeits-Balken und O-Tönen, Kundensprache zum Übernehmen/Vermeiden —
 * mit klarer Konsequenz Richtung Content.
 */
export default async function ReviewDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(schema.products.id, id) });
  if (!product) notFound();
  const insight = await db.query.reviewInsights.findFirst({
    where: eq(schema.reviewInsights.productId, id),
    orderBy: desc(schema.reviewInsights.createdAt),
  });
  const scrape = await db.query.reviewScrapes.findFirst({
    where: eq(schema.reviewScrapes.productId, id),
    orderBy: desc(schema.reviewScrapes.createdAt),
  });

  if (!insight) {
    return (
      <main className="w-full p-8">
        <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline">← Werkbank</Link>
        <h1 className="page-title mt-1">Bewertungs-Analyse</h1>
        <div className="mt-6 card border-dashed p-6 text-sm text-muted">
          Noch keine Analyse. Auf der Produktseite erst Reviews scrapen (Schritt 1), dann die Analyse starten (Schritt 2).
        </div>
      </main>
    );
  }

  const p = insight.payload;
  const maxPain = Math.max(...p.painPoints.map((x) => x.frequencyPct ?? 0), 1);
  const maxTrig = Math.max(...p.buyingTriggers.map((x) => x.frequencyPct ?? 0), 1);

  return (
    <main className="w-full p-8">
      <Link href={`/produkte/${id}`} className="text-xs text-neutral-500 hover:underline">← Werkbank</Link>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="page-title">Bewertungs-Analyse</h1>
        <span className="text-sm text-muted">{product.name}{product.asin ? ` · ${product.asin}` : ""}</span>
      </div>
      <p className="page-sub">
        Was Käufer wirklich stört und überzeugt — aus echten Bewertungen, mit O-Tönen. Pain Points gehören in Bullets/Q&A
        (Einwände vorwegnehmen), Kaufauslöser in Headlines und Bild-Briefs.
      </p>

      {/* Datenbasis */}
      <div className="stagger mt-6 grid gap-3 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="icon-chip chip-violet"><IconReviews /></span>
            <div>
              <div className="text-sm font-semibold">Datenbasis</div>
              <div className="text-xs text-muted">
                {scrape?.amazonTotals?.reviewsTotal != null ? (
                  <>
                    Auf Amazon: <b>{fmt(scrape.amazonTotals.reviewsTotal)} Bewertungen</b>
                    {scrape.amazonTotals.ratingAvg != null && <> · Ø {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(scrape.amazonTotals.ratingAvg)} ★</>}
                    {" — davon "}{p.stats.reviewsTotal} gescraped
                  </>
                ) : (
                  <>Stichprobe: {p.stats.reviewsTotal} Reviews gescraped</>
                )}
                {" · Konfidenz "}{insight.confidence}
                {insight.dataBasis !== "apify_scrape" && <span className="ml-1 pill pill-warn">Demo-Daten</span>}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Je Sterne-Klasse ein eigener Scrape-Lauf mit bis zu 100 der aktuellsten Reviews (Scrape-Maximum) — die Stichprobe bildet nicht das Verhältnis der Gesamtverteilung ab.
          </p>
          {(scrape?.notes?.length ?? 0) > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {scrape!.notes!.map((n, i) => (
                <p key={i} className="text-[11px] text-warn">△ {n}</p>
              ))}
            </div>
          )}
          {scrape?.amazonTotals?.dist ? (
            <div className="mt-4 space-y-1.5">
              {(["5", "4", "3", "2", "1"] as const).map((star) => {
                const pct = scrape.amazonTotals!.dist![star] ?? 0;
                const n = scrape.starCounts[star] ?? 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="w-8 flex-none text-muted">{star} ★</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-hair">
                      <div className="bar-fill h-full rounded-full" style={{ width: `${pct}%`, background: Number(star) >= 4 ? "var(--cat-2)" : Number(star) === 3 ? "var(--warn)" : "var(--bad)" }} />
                    </div>
                    <span className="w-32 flex-none text-right font-semibold">{pct} % · {fmt(n)} gescraped</span>
                  </div>
                );
              })}
            </div>
          ) : scrape ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(["5", "4", "3", "2", "1"] as const).map((star) => (
                <span key={star} className="rounded-full bg-hair px-2.5 py-1 text-xs tabular-nums">{star} ★ · {fmt(scrape.starCounts[star] ?? 0)} gescraped</span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="card p-5">
          <div className="text-sm font-semibold">Quellen</div>
          <ul className="mt-2 space-y-1">
            {(scrape ? Object.entries(scrape.perAsin) : []).map(([asin, n]) => (
              <li key={asin} className="flex items-center justify-between text-xs">
                <span className="font-mono">{asin}{asin === product.asin ? " (dieses Produkt)" : ""}</span>
                <span className="tabular-nums font-medium">{fmt(n)} Reviews</span>
              </li>
            ))}
            {!scrape && p.sources.map((s) => <li key={s} className="truncate text-xs text-muted">{s}</li>)}
          </ul>
          <p className="mt-3 text-[11px] text-muted">1–3 ★ → Pain Points · 4–5 ★ → Kaufauslöser</p>
        </div>
      </div>

      {/* Findings */}
      <div className="stagger mt-3 grid gap-3 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-bad">Pain Points — Einwände, die Käufe verhindern</h2>
          <div className="mt-3 space-y-3">
            {p.painPoints.map((x, i) => (
              <div key={i} className="rounded-xl border border-hair p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{x.label}</span>
                  <span className="flex-none text-xs tabular-nums text-muted">{x.mentionCount ? `${x.mentionCount}× ` : ""}{x.frequencyPct ? `· ${x.frequencyPct} %` : ""}</span>
                </div>
                {x.frequencyPct != null && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair">
                    <div className="bar-fill h-full rounded-full bg-bad" style={{ width: `${(x.frequencyPct / maxPain) * 100}%` }} />
                  </div>
                )}
                {x.quotes?.length > 0 && (
                  <blockquote className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-muted">„{x.quotes[0]}"</blockquote>
                )}
              </div>
            ))}
            {p.painPoints.length === 0 && <p className="text-sm text-muted">Keine kritischen Muster gefunden.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-good">Kaufauslöser — was überzeugt</h2>
          <div className="mt-3 space-y-3">
            {p.buyingTriggers.map((x, i) => (
              <div key={i} className="rounded-xl border border-hair p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{x.label}</span>
                  <span className="flex-none text-xs tabular-nums text-muted">{x.mentionCount ? `${x.mentionCount}× ` : ""}{x.frequencyPct ? `· ${x.frequencyPct} %` : ""}</span>
                </div>
                {x.frequencyPct != null && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hair">
                    <div className="bar-fill h-full rounded-full bg-good" style={{ width: `${(x.frequencyPct / maxTrig) * 100}%` }} />
                  </div>
                )}
                {x.quotes?.length > 0 && (
                  <blockquote className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-muted">„{x.quotes[0]}"</blockquote>
                )}
              </div>
            ))}
            {p.buyingTriggers.length === 0 && <p className="text-sm text-muted">Keine positiven Muster gefunden.</p>}
          </div>
        </section>
      </div>

      {/* Kundensprache */}
      <div className="stagger mt-3 grid gap-3 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center gap-2"><span className="icon-chip chip-teal"><IconCheck /></span><h2 className="text-sm font-semibold">Kundensprache übernehmen</h2></div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.languageToBorrow.map((w, i) => <span key={i} className="rounded-full bg-[rgb(47_158_143/0.12)] px-2.5 py-1 text-xs">„{w}"</span>)}
            {p.languageToBorrow.length === 0 && <span className="text-sm text-muted">—</span>}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Sprache vermeiden</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.languageToAvoid.map((w, i) => <span key={i} className="rounded-full bg-[rgb(220_38_38/0.08)] px-2.5 py-1 text-xs line-through decoration-[rgb(220_38_38/0.5)]">{w}</span>)}
            {p.languageToAvoid.length === 0 && <span className="text-sm text-muted">—</span>}
          </div>
        </section>
      </div>

      {/* Konsequenz */}
      <div className="anim-in mt-3 card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="icon-chip chip-violet"><IconContent /></span>
          <p className="text-sm">
            <b>Nächster Schritt:</b> Diese Findings fließen automatisch in die Content-Generierung und die Creative-Briefs ein —
            Pain Points als Einwand-Behandlung, Kaufauslöser als Headline-Material.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/produkte/${id}#reviews`} className="btn-ghost text-xs">Neu scrapen/analysieren</Link>
          <Link href={`/produkte/${id}`} className="btn-primary text-xs">Zur Content-Werkbank →</Link>
        </div>
      </div>
    </main>
  );
}
