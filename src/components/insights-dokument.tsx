import type { Ampel, InsightsReportPayload } from "@/lib/reports/insightsDokument";

/**
 * Darstellung des Insights-Dokuments (D267) — dieselbe Seite ist der Ausdruck.
 * Kein zweites Layout für PDF: die Print-Regeln stehen in `globals.css`
 * (`.dok-seite`), damit Bildschirm und Papier nie auseinanderlaufen.
 *
 * Server-Komponente, kein Client-JS. Der Druck-Knopf lebt in der Kunden-Seite.
 */

const AMPEL: Record<Ampel, { zeichen: string; klasse: string; text: string }> = {
  gut: { zeichen: "●", klasse: "text-good", text: "abgedeckt" },
  teil: { zeichen: "◐", klasse: "text-warn", text: "schwach" },
  fehlt: { zeichen: "○", klasse: "text-bad", text: "fehlt" },
  unbekannt: { zeichen: "–", klasse: "text-muted", text: "nicht bewertbar" },
};

const fmt = (n: number) => new Intl.NumberFormat("de-DE").format(n);
const note = (n: number | null) => (n === null ? "–" : n.toLocaleString("de-DE"));

function AmpelZelle({ stufe }: { stufe: Ampel }) {
  const a = AMPEL[stufe];
  return (
    <span className={`whitespace-nowrap ${a.klasse}`} title={a.text}>
      {a.zeichen} <span className="text-[11px]">{a.text}</span>
    </span>
  );
}

