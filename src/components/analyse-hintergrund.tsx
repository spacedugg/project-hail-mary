import type { analyzeListing } from "@/lib/analysis/listingAudit";
import type { DeepAuditPayload, FeatureRankingPayload } from "@/db/schema";
import { befundKarten } from "@/lib/analysis/auditKarten";
import { InsightKarte } from "@/components/insight-karte";

/**
 * Analyse-Hintergrundwissen (D172): die restlichen Bausteine des gebündelten
 * Analyse-Reiters — Zielgruppe/Positionierung/USPs, Sterne-Verteilung
 * (Gruppierung D172: schlecht = 1–3★ · neutral = 4★ · positiv = 5★),
 * Share of Voice, Feature-Ranking, Stärken & Schwächen. JSX aus der
 * früheren /analyse-Seite hierher gezogen.
 */

type Analysis = ReturnType<typeof analyzeListing>;
type DeepAuditRow = { payload: DeepAuditPayload; dataBasis: string[]; createdAt: Date } | null;
type FeatureRow = { payload: FeatureRankingPayload; dataBasis: string[]; createdAt: Date } | null;

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

export function AnalyseHintergrund({
  analysis,
  deepAudit,
  auditStale,
  featureRanking,
}: {
  analysis: Analysis;
  deepAudit: DeepAuditRow;
  auditStale: boolean;
  featureRanking: FeatureRow;
}) {
  return (
    <>
      {/* Zielgruppe · Positionierung · USPs (D126) */}
      <section className="card p-5">
        {/* Kein manueller CTA (D177): die KI-Bewertung läuft als Etappe des Analyse-Laufs */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Zielgruppe · Positionierung · USPs {deepAudit && <span className="ml-1 pill pill-good">✓ {deepAudit.createdAt.toLocaleDateString("de-DE")}</span>}</h2>
          {deepAudit && (auditStale ? <span className="pill pill-warn">wird beim nächsten Lauf aktualisiert</span> : <span className="pill pill-neutral">aktuell</span>)}
        </div>
        {deepAudit ? (
          <div className="stagger mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border-l-4 border-l-[var(--primary)] border border-hair p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">Zielgruppe (aus Reviews)</h3>
              <p className="mt-2 text-sm font-medium">{deepAudit.payload.derived.zielgruppe || "—"}</p>
            </div>
            <div className="rounded-xl border-l-4 border-l-[var(--primary)] border border-hair p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">Positionierung</h3>
              <p className="mt-2 text-sm font-medium">{deepAudit.payload.derived.positionierung || "—"}</p>
            </div>
            <div className="rounded-xl border-l-4 border-l-[var(--primary)] border border-hair p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">USPs (belegbar aus Daten)</h3>
              <ul className="mt-2 space-y-1">
                {deepAudit.payload.derived.usps.map((u, i) => <li key={i} className="text-sm">✓ {u}</li>)}
                {deepAudit.payload.derived.usps.length === 0 && <li className="text-sm text-muted">—</li>}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">KI-Bewertung aus Listing + Kundenstimmen. Speist auch die Scores und Maßnahmen im Reiter Amazon Listing.</p>
        )}
      </section>

      {/* KEINE zweite Sterne-Verteilung (D178): die steht bereits im Bewertungs-Block */}

      {/* Markt-Position (Share of Voice) */}
      {analysis.sov && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Markt-Position (Share of Voice)</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Eigener SOV", `${analysis.sov.brandSOV} %`],
              ["Top-Wettbewerber", analysis.sov.topCompetitor ? `${analysis.sov.topCompetitor.sov} %` : "–"],
              ["Top-10-Abdeckung", `${analysis.sov.top10Coverage} %`],
              ["Quick Wins", String(analysis.sov.quickWinCount)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-hair p-3">
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

      {/* Feature-Ranking (D141/D146) */}
      <section className="card p-5">
        {/* Kein manueller CTA (D177): das Ranking läuft als Etappe des Analyse-Laufs */}
        <h2 className="text-sm font-semibold">Produkt-Features</h2>
        {featureRanking ? (
          <>
            <div className="mt-2 space-y-2">
              {featureRanking.payload.cards.map((k, i) => (
                <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={featureRanking.payload.stats.reviewsGesamt} />
              ))}
            </div>
            <div className="mt-2 space-y-0.5">
              {featureRanking.payload.hinweise.map((h, i) => (
                <p key={i} className="text-[11px] text-muted">ℹ {h}</p>
              ))}
              {featureRanking.payload.verworfen > 0 && (
                <p className="text-[11px] text-warn">△ {featureRanking.payload.verworfen} Feature(s) ohne Listing-Beleg verworfen.</p>
              )}
              {featureRanking.payload.entfernteBildIdeen.map((e, i) => (
                <p key={`b-${i}`} className="text-[11px] text-warn">✕ Bild-Idee entfernt: „{e.idee}" — {e.grund}</p>
              ))}
              <p className="text-[11px] text-muted">Datenbasis: {featureRanking.dataBasis.join(" · ")} · Stand {featureRanking.createdAt.toLocaleDateString("de-DE")}</p>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Noch kein Ranking. Ordnet Listing-Features nach Kunden-Echo.</p>
        )}
      </section>

      {/* Stärken & Schwächen (D135) */}
      {deepAudit && befundKarten(deepAudit.payload, deepAudit.dataBasis).length > 0 && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Stärken &amp; Schwächen</h2>
          <div className="mt-3 space-y-2">
            {befundKarten(deepAudit.payload, deepAudit.dataBasis).map((k, i) => (
              <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={0} belegHinweis="aus Tiefen-Audit" />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
