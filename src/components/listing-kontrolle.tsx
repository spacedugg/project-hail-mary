import type { analyzeListing, wirksamesListing, SektionsQuelle } from "@/lib/analysis/listingAudit";
import { deckungsgrad } from "@/lib/analysis/listingAudit";
import { massnahmenKarten } from "@/lib/analysis/auditKarten";
import { InsightKarte } from "@/components/insight-karte";
import type { DeepAuditDimension, DeepAuditPayload } from "@/db/schema";
import type { listingSnapshots } from "@/db/schema";

/**
 * Kontrollvariablen DIREKT im Amazon-Listing-Reiter (D172, Nutzer-Vorgabe:
 * Quality Score, Keyword-Abdeckung, Sektions-Scores Titel/Bullets/Backend/
 * Beschreibung/Bilder/A+ „vorne" statt in einem Zweit-Level-Bericht) —
 * plus MASSNAHMEN gehighlightet ganz unten. JSX aus der früheren
 * /analyse-Seite (D126) hierher gezogen; die Seite leitet nur noch um.
 */

type Analysis = ReturnType<typeof analyzeListing>;
type Quellen = ReturnType<typeof wirksamesListing>["quellen"];
type Original = typeof listingSnapshots.$inferSelect | null;
type DeepAuditRow = { payload: DeepAuditPayload; dataBasis: string[]; createdAt: Date } | null;

const fmt1 = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);

