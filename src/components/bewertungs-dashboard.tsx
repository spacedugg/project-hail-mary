import { reviewInsights, reviewScrapes } from "@/db/schema";
import { normalisierePayload, wichtigsteFindings } from "@/lib/reviews/insights";
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
  // Anzeige-Deckel (D273): die wichtigsten 8 je Seite, ausgewählt nach echten
  // Fundstellen-Zählwerten. Gespeichert bleibt alles.
  const negative = wichtigsteFindings(p.painPoints);
  const positive = wichtigsteFindings(p.buyingTriggers);

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
            <div className="text-xs text-muted">{p.painPoints.length} negative · {p.buyingTriggers.length} positive Findings</div>
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
        {/* D278: Die „Grenzen dieser Auswertung" standen hier mitten im Trichter.
            Der Nutzer will sie „ganz ganz unten am Ende von allen Content" —
            sie leben jetzt als eigene Komponente `GrenzenDerAnalyse` und werden
            von der Seite als letzter Block gerendert. */}
      </div>

      {/* D278: Die Insight-Karten standen hier ein ZWEITES Mal — sie sind jetzt
          Block 2 der vier Hauptaspekte („Review Insights") ganz oben auf der
          Seite. Was hier bleibt, sind die ROH-Findings darunter: die Stufe, aus
          der die Insights erst abgeleitet werden. */}
      {(p.entfernteBildIdeen?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-hair p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-warn">Entfernte Bild-Ideen</div>
          <ul className="mt-1 space-y-1">
            {p.entfernteBildIdeen!.map((e, i) => (
              <li key={i} className="text-[11px] text-muted">✕ „{e.idee}" — {e.grund}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Roh-Findings aus den Bewertungen (D273, Nutzer-Vorgabe 01.08.).
          Umbenannt: In Review-Texten stehen KEINE Kaufauslöser — dort stehen
          positive und negative Aussagen über das Erlebnis. Der Kaufgrund
          entsteht erst eine Abstraktionsstufe höher im Conversion-Driver-Lauf
          („Wir finden ja nicht direkt die Kaufauslöser in den Bewertungs-Texten,
          richtig?"). Die alte Beschriftung „Kaufauslöser" behauptete genau das.
          Gedeckelt auf die wichtigsten 8 je Seite — der Code wählt nach
          verifizierten Fundstellen aus, nicht das LLM (D184). */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-hair p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-bad">Negative Findings</h3>
            {p.painPoints.length > negative.length && (
              <span className="text-[11px] text-muted">Top {negative.length} von {p.painPoints.length}</span>
            )}
          </div>
          <div className="mt-3 space-y-3">
            {negative.map((x, i) => (
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-good">Positive Findings</h3>
            {p.buyingTriggers.length > positive.length && (
              <span className="text-[11px] text-muted">Top {positive.length} von {p.buyingTriggers.length}</span>
            )}
          </div>
          <div className="mt-3 space-y-3">
            {positive.map((x, i) => (
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
      <p className="text-[11px] text-muted">
        Das sind Roh-Findings aus den Review-Texten — noch keine Kaufgründe. Welche davon tatsächlich kaufentscheidend
        sind, leitet der Conversion-Driver-Lauf eine Stufe höher ab.
      </p>
    </div>
  );
}


/**
 * Datenbasis & Grenzen der Analyse (D278, konsolidiert in D280) — der LETZTE
 * Block der Analyse-Seite.
 *
 * D280: Es gab zwei Blöcke mit demselben Zweck — diesen hier und „Datenbasis &
 * Grenzen dieser Analyse" im Driver-Block weiter oben (Nutzer-Befund: „das ist
 * doch wahrscheinlich redundant, versuche das zu konsolidieren"). Jetzt einer,
 * der Stichprobe, Datenbasis-Zeilen, Qualitäts-Notizen der Roh-Analyse UND die
 * Hinweise des Driver-Laufs trägt.
 *
 * Inhaltlich unverändert (Qualitäts-Notizen D152: Verbatim-Gate, verworfene
 * Aspekte, Zuständigkeits-Gate) und weiterhin eingeklappt. Neu ist nur der Ort:
 * ganz unten statt mitten im Bewertungs-Block. Ehrlichkeit gehört ins Tool, aber
 * nicht zwischen die Befunde.
 */
export function GrenzenDerAnalyse({
  insight,
  driverHinweise = [],
  datenbasis = [],
  stats,
}: {
  insight: InsightRow | null;
  driverHinweise?: string[];
  /** Datenbasis-Zeilen des Driver-Laufs (D280) — vorher ein zweiter Block weiter oben. */
  datenbasis?: string[];
  stats?: { stichprobe: number; wettbewerberGesamt: number; suchvolumenGesamt: number };
}) {
  const notizen = insight ? normalisierePayload(insight.payload).qualitaetsNotizen ?? [] : [];
  const grenzen = [...new Set([...notizen, ...driverHinweise])];
  const basis = [...new Set(datenbasis)];
  if (grenzen.length === 0 && basis.length === 0 && !stats) return null;

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-foreground">
        Datenbasis &amp; Grenzen dieser Analyse{grenzen.length > 0 ? ` (${grenzen.length})` : ""}
      </summary>

      {stats && (
        <p className="mt-2 text-xs text-muted">
          {new Intl.NumberFormat("de-DE").format(stats.stichprobe)} analysierte Bewertungen ·{" "}
          {stats.wettbewerberGesamt} Wettbewerber-Listing(s) ·{" "}
          {new Intl.NumberFormat("de-DE").format(stats.suchvolumenGesamt)} Suchvolumen in der Keyword-Basis
        </p>
      )}

      {basis.length > 0 && (
        <ul className="mt-2 space-y-1">
          {basis.map((d, i) => (
            <li key={i} className="text-[11px] leading-snug text-muted">· {d}</li>
          ))}
        </ul>
      )}

      {grenzen.length > 0 && (
        <>
          <p className="mt-3 border-t border-hair pt-2 text-xs text-muted">
            Was wir nicht messen konnten, sagen wir — nur so ist der Rest belastbar.
          </p>
          <ul className="mt-1.5 space-y-1">
            {grenzen.map((n, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted">ℹ {n}</li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
