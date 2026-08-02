import type { analyzeListing } from "@/lib/analysis/listingAudit";
import type { DeepAuditPayload } from "@/db/schema";

/**
 * Bausteine des Analyse-Reiters — EINZELN exportiert (D272, Nutzer-Vorgabe
 * 01.08.2026).
 *
 * Vorher war das EIN Block „Hintergrundwissen“, der immer als Ganzes ganz unten
 * hing: Zielgruppe/Positionierung/USPs, Share of Voice und die Produkt-Features
 * in fester Reihenfolge. Der Nutzer braucht die Teile aber an verschiedenen
 * Stellen — „Product Features sollten ziemlich weit oben genannt werden, weil ich
 * ja ein Listing analysieren will. Keywords können ganz unten angezeigt werden,
 * das ist nicht so wichtig wie alle anderen Bewertungen.“ Deshalb drei
 * eigenständige Komponenten statt eines Sammelblocks; die Reihenfolge bestimmt
 * jetzt die Seite, nicht diese Datei.
 */

type Analysis = ReturnType<typeof analyzeListing>;
type DeepAuditRow = { payload: DeepAuditPayload; dataBasis: string[]; createdAt: Date } | null;

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);

/*
 * Die frueheren `ProduktFeatures` sind hier RAUS (D278): Die vier Hauptaspekte
 * des Analyse-Reiters — Driver, Review Insights, Product Features, Blocker —
 * werden jetzt einheitlich in `components/analyse-vier.tsx` dargestellt. Zwei
 * Feature-Darstellungen nebeneinander waeren genau die Dopplung, die D272
 * abgestellt hat.
 */

/**
 * Zielgruppe · Positionierung · USPs (D126) — laut Nutzer „unterhalb der
 * anderen Main-Sachen“: wichtig, aber nachgelagert zu Features, Drivern und
 * Blockern (D272).
 */
export function ZielgruppeUndPositionierung({ deepAudit }: { deepAudit: DeepAuditRow }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Zielgruppe &amp; Positionierung</h2>
      {/* D272: Die dritte Kachel „USPs (belegbar aus Daten)" ist raus — sie war
          dieselbe Liste wie die Produkt-Features oben, nur anders beschriftet
          (Nutzer: „dann treten die USPs auch noch mal ganz unten auf, die
          Product Features"). Eine Liste, ein Ort: die Features. */}
      {deepAudit ? (
        <div className="stagger mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border-l-4 border-l-[var(--primary)] border border-hair p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">Zielgruppe (aus Reviews)</h3>
            <p className="mt-2 text-sm font-medium">{deepAudit.payload.derived.zielgruppe || "—"}</p>
          </div>
          <div className="rounded-xl border-l-4 border-l-[var(--primary)] border border-hair p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-primary-strong">Positionierung</h3>
            <p className="mt-2 text-sm font-medium">{deepAudit.payload.derived.positionierung || "—"}</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Steht nach dem nächsten Analyse-Lauf hier.</p>
      )}
    </section>
  );
}

/**
 * Markt-Position / Keywords (Share of Voice) — laut Nutzer ans ENDE des
 * Analyse-Reiters (D272): „Keywords können ganz unten angezeigt werden, das ist
 * nicht so wichtig wie alle anderen Bewertungen.“
 */
export function MarktPosition({ analysis }: { analysis: Analysis }) {
  if (!analysis.sov) return null;
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Markt-Position &amp; Keywords (Share of Voice)</h2>
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
  );
}
