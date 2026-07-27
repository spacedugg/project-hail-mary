import { reviewInsights, reviewScrapes } from "@/db/schema";
import { normalisierePayload } from "@/lib/reviews/insights";
import { kartenKlasse } from "@/lib/reviews/verdichtung";
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

  return (
    <div className="mt-3 space-y-3">
      {/* Etappen-Protokoll + Trichter (D139/D143) */}
      <div className="rounded-xl border border-hair p-4">
        <h3 className="text-sm font-semibold">Analyse-Lauf</h3>
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

      {/* Review Insights (D178): Findings gegliedert nach positiv/negativ/gemischt —
          Klasse rechnet der Code aus den Beleg-Aspekten */}
      {karten.length > 0 && (
        <div className="rounded-xl border border-hair p-4">
          <h3 className="text-sm font-semibold">Review Insights</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([["positiv", "text-good"], ["negativ", "text-bad"], ["gemischt", "text-muted"]] as const).map(([klasse, farbe]) => {
              const n = karten.filter((k) => kartenKlasse(k) === klasse).length;
              return <span key={klasse} className={`rounded-full bg-hair px-2.5 py-1 text-xs tabular-nums ${farbe}`}>{n} {klasse}</span>;
            })}
          </div>
          {([["positiv", "Positiv", "text-good"], ["negativ", "Negativ", "text-bad"], ["gemischt", "Gemischt", "text-muted"]] as const).map(([klasse, label, farbe]) => {
            const gruppe = karten.filter((k) => kartenKlasse(k) === klasse);
            if (gruppe.length === 0) return null;
            return (
              <div key={klasse} className="mt-3">
                <h4 className={`text-xs font-semibold uppercase tracking-wide ${farbe}`}>{label}</h4>
                <div className="mt-1.5 space-y-2">
                  {gruppe.map((k, i) => (
                    <InsightKarte key={i} karte={k} rang={karten.indexOf(k) + 1} reviewsGesamt={p.stats.reviewsTotal} />
                  ))}
                </div>
              </div>
            );
          })}
          {(p.entfernteBildIdeen?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-xl border border-hair p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-warn">Entfernte Bild-Ideen</div>
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
          <h3 className="text-sm font-semibold text-bad">Pain Points</h3>
          <div className="mt-3 space-y-3">
            {p.painPoints.map((x, i) => (
              <div key={i} className="rounded-xl border border-hair p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{x.label}</span>
                  {/* Echter Zählwert (D170): verschiedene Reviews mit verifizierter Fundstelle */}
                  {x.mentionCount !== null && <span className="flex-none rounded-full bg-hair px-2 py-0.5 text-[11px] tabular-nums text-muted" title="Reviews mit verifizierter Fundstelle">{x.mentionCount}×</span>}
                </div>
                {x.quotes?.length > 0 && (
                  <blockquote className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-muted">„{x.quotes[0]}"</blockquote>
                )}
              </div>
            ))}
            {p.painPoints.length === 0 && <p className="text-sm text-muted">Keine kritischen Muster gefunden.</p>}
          </div>
        </div>
        <div className="rounded-xl border border-hair p-4">
          <h3 className="text-sm font-semibold text-good">Kaufauslöser</h3>
          <div className="mt-3 space-y-3">
            {p.buyingTriggers.map((x, i) => (
              <div key={i} className="rounded-xl border border-hair p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{x.label}</span>
                  {x.mentionCount !== null && <span className="flex-none rounded-full bg-hair px-2 py-0.5 text-[11px] tabular-nums text-muted" title="Reviews mit verifizierter Fundstelle">{x.mentionCount}×</span>}
                </div>
                {x.quotes?.length > 0 && (
                  <blockquote className="mt-2 border-l-2 border-hair pl-2 text-xs italic text-muted">„{x.quotes[0]}"</blockquote>
                )}
              </div>
            ))}
            {p.buyingTriggers.length === 0 && <p className="text-sm text-muted">Keine positiven Muster gefunden.</p>}
          </div>
        </div>
      </div>

    </div>
  );
}
