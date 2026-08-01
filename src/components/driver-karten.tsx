import { KANAL_LABEL, type AbdeckungsStufe, type BildStufe } from "@/lib/analysis/abdeckung";
import { MOTIV_LABELS } from "@/lib/analysis/motive";
import { QUELL_LABEL, type ConversionDriverPayload, type NutzenBaustein } from "@/lib/analysis/driverTypen";

/**
 * Conversion Driver & Blocker (D265) — EINE Ansicht für beide Listen, weil ein
 * Blocker keine eigene Erkenntnis ist, sondern ein Driver-Baustein ohne
 * ausreichenden Beweis. Jeder Blocker zeigt seine Driver-ID; damit ist im UI
 * sichtbar, was im Datenmodell erzwungen wird — keine Erkenntnis erscheint
 * zweimal unter zwei Überschriften.
 *
 * Server-Komponente: Aufklappen über <details>, kein Client-JS.
 */

const TEXT_PILL: Record<AbdeckungsStufe, { klasse: string; text: string }> = {
  prominent: { klasse: "pill pill-good", text: "prominent im Text" },
  erwaehnt: { klasse: "pill pill-warn", text: "nur erwähnt" },
  fehlt: { klasse: "pill pill-bad", text: "fehlt im Text" },
  nicht_erfasst: { klasse: "pill pill-neutral", text: "Text nicht erfasst" },
};

const BILD_PILL: Record<BildStufe, { klasse: string; text: string }> = {
  belegt: { klasse: "pill pill-good", text: "Bildbeweis vorhanden" },
  schwach: { klasse: "pill pill-warn", text: "Bildbeweis schwach" },
  fehlt: { klasse: "pill pill-bad", text: "kein Bildbeweis" },
  nicht_bewertet: { klasse: "pill pill-neutral", text: "Bild nicht bewertet" },
  nicht_erfasst: { klasse: "pill pill-neutral", text: "keine Bildanalyse" },
};

const MOTIV_KURZ = { kern: "Kernmotiv", entscheidung: "Entscheidungsmotiv", absicherung: "Absicherungsmotiv" } as const;

function Punkte({ relevanz }: { relevanz: number }) {
  return (
    <span className="flex-none text-[11px] tracking-[0.2em] text-primary-strong" title={`Relevanz ${relevanz}/5`}>
      {"●".repeat(relevanz)}
      <span className="opacity-25">{"●".repeat(5 - relevanz)}</span>
    </span>
  );
}

function Baustein({ b }: { b: NutzenBaustein }) {
  const bullets = b.kanaele.find((k) => k.kanal === "bullets");
  const fundorte = b.kanaele
    .filter((k) => k.stufe === "prominent" || k.stufe === "erwaehnt")
    .map((k) => (k.kanal === "bullets" && k.position ? `${KANAL_LABEL.bullets} Nr. ${k.position}` : KANAL_LABEL[k.kanal]));

  return (
    <li className="rounded-xl border border-hair p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-sm font-medium">{b.nutzen}</span>
        {b.usp && <span className="pill pill-good" title="Gegenüber dem Wettbewerb überlegen — Beweis besonders herausstellen">USP</span>}
        <span className={TEXT_PILL[b.textStufe].klasse}>{TEXT_PILL[b.textStufe].text}</span>
        <span className={BILD_PILL[b.bildStufe].klasse}>
          {BILD_PILL[b.bildStufe].text}
          {b.bildStufe === "schwach" && b.bildSlot !== undefined && b.bildNote !== null && b.bildNote !== undefined
            ? ` · Bild ${b.bildSlot}, ${b.bildNote.toLocaleString("de-DE")}/5`
            : ""}
        </span>
      </div>
      {b.features.length > 0 && (
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-semibold">Merkmale:</span> {b.features.join(" · ")}
        </p>
      )}
      {fundorte.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold">Fundort:</span> {[...new Set(fundorte)].join(", ")}
          {bullets?.treffer.length ? ` (${bullets.treffer.join(", ")})` : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...new Set(b.belege.map((x) => x.quelle))].map((q) => (
          <span key={q} className="rounded-full bg-hair px-2 py-0.5 text-[11px] text-muted">{QUELL_LABEL[q]}</span>
        ))}
      </div>
    </li>
  );
}

