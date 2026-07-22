import type { InsightCard } from "@/db/schema";

/**
 * Einheitliche Insight-Karte (D132/D140): EINE Render-Komponente für alle
 * verdichteten Analyse-Erkenntnisse — kompakte Zeile (Rang · Relevanz · Titel ·
 * Beleg), aufklappbar zu Beschreibung, Beleg-Aspekten (D137), Quellen (D133)
 * und Bild-Ideen (D134). Bewusst OHNE Sentiment-Label und Journey-Phase (D140).
 * Server-Komponente: Aufklappen über <details>, kein Client-JS nötig.
 */
export function InsightKarte({
  karte,
  rang,
  reviewsGesamt,
  belegHinweis,
}: {
  karte: InsightCard;
  rang: number;
  /** Stichproben-Größe für die Beleg-Stufe (D138) — 0 = unbekannt. */
  reviewsGesamt: number;
  /** Ersetzt die Review-Beleg-Stufe, wenn die Karte NICHT aus Reviews stammt (z. B. Audit, D135). */
  belegHinweis?: string;
}) {
  // Ehrliche Beleg-Angabe (D154): Anzahl der Beleg-Aspekte ist ein echter
  // Wert — LLM-geschätzte Erwähnungs-Zahlen werden nicht mehr angezeigt.
  const beleg = { text: belegHinweis ?? `${karte.belegAspekte.length} Beleg-Aspekt${karte.belegAspekte.length === 1 ? "" : "e"}` };

  return (
    <details className="rounded-xl border border-hair bg-background">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
        <span className="w-4 flex-none text-xs tabular-nums text-muted">{rang}</span>
        <span
          className="flex-none text-[11px] tracking-[0.2em] text-primary-strong"
          title={`Relevanz ${karte.relevanz}/5`}
        >
          {"●".repeat(karte.relevanz)}
          <span className="opacity-25">{"●".repeat(5 - karte.relevanz)}</span>
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">{karte.titel}</span>
        <span className="flex-none text-[11px] tabular-nums text-muted">{beleg.text}</span>
      </summary>
      <div className="grid gap-4 border-t border-hair p-4 lg:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Beschreibung</div>
          <p className="mt-1 text-sm">{karte.beschreibung}</p>
          {karte.belegAspekte.length > 0 && (
            <>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Belege</div>
              <ul className="mt-1 space-y-1">
                {karte.belegAspekte.map((b, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                    <span>
                      <span className={b.typ === "painPoint" ? "text-bad" : "text-good"}>
                        {b.typ === "painPoint" ? "−" : "+"}
                      </span>{" "}
                      {b.label}
                    </span>
                    {/* Echter Zählwert (D170): Reviews mit verifizierter Fundstelle */}
                    {b.mentionCount !== null && <span className="flex-none tabular-nums text-muted" title="Reviews mit verifizierter Fundstelle">{b.mentionCount}×</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {karte.quellen.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {karte.quellen.map((q, i) => (
                <span key={i} className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-muted">{q}</span>
              ))}
            </div>
          )}
        </div>
        {(karte.bildIdeen.length > 0 || !belegHinweis) && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Bild-Ideen</div>
            {karte.bildIdeen.length > 0 ? (
              <ul className="mt-1 space-y-1.5">
                {karte.bildIdeen.map((idee, i) => (
                  <li key={i} className="rounded-lg border border-hair p-2 text-xs">📷 {idee}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted">—</p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