export function InsightsDokument({ p, version }: { p: InsightsReportPayload; version: number }) {
  const db = p.datenbasis;
  const stand = new Date(p.kopf.stand);

  return (
    <article className="mx-auto max-w-3xl">
      {/* ── Seite 1: Ausgangslage ─────────────────────────────────────────── */}
      <section className="dok-seite">
        <div className="text-[11px] uppercase tracking-wide text-muted">Listing-Analyse · {p.kopf.marktplatz}</div>
        <h1 className="mt-1 text-2xl font-semibold">{p.kopf.produktName}</h1>
        <p className="mt-1 text-xs text-muted">
          {p.kopf.asin && <span className="font-mono">{p.kopf.asin}</span>}
          {p.kopf.asin && " · "}
          Stand {stand.toLocaleDateString("de-DE")} · Version {version}
        </p>

        <h2 className="mt-6 text-sm font-semibold">Was ausgewertet wurde</h2>
        <p className="mt-1 text-sm leading-relaxed">
          {db.reviewsAmazon !== null ? (
            <>
              <b>{fmt(db.reviewsAmazon)} Bewertungen</b> auf Amazon
              {db.ratingAvg !== null && <> (Ø {db.ratingAvg.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ★)</>}
              {db.reviewsAnalysiert > 0 && <>, davon <b>{fmt(db.reviewsAnalysiert)} im Detail ausgewertet</b></>}
            </>
          ) : (
            <>{fmt(db.reviewsAnalysiert)} Bewertungen im Detail ausgewertet</>
          )}
          {db.wettbewerberAsins > 0 && <> · zusätzlich Bewertungen aus {db.wettbewerberAsins} Vergleichsprodukt(en)</>}
          {db.wettbewerberListings > 0 && <> · {db.wettbewerberListings} Wettbewerber-Listing(s) im Textvergleich</>}
          {db.bilderAnalysiert > 0 && <> · {db.bilderAnalysiert} Bilder inhaltlich ausgewertet</>}
          {db.keywordsMitVolumen > 0 && <> · {fmt(db.keywordsMitVolumen)} Suchbegriffe mit Suchvolumen</>}.
        </p>

        {p.kernThese && (
          <blockquote className="mt-5 border-l-4 border-l-[var(--primary)] bg-[var(--primary-soft)] px-4 py-3 text-sm">
            {p.kernThese}
          </blockquote>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3">
          {p.kennzahlen.map((k, i) => (
            <div key={i} className="rounded-xl border border-hair p-3">
              <div className="text-xl font-semibold tabular-nums">{k.wert}</div>
              <div className="text-[11px] text-muted">{k.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Seite 2: Kaufgründe (das Herzstück) ───────────────────────────── */}
      <section className="dok-seite">
        <h2 className="text-lg font-semibold">Warum Kunden dieses Produkt kaufen</h2>
        <p className="mt-1 text-xs text-muted">
          Nicht die Merkmale des Produkts, sondern das Ergebnis, das Kunden damit erreichen wollen — abgeleitet aus
          Produktdaten, dem eigenen Listing, Wettbewerbs-Listings, Bewertungen und dem, wonach vor dem Kauf gesucht wird.
          Die Spalten rechts zeigen, ob Ihr Listing diesen Grund heute belegt.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2">#</th>
                <th className="pr-2">Kaufgrund</th>
                <th className="pr-2">Gewicht</th>
                <th className="pr-2">im Text</th>
                <th>im Bild</th>
              </tr>
            </thead>
            <tbody>
              {p.matrix.map((z) => (
                <tr key={z.id} className="border-b border-hair align-top">
                  <td className="py-2 pr-2 font-mono text-[11px] text-muted">{z.id}</td>
                  <td className="pr-2">
                    <div className="font-medium">{z.resultat}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {z.motiv} · belegt durch {z.quellen.join(", ")}
                    </div>
                    {z.zitat && <div className="mt-1 text-[11px] italic text-muted">„{z.zitat}“</div>}
                  </td>
                  <td className="pr-2 text-[11px] tracking-[0.15em] text-primary-strong" title={`Relevanz ${z.relevanz}/5`}>
                    {"●".repeat(z.relevanz)}
                    <span className="opacity-25">{"●".repeat(5 - z.relevanz)}</span>
                  </td>
                  <td className="pr-2"><AmpelZelle stufe={z.text} /></td>
                  <td><AmpelZelle stufe={z.bild} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Seite 3: Status quo des Listings ──────────────────────────────── */}
      <section className="dok-seite">
        <h2 className="text-lg font-semibold">Was Ihr Listing heute daraus macht</h2>

        {p.listing.dimensionen.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Texte</h3>
            <ul className="mt-2 space-y-1.5">
              {p.listing.dimensionen.map((d, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="w-40 flex-none text-muted">{d.label}</span>
                  {d.score === null ? (
                    <span className="text-[11px] text-muted">nicht bewertbar — Inhalt liegt nicht vor</span>
                  ) : (
                    <>
                      <span className="h-2 w-32 flex-none overflow-hidden rounded-full bg-hair">
                        <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.min(100, d.score)}%` }} />
                      </span>
                      <span className="w-12 flex-none tabular-nums text-xs">{d.score}</span>
                    </>
                  )}
                  {d.befund && <span className="text-xs text-muted">{d.befund}</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        {p.listing.bilder.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">Bilder</h3>
            <p className="mt-1 text-[11px] text-muted">Bewertung je Bild auf einer Skala von 0 bis 5.</p>
            <table className="mt-2 w-full max-w-md text-sm">
              <thead>
                <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1 pr-2">Bild</th>
                  <th className="pr-2">Design</th>
                  <th className="pr-2">Botschaft</th>
                  <th>Klarheit</th>
                </tr>
              </thead>
              <tbody>
                {p.listing.bilder.map((b) => (
                  <tr key={b.slot} className="border-b border-hair">
                    <td className="py-1 pr-2 tabular-nums">{b.slot}</td>
                    <td className="pr-2 tabular-nums">{note(b.design)}</td>
                    <td className="pr-2 tabular-nums">{note(b.botschaft)}</td>
                    <td className="tabular-nums">{note(b.klarheit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {p.listing.ballast.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">Merkmale, die Platz belegen, ohne einen Kaufgrund zu stützen</h3>
            <ul className="mt-2 space-y-1">
              {p.listing.ballast.map((b, i) => (
                <li key={i} className="text-sm">
                  · {b.feature}
                  {b.prominent && <span className="ml-1 text-[11px] text-bad">an prominenter Stelle</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── Seite 4: Handlungsplan ────────────────────────────────────────── */}
      <section className="dok-seite">
        <h2 className="text-lg font-semibold">Was wir konkret ändern</h2>
        <p className="mt-1 text-xs text-muted">
          Jede Maßnahme verweist auf den Kaufgrund, den sie belegt — nichts steht ohne Begründung im Plan.
        </p>

        {p.handlungsplan.text.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Texte</h3>
            <ol className="mt-2 space-y-2">
              {p.handlungsplan.text.map((m, i) => (
                <li key={i} className="text-sm">
                  <span className="mr-1.5 font-mono text-[11px] text-primary-strong">{m.driverIds.join(", ")}</span>
                  {m.massnahme}
                </li>
              ))}
            </ol>
          </>
        )}

        {p.handlungsplan.bild.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">Bilder</h3>
            <ol className="mt-2 space-y-2">
              {p.handlungsplan.bild.map((m, i) => (
                <li key={i} className="text-sm">
                  <span className="mr-1.5 font-mono text-[11px] text-primary-strong">{m.driverIds.join(", ")}</span>
                  {m.slot !== null && <span className="mr-1 text-muted">Bild {m.slot}:</span>}
                  {m.massnahme}
                </li>
              ))}
            </ol>
          </>
        )}

        {p.handlungsplan.text.length === 0 && p.handlungsplan.bild.length === 0 && (
          <p className="mt-4 text-sm">✓ Jeder belegte Kaufgrund ist im Listing bewiesen — kein Handlungsbedarf aus dieser Analyse.</p>
        )}

        {p.risiken.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-semibold">Erwartungen, die wir ehrlich setzen sollten</h3>
            <p className="mt-1 text-[11px] text-muted">
              Themen, die kein Werbetext wegversprechen darf — sie wirken auf Retouren und Bewertungen.
            </p>
            <ul className="mt-2 space-y-1.5">
              {p.risiken.map((r, i) => (
                <li key={i} className="text-sm">
                  <b>{r.titel}</b> — <span className="text-muted">{r.beschreibung}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── Grenzen: der Vertrauensbeweis, nicht das Kleingedruckte ───────── */}
      <section className="dok-seite">
        <h2 className="text-sm font-semibold">Grenzen dieser Analyse</h2>
        <p className="mt-1 text-xs text-muted">
          Was wir nicht messen konnten, sagen wir — nur so ist der Rest belastbar.
        </p>
        <ul className="mt-3 space-y-1.5">
          {p.grenzen.map((g, i) => <li key={i} className="text-xs text-muted">· {g}</li>)}
          {p.grenzen.length === 0 && <li className="text-xs text-muted">· Keine Einschränkungen zu berichten.</li>}
        </ul>
        <p className="mt-6 text-[11px] text-muted">
          Alle Zahlen stammen aus den genannten Quellen. Wo eine Angabe fehlt, steht „nicht bewertbar“ — geschätzte
          Werte enthält dieses Dokument nicht.
        </p>
      </section>
    </article>
  );
}