export function DriverBlock({
  lauf,
}: {
  lauf: { payload: ConversionDriverPayload; dataBasis: string[]; createdAt: Date };
}) {
  const p = lauf.payload;
  /**
   * D272 (Nutzer-Befund 01.08., Screenshot „Erwartungs- & Produktrisiken"):
   * Hier standen zusätzlich die verdichteten Karten mit negativer Tendenz
   * (`risiken`, D266) — „lediglich die Informationen, die wir schon bei unseren
   * negativen Bewertungsanalysen herausfiltern, eins zu eins dieselbe
   * Information". Sie sind raus; sichtbar bleiben sie als negative
   * Bewertungs-Findings und, soweit sie im Listing unbeantwortet sind, als
   * Conversion-Blocker.
   *
   * `produktFeedback` bleibt: Das ist KEINE Dopplung, sondern das Ergebnis des
   * Zuständigkeits-Gates (D266) — Themen, die kein Listing-Text lösen kann.
   */
  const hatRisiken = p.produktFeedback.length > 0;

  return (
    <>
      <section className="card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Conversion Driver — warum Kunden kaufen</h2>
          <span className="text-[11px] text-muted">Stand {lauf.createdAt.toLocaleDateString("de-DE")}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Das Resultat, das der Kunde will — nicht das Merkmal, das es liefert. Rangfolge und Punkte rechnet der Code
          aus Motiv-Klasse, Suchnachfrage, Wettbewerber-Konsens und Kundenstimmen.
        </p>

        <div className="stagger mt-4 space-y-2">
          {p.driver.map((d) => (
            <details key={d.id} className="rounded-xl border border-hair bg-background">
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
                <span className="w-9 flex-none font-mono text-xs text-muted">{d.id}</span>
                <Punkte relevanz={d.relevanz} />
                <span className="min-w-0 flex-1 text-sm font-medium">{d.resultat}</span>
                <span className="pill pill-neutral" title={MOTIV_LABELS[d.motivKlasse]}>{MOTIV_KURZ[d.motivKlasse]}</span>
                {d.nurKategorie && (
                  <span className="pill pill-warn" title="Nur aus dem Kernmotiv der Produktart — nicht durch Produktdaten, Bewertungen oder Wettbewerber geschärft">
                    dünne Evidenz
                  </span>
                )}
                <span className="flex-none text-[11px] tabular-nums text-muted" title="Driver-Score 0–100">{d.score}/100</span>
              </summary>
              <div className="border-t border-hair p-4">
                {d.motivBegruendung && <p className="text-sm">{d.motivBegruendung}</p>}

                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Nutzen-Bausteine — was das Resultat trägt und ob es bewiesen ist
                </div>
                <ul className="mt-1.5 space-y-2">
                  {d.bausteine.map((b, i) => <Baustein key={i} b={b} />)}
                </ul>

                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Wie der Score entsteht</div>
                <ul className="mt-1 space-y-1">
                  {d.anteile.map((a, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                      <span><span className="font-medium">{a.quelle}</span> — {a.beleg}</span>
                      <span className="flex-none tabular-nums text-muted">+{a.punkte}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
          {p.driver.length === 0 && (
            <p className="text-sm text-muted">Kein belegter Kaufgrund — siehe Grenzen der Analyse unten.</p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Conversion-Blocker — Kaufgründe ohne Beweis</h2>
        <p className="mt-1 text-xs text-muted">
          Jeder Blocker sitzt auf einem Driver oben. Kein eigener Befund, keine zweite Liste derselben Erkenntnis.
        </p>
        <div className="stagger mt-4 space-y-2">
          {p.blocker.map((b, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-hair bg-background p-3">
              <span className="w-9 flex-none font-mono text-xs text-primary-strong" title="Gehört zu diesem Driver">{b.driverId}</span>
              <span className="min-w-0 flex-1 text-sm font-medium">{b.titel}</span>
              <span className="flex-none text-[11px] tabular-nums text-muted" title="Driver-Score × Lückengröße">{b.score}</span>
            </div>
          ))}
          {p.blocker.length === 0 && (
            <p className="text-sm">✓ Kein Blocker: Jeder belegte Kaufgrund ist im Listing bewiesen.</p>
          )}
        </div>
      </section>

      {(p.ballast.length > 0 || hatRisiken) && (
        <section className="card p-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {p.ballast.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold">Ballast im Listing</h2>
                <p className="mt-1 text-xs text-muted">
                  Merkmale, die Fläche belegen und keinem Kaufgrund zuarbeiten — der Platz gehört den Beweisen oben.
                </p>
                <ul className="mt-2 space-y-1">
                  {p.ballast.map((b, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                      <span>{b.feature}</span>
                      <span className={`flex-none ${b.fundstelle === "prominent" ? "text-bad" : "text-muted"}`}>
                        {b.fundstelle === "prominent" ? "an prominenter Stelle" : "erwähnt"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hatRisiken && (
              <div>
                <h2 className="text-sm font-semibold">Produkt-Feedback</h2>
                <p className="mt-1 text-xs text-muted">
                  Themen, die kein Listing-Text löst — Produkt, Verpackung, Transport. Sie wirken auf Retouren und
                  Bewertungen und gehören zum Hersteller, nicht in den Werbetext.
                </p>
                {p.produktFeedback.length > 0 && (
                  <>
                    <ul className="mt-2 space-y-1">
                      {p.produktFeedback.map((f, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-2 text-xs">
                          <span>
                            <span className={f.typ === "painPoint" ? "text-bad" : "text-good"}>{f.typ === "painPoint" ? "−" : "+"}</span> {f.label}
                          </span>
                          {f.mentionCount !== null && <span className="flex-none tabular-nums text-muted">{f.mentionCount}×</span>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Grenzen der Analyse: ehrlich benannt, nicht kleingedruckt versteckt (D265) */}
      <section className="card p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Datenbasis &amp; Grenzen dieser Analyse
            {p.verworfen > 0 && <span className="ml-2 text-xs font-normal text-muted">({p.verworfen} Kandidat(en) verworfen)</span>}
          </summary>
          <ul className="mt-2 space-y-1">
            {lauf.dataBasis.map((d, i) => <li key={i} className="text-xs text-muted">· {d}</li>)}
          </ul>
          {p.hinweise.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-hair pt-2">
              {p.hinweise.map((h, i) => <li key={i} className="text-xs text-muted">ℹ {h}</li>)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted">
            Stichprobe: {p.stats.stichprobe} analysierte Bewertungen · {p.stats.wettbewerberGesamt} Wettbewerber-Listing(s) ·
            {" "}{new Intl.NumberFormat("de-DE").format(p.stats.suchvolumenGesamt)} Suchvolumen in der Keyword-Basis
          </p>
        </details>
      </section>
    </>
  );
}