export function ListingKontrolle({
  analysis,
  deepAudit,
  quellen,
  original,
  sektionSoll,
}: {
  analysis: Analysis;
  deepAudit: DeepAuditRow;
  quellen: Quellen;
  original: Original;
  sektionSoll: Record<"title" | "bullets" | "description", string>;
}) {
  const detByKey = Object.fromEntries(analysis.dimensions.map((d) => [d.key, d]));
  const kiByKey: Record<string, DeepAuditDimension> = Object.fromEntries((deepAudit?.payload.dimensions ?? []).map((d) => [d.key, d]));
  const scoreColor = analysis.overall === null ? "text-muted" : analysis.overall >= 80 ? "text-emerald-600" : analysis.overall >= 60 ? "text-amber-600" : "text-red-600";
  const quelleText = (q: SektionsQuelle) =>
    q.basis === "freigegeben" ? `freigegebene v${q.version}` : q.basis === "original" ? `Original-Listing${original ? ` (${original.createdAt.toLocaleDateString("de-DE")})` : ""}` : "fehlt";

  // Live-Abgleich (D126): Ist unser freigegebener Text im letzten Import wiederzufinden?
  const liveBadge = (key: "title" | "bullets" | "description", soll: string) => {
    const q = quellen[key];
    if (q.basis !== "freigegeben") return <span className="pill pill-neutral" title="Es ist kein eigener Text freigegeben — live ist das Original.">Original ist live</span>;
    if (!original) return <span className="pill pill-neutral">kein Import zum Abgleich</span>;
    const ist = key === "title" ? (original.title ?? "") : key === "bullets" ? (original.bullets ?? []).join(" ") : (original.description ?? "");
    const grad = deckungsgrad(soll, ist);
    return grad >= 85 ? (
      <span className="pill pill-good" title={`Freigegebener Text ist im letzten Import (${original.createdAt.toLocaleDateString("de-DE")}) zu ${grad} % wiederzufinden.`}>✓ live · {grad} % Deckung</span>
    ) : (
      <span className="pill pill-warn" title={`Nur ${grad} % des freigegebenen Texts finden sich im letzten Import (${original.createdAt.toLocaleDateString("de-DE")}).`}>△ weicht live ab · {grad} %</span>
    );
  };

  // D214: nur was der Scrape wirklich hergibt — Backend ist von außen unsichtbar, raus.
  const textSektionen: Array<"title" | "bullets" | "description"> = ["title", "bullets", "description"];
  const labelFuer: Record<string, string> = { title: "Titel", bullets: "Bullet Points", description: "Beschreibung" };

  return (
    <div className="mt-4 space-y-4">
      {/* Gesamt-Score */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hair p-4">
        <h3 className="text-sm font-semibold">Listing-Kontrolle</h3>
        {analysis.overall !== null ? (
          <div className="text-right">
            <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{analysis.overall}</span>
            <span className="text-sm text-neutral-400">/100</span>
            <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-500">Ø gemessener Dimensionen</span>
          </div>
        ) : (
          <span className="text-sm text-muted">Noch keine Messung möglich</span>
        )}
      </div>

      {/* Quality Score + Keyword-Abdeckung */}
      {/* Pain-Point-Abdeckungs-Score abgeschafft (D176) — Keyword-Abdeckung ist die Mess-Basis */}
      {detByKey["seo-coverage"] && (
        <div className="grid gap-3 lg:grid-cols-2">
          {[detByKey["seo-coverage"]].filter(Boolean).map((d) => (
            <div key={d!.key} className="rounded-xl border border-l-4 border-hair border-l-[var(--primary)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{d!.label}</h3>
                <div className="flex items-center gap-2">
                  <span className="tag">gemessen</span>
                  <span className="text-lg font-semibold tabular-nums">{d!.score}</span>
                </div>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hair">
                <div className={`h-full ${d!.score >= 80 ? "bg-emerald-500" : d!.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d!.score}%` }} />
              </div>
              <ul className="mt-2 space-y-0.5">
                {d!.findings.slice(0, 7).map((f, i) => <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">· {f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Sektionen im Detail (D126) — standardmäßig EINGEKLAPPT (D234, Nutzer: nicht mit Text
          erschlagen): Die Score-Karten oben genügen als Überblick; Befunde/KI/Live erst per Dropdown. */}
      <details>
        <summary className="cursor-pointer text-sm font-medium text-primary-strong hover:underline">
          Details je Sektion anzeigen (Befunde · KI-Bewertung · Live-Abgleich)
        </summary>
        <p className="mt-2 text-xs text-muted">
          Basis: Titel {quelleText(quellen.title)} · Bullets {quelleText(quellen.bullets)} · Beschreibung {quelleText(quellen.description)} — Entwürfe zählen nicht.
        </p>
        <div className="stagger mt-2 grid gap-3 lg:grid-cols-2">
          {textSektionen.map((key) => {
            const det = detByKey[key];
            const ki = kiByKey[key];
            return (
              <div key={key} className="rounded-xl border border-hair p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{labelFuer[key]}</h3>
                  {liveBadge(key, sektionSoll[key])}
                </div>
                {det?.measured ? (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Richtlinien-Score (gemessen)</span>
                      <span className="font-semibold tabular-nums">{det.score}/100</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hair">
                      <div className={`h-full ${det.score >= 80 ? "bg-emerald-500" : det.score >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${det.score}%` }} />
                    </div>
                    {det.findings.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {det.findings.slice(0, 4).map((f, i) => <li key={i} className="text-xs text-neutral-600 dark:text-neutral-400">· {f}</li>)}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Richtlinien-Score: nicht messbar — Inhalt fehlt.</p>
                )}
                {ki && (ki.score10 !== null || ki.aktuell) && (
                  <div className="mt-3 border-t border-hair pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">KI-Befund</span>
                      {ki.score10 !== null && (
                        <span className={`font-semibold tabular-nums ${ki.score10 >= 8 ? "text-emerald-600" : ki.score10 >= 5 ? "text-amber-600" : "text-red-600"}`}>{fmt1(ki.score10)}/10</span>
                      )}
                    </div>
                    {ki.aktuell && <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{ki.aktuell}</p>}
                    {ki.probleme.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {ki.probleme.map((p, i) => <li key={i} className="text-xs text-bad">✕ {p}</li>)}
                      </ul>
                    )}
                    {ki.empfehlung && <p className="mt-1.5 text-xs"><b>→</b> {ki.empfehlung}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bewertungsbasis (D214): einzige zusätzliche schätzbare Scrape-Dimension, bewusst knapp gehalten. */}
        {(() => {
          const d = kiByKey["reviews"];
          if (!d || (d.score10 === null && !d.aktuell)) return null;
          return (
            <div className="mt-3 rounded-xl border border-hair p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{d.label}</h3>
                {d.score10 !== null && (
                  <span className={`text-lg font-semibold tabular-nums ${d.score10 >= 8 ? "text-emerald-600" : d.score10 >= 5 ? "text-amber-600" : "text-red-600"}`}>
                    {fmt1(d.score10)}<span className="text-xs font-normal text-neutral-400">/10</span>
                  </span>
                )}
              </div>
              {d.score10 !== null && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hair">
                  <div className={`bar-fill h-full rounded-full ${d.score10 >= 8 ? "bg-emerald-500" : d.score10 >= 5 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${d.score10 * 10}%` }} />
                </div>
              )}
              {d.aktuell && <p className="mt-2 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">{d.aktuell}</p>}
              {d.empfehlung && <p className="mt-1.5 text-xs"><b>→</b> {d.empfehlung}</p>}
            </div>
          );
        })()}
        {deepAudit && (
          <p className="mt-2 text-[11px] text-muted">KI-Bewertung vom {deepAudit.createdAt.toLocaleDateString("de-DE")}</p>
        )}
      </details>
    </div>
  );
}

/** Maßnahmen gehighlightet (D172): die Handlungsanweisungen aus Audit + Regel-Messung. */
export function MassnahmenBlock({ analysis, deepAudit }: { analysis: Analysis; deepAudit: DeepAuditRow }) {
  const karten = massnahmenKarten(
    deepAudit?.payload.topActions ?? [],
    analysis.recommendations,
    deepAudit?.dataBasis ?? [],
  );
  if (karten.length === 0) return null;
  return (
    <section className="card overflow-hidden p-0 ring-1 ring-[var(--primary)]/30">
      <div className="flex items-center gap-2.5 bg-[var(--primary-soft)] px-5 py-3">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-white tabular-nums">{karten.length}</span>
        <h2 className="text-sm font-bold text-primary-strong">Nächste Maßnahmen</h2>
      </div>
      <div className="space-y-2 p-5">
        {karten.map((k, i) => (
          <InsightKarte key={i} karte={k} rang={i + 1} reviewsGesamt={0} belegHinweis={i < (deepAudit?.payload.topActions.length ?? 0) ? "Tiefen-Audit" : "Regel-Messung"} />
        ))}
      </div>
    </section>
  );
}
