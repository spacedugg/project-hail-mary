import { reviewInsights, reviewScrapes } from "@/db/schema";
import { normalisierePayload } from "@/lib/reviews/insights";
import { beurteileAnalyseBasis } from "@/lib/reviews/konfidenz";
import { InsightKarte } from "@/components/insight-karte";
import { verdichteInsightsAction } from "@/app/actions";

type InsightRow = typeof reviewInsights.$inferSelect;
type ScrapeRow = typeof reviewScrapes.$inferSelect;

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

/**
 * Bewertungs-Analyse DIREKT im Reiter (D161, Nutzer-Vorgabe: kein Unterlayer —
 * liegen Daten vor, zeigt der Reiter die Analyse). Ehemals eigene Seite
 * /produkte/[id]/reviews; die Route leitet jetzt hierher um.
 */
export function BewertungsDashboard({
  insight,
  scrape,
  productId,
  productAsin,
}: {
  insight: InsightRow;
  scrape: ScrapeRow | null;
  productId: string;
  productAsin: string | null;
}) {
  // Lese-Schutz (D103): kaputt gespeicherte Payloads dürfen nie crashen
  const p = normalisierePayload(insight.payload);
  const rohThemen = p.painPoints.length + p.buyingTriggers.length;
  const karten = p.insightCards ?? [];
  const konfidenz = beurteileAnalyseBasis(p.stats.reviewsTotal, scrape?.amazonTotals?.reviewsTotal ?? null);

  return (
    <div className="mt-3 space-y-3">
      {/* Etappen-Protokoll + Trichter (D139/D143) */}
      <div className="rounded-xl border border-hair p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Analyse-Lauf</h3>
          <span className="text-[11px] text-muted" title={konfidenz.herleitung}>{konfidenz.text}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-hair p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted">Etappe 1 · Scrape</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(p.stats.reviewsTotal)}</div>
            <div className="text-xs text-muted">Reviews {scrape ? `(${scrape.createdAt.toLocaleDateString("de-DE")})` : ""}</div>
          </div>
          <div className="rounded-xl border border-hair p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted">Etappe 2 · Roh-Analyse</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(rohThemen)}</div>
            <div className="text-xs text-muted">{p.painPoints.length} Pain Points · {p.buyingTriggers.length} Kaufauslöser</div>
          </div>
          <div className="rounded-xl border border-hair p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted">Etappe 3 · Verdichtung</div>
            {karten.length > 0 ? (
              <>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{fmt(karten.length)}</div>
                <div className="text-xs text-muted">Erkenntnisse{p.verworfeneKarten ? ` · ${p.verworfeneKarten} verworfen` : ""}</div>
              </>
            ) : (
              <form action={verdichteInsightsAction} className="mt-1">
                <input type="hidden" name="productId" value={productId} />
                <div className="text-xs text-muted">steht aus</div>
                <button type="submit" className="btn-primary mt-1.5 text-xs">Verdichtung nachholen</button>
              </form>
            )}
          </div>
        </div>
        {p.kernThese && (
          <blockquote className="mt-3 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm italic">
            <b>Kern-These:</b> {p.kernThese}
          </blockquote>
        )}
      </div>

      {/* Verdichtete Erkenntnisse (D131/D132) */}
      {karten.length > 0 && (
        <div className="rounded-xl border border-hair p-4">
          <h3 className="text-sm font-semibold">Erkenntnisse</h3>
          <div className="mt-3 space-y-2">
            {karten.map((k, i) => (
              <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={p.stats.reviewsTotal} />
            ))}
          </div>
          {(p.entfernteBildIdeen?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-xl border border-hair p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-warn">Vom Wahrheits-Filter entfernte Bild-Ideen</div>
              <ul className="mt-1 space-y-1">
                {p.entfernteBildIdeen!.map((e, i) => (
                  <li key={i} className="text-[11px] text-muted">✕ „{e.idee}" — {e.grund}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Pain Points & Kaufauslöser */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-hair p-4">
          <h3 className="text-sm font-semibold text-bad">Pain Points — Einwände, die Käufe verhindern</h3>
          <div className="mt-3 space-y-3">
            {p.painPoints.map((x, i) => (
              <div key={i} className="rounded-xl border border-hair p-3">
                <span className="text-sm font-medium">{x.label}</span>
                {x.quotes?.length > 0 && (
                  <blockquote className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-muted">„{x.quotes[0]}"</blockquote>
                )}
              </div>
            ))}
            {p.painPoints.length === 0 && <p className="text-sm text-muted">Keine kritischen Muster gefunden.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-hair p-4">
          <h3 className="text-sm font-semibold text-good">Kaufauslöser — was überzeugt</h3>
          <div className="mt-3 space-y-3">
            {p.buyingTriggers.map((x, i) => (
              <div key={i} className="rounded-xl border border-hair p-3">
                <span className="text-sm font-medium">{x.label}</span>
                {x.quotes?.length > 0 && (
                  <blockquote className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-muted">„{x.quotes[0]}"</blockquote>
                )}
              </div>
            ))}
            {p.buyingTriggers.length === 0 && <p className="text-sm text-muted">Keine positiven Muster gefunden.</p>}
          </div>
        </div>
      </div>

      {/* Datenbasis */}
      <div className="rounded-xl border border-hair p-4">
        <h3 className="text-sm font-semibold">Datenbasis</h3>
        <p className="mt-1 text-xs text-muted">
          {scrape?.amazonTotals?.reviewsTotal != null ? (
            <>
              Auf Amazon: <b>{fmt(scrape.amazonTotals.reviewsTotal)} Bewertungen</b>
              {scrape.amazonTotals.ratingAvg != null && <> · Ø {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(scrape.amazonTotals.ratingAvg)} ★</>}
              {" — davon "}{p.stats.reviewsTotal} gescraped
            </>
          ) : (
            <>Stichprobe: {p.stats.reviewsTotal} Reviews gescraped</>
          )}
        </p>
        {scrape && (
          <ul className="mt-2 space-y-0.5">
            {Object.entries(scrape.perAsin).map(([asin, n]) => (
              <li key={asin} className="flex items-center justify-between text-xs">
                <span className="font-mono">{asin}{asin === productAsin ? " (dieses Produkt)" : ""}</span>
                <span className="tabular-nums font-medium">{fmt(n)} Reviews</span>
              </li>
            ))}
          </ul>
        )}
        {(scrape?.notes?.length ?? 0) > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {scrape!.notes!.map((n, i) => (
              <p key={i} className="text-[11px] text-warn">△ {n}</p>
            ))}
          </div>
        )}
        {(p.qualitaetsNotizen?.length ?? 0) > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {p.qualitaetsNotizen!.map((n, i) => (
              <p key={`q-${i}`} className="text-[11px] text-muted">✕ {n}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
