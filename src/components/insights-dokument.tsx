import type { Ampel, InsightsReportPayload } from "@/lib/reports/insightsDokument";

/**
 * Darstellung des Insights-Dokuments (D267, neu aufgebaut in D277) — dieselbe
 * Seite ist der Ausdruck. Kein zweites Layout für PDF: die Print-Regeln stehen
 * in `globals.css` (`.dok-seite`), damit Bildschirm und Papier nie
 * auseinanderlaufen.
 *
 * Kapitelfolge (Nutzer-Vorgabe 02.08.2026) — vom Befund zur Maßnahme:
 *   1 Titelblock: Produkt, Kernthese, Kennzahlen, Datenbasis
 *   2 Was Kunden sagen — positive und negative Findings mit Beleg
 *   3 Was das Produkt auszeichnet — belegbare USPs
 *   4 Warum Kunden kaufen — die Kaufgrund-Matrix mit Abdeckungs-Ampel
 *   5 Was den Kauf heute blockiert — Blocker + Merkmale ohne Kaufgrund
 *   6 Was wir konkret ändern — Handlungsplan
 *
 * RAUS (Nutzer-Vorgabe): „Grenzen dieser Analyse“, „Erwartungen, die wir ehrlich
 * setzen sollten“ und die Noten-Tabelle der aktuellen Bilder. Alles drei ist
 * intern weiter vorhanden — im Kunden-Dokument war es Ballast, der von den
 * Befunden ablenkte.
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

function AmpelZelle({ stufe }: { stufe: Ampel }) {
  const a = AMPEL[stufe];
  return (
    <span className={`whitespace-nowrap ${a.klasse}`} title={a.text}>
      {a.zeichen} <span className="text-[11px]">{a.text}</span>
    </span>
  );
}

/** Kapitel-Kopf: Nummer, Titel, ein Satz Einordnung. Hält den Rhythmus über alle Seiten. */
function Kapitel({ nr, titel, unter, children }: { nr: number; titel: string; unter?: string; children: React.ReactNode }) {
  return (
    <section className="dok-seite">
      <div className="dok-kapitelkopf">
        <span className="dok-nummer">{String(nr).padStart(2, "0")}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{titel}</h2>
          {unter && <p className="mt-0.5 text-xs leading-snug text-muted">{unter}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Eine Findings-Spalte (positiv oder negativ) — Label, Beleg-Zahl, ein O-Ton. */
function FindingListe({
  titel,
  eintraege,
  ton,
}: {
  titel: string;
  eintraege: InsightsReportPayload["findings"]["positiv"];
  ton: "gut" | "schlecht";
}) {
  const farbe = ton === "gut" ? "text-good" : "text-bad";
  const zeichen = ton === "gut" ? "+" : "−";
  return (
    <div>
      <h3 className={`text-sm font-semibold ${farbe}`}>{titel}</h3>
      {eintraege.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Keine belastbaren Muster in dieser Richtung.</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {eintraege.map((f, i) => (
            <li key={i} className="dok-finding">
              <div className="flex items-baseline gap-2">
                <span className={`flex-none font-semibold ${farbe}`}>{zeichen}</span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{f.label}</span>
                {f.nennungen !== null && (
                  <span className="flex-none text-[11px] tabular-nums text-muted" title="Bewertungen mit verifizierter Fundstelle">
                    {fmt(f.nennungen)}×
                  </span>
                )}
              </div>
              {f.zitat && <p className="mt-1 pl-4 text-[11px] italic leading-snug text-muted">„{f.zitat}“</p>}
              {/* D275: Befunde ohne eigene Fundstelle sind ein Marktsignal, kein
                  Urteil über dieses Produkt — das muss beim Kunden dranstehen. */}
              {f.nurFremd && (
                <p className="mt-1 pl-4 text-[11px] text-warn">Aus Bewertungen von Vergleichsprodukten, nicht von diesem Produkt.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InsightsDokument({ p, version }: { p: InsightsReportPayload; version: number }) {
  const db = p.datenbasis;
  const stand = new Date(p.kopf.stand);
  const hatFindings = p.findings.positiv.length > 0 || p.findings.negativ.length > 0;

  return (
    <article className="dok mx-auto max-w-3xl">
      {/* ── 1 · Titelblock ────────────────────────────────────────────────── */}
      <section className="dok-seite">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Listing-Analyse · {p.kopf.marktplatz}</div>
        <h1 className="mt-1.5 text-3xl font-semibold leading-tight">{p.kopf.produktName}</h1>
        <p className="mt-1.5 text-xs text-muted">
          {p.kopf.asin && <span className="font-mono">{p.kopf.asin}</span>}
          {p.kopf.asin && " · "}
          Stand {stand.toLocaleDateString("de-DE")} · Version {version}
        </p>

        {p.kernThese && (
          <blockquote className="mt-6 border-l-[3px] border-l-[var(--primary)] bg-[var(--primary-soft)] px-5 py-4 text-[15px] leading-relaxed">
            {p.kernThese}
          </blockquote>
        )}

        {p.kennzahlen.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            {p.kennzahlen.map((k, i) => (
              <div key={i} className="rounded-xl border border-hair p-4">
                <div className="text-2xl font-semibold tabular-nums">{k.wert}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Datenbasis als Fußzeile des Titelblocks: Vertrauensanker, aber nicht
            die Hauptbotschaft — deshalb klein und unten, kein eigenes Kapitel. */}
        <div className="mt-6 border-t border-hair pt-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Datenbasis</div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {db.reviewsAmazon !== null ? (
              <>
                {fmt(db.reviewsAmazon)} Bewertungen auf Amazon
                {db.ratingAvg !== null && <> (Ø {db.ratingAvg.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ★)</>}
                {db.reviewsAnalysiert > 0 && <>, davon {fmt(db.reviewsAnalysiert)} im Detail ausgewertet</>}
              </>
            ) : (
              <>{fmt(db.reviewsAnalysiert)} Bewertungen im Detail ausgewertet</>
            )}
            {db.wettbewerberAsins > 0 && <> · Bewertungen aus {db.wettbewerberAsins} Vergleichsprodukt(en)</>}
            {db.wettbewerberListings > 0 && <> · {db.wettbewerberListings} Wettbewerber-Listing(s) im Vergleich</>}
            {db.bilderAnalysiert > 0 && <> · {db.bilderAnalysiert} Bilder inhaltlich ausgewertet</>}
            {db.keywordsMitVolumen > 0 && <> · {fmt(db.keywordsMitVolumen)} Suchbegriffe mit Suchvolumen</>}.
          </p>
        </div>
      </section>

      {/* ── 2 · Was Kunden sagen ──────────────────────────────────────────── */}
      {hatFindings && (
        <Kapitel
          nr={2}
          titel="Was Kunden sagen"
          unter="Wörtlich aus den Bewertungen — was gelobt und was kritisiert wird, mit der Zahl der Bewertungen, in denen wir es belegen konnten."
        >
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <FindingListe titel="Was gut ankommt" eintraege={p.findings.positiv} ton="gut" />
            <FindingListe titel="Was kritisiert wird" eintraege={p.findings.negativ} ton="schlecht" />
          </div>
        </Kapitel>
      )}

      {/* ── 3 · USPs ──────────────────────────────────────────────────────── */}
      {p.usps.length > 0 && (
        <Kapitel nr={3} titel="Was das Produkt auszeichnet" unter="Belegbare Alleinstellungsmerkmale aus Produktdaten und Listing — keine Werbeaussagen.">
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.usps.map((u, i) => (
              <li key={i} className="dok-finding flex items-baseline gap-2 rounded-xl border border-hair px-4 py-3 text-sm leading-snug">
                <span className="flex-none text-good">✓</span>
                <span className="min-w-0">{u}</span>
              </li>
            ))}
          </ul>
        </Kapitel>
      )}

      {/* ── 4 · Kaufgründe (das Herzstück) ────────────────────────────────── */}
      <Kapitel
        nr={4}
        titel="Warum Kunden dieses Produkt kaufen"
        unter="Nicht die Merkmale, sondern das Ergebnis, das Kunden erreichen wollen. Die Spalten rechts zeigen, ob Ihr Listing diesen Grund heute belegt."
      >
        <div className="mt-4 overflow-x-auto">
          <table className="dok-tabelle w-full text-sm">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Kaufgrund</th>
                <th className="w-20">Gewicht</th>
                <th className="w-24">im Text</th>
                <th className="w-24">im Bild</th>
              </tr>
            </thead>
            <tbody>
              {p.matrix.map((z) => (
                <tr key={z.id} className="align-top">
                  <td className="font-mono text-[11px] text-muted">{z.id}</td>
                  <td>
                    <div className="font-medium leading-snug">{z.resultat}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted">
                      {z.motiv} · belegt durch {z.quellen.join(", ")}
                    </div>
                    {/* D278: Warum das ein Kaufgrund ist — ein Satz statt nur einer
                        Klassen-Bezeichnung, sonst bleibt die Matrix behauptend. */}
                    {z.einordnung && <div className="mt-1 text-[11px] leading-snug text-muted">{z.einordnung}</div>}
                    {z.zitat && <div className="mt-1 text-[11px] italic leading-snug text-muted">„{z.zitat}“</div>}
                  </td>
                  <td className="text-[11px] tracking-[0.15em] text-primary-strong" title={`Relevanz ${z.relevanz}/5`}>
                    {"●".repeat(z.relevanz)}
                    <span className="opacity-25">{"●".repeat(5 - z.relevanz)}</span>
                  </td>
                  <td><AmpelZelle stufe={z.text} /></td>
                  <td><AmpelZelle stufe={z.bild} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {p.listing.dimensionen.length > 0 && (
          <>
            <h3 className="mt-7 text-sm font-semibold">Qualität der Listing-Texte heute</h3>
            <ul className="mt-2 space-y-1.5">
              {p.listing.dimensionen.map((d, i) => (
                <li key={i} className="dok-finding flex items-baseline gap-3 text-sm">
                  <span className="w-40 flex-none text-muted">{d.label}</span>
                  {d.score === null ? (
                    <span className="text-[11px] text-muted">nicht bewertbar — Inhalt liegt nicht vor</span>
                  ) : (
                    <>
                      <span className="h-2 w-32 flex-none overflow-hidden rounded-full bg-hair">
                        <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.min(100, d.score)}%` }} />
                      </span>
                      <span className="w-10 flex-none tabular-nums text-xs">{d.score}</span>
                    </>
                  )}
                  {d.befund && <span className="min-w-0 text-xs leading-snug text-muted">{d.befund}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Kapitel>

      {/* ── 5 · Blocker ───────────────────────────────────────────────────── */}
      {(p.blocker.length > 0 || p.ballast.length > 0) && (
        <Kapitel
          nr={5}
          titel="Was den Kauf heute blockiert"
          unter="Kaufgründe, für die das Listing keinen Beweis liefert — und Merkmale, die Platz belegen, ohne einen Kaufgrund zu stützen."
        >
          {p.blocker.length > 0 && (
            <ul className="mt-4 space-y-3">
              {p.blocker.map((b, i) => (
                <li key={i} className="dok-finding rounded-xl border border-hair p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] text-primary-strong">{b.driverId}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{b.titel}</span>
                    <span className="flex-none rounded-full bg-hair px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      {b.art === "bild" ? "Bild" : "Text"}
                    </span>
                  </div>
                  {/* D278: Der Fließtext ist der eigentliche Inhalt — vorher stand
                      hier nur der Titelsatz, und das Dokument las sich entsprechend
                      dünn („vermisst eigentlich sämtliche Informationen"). */}
                  {b.begruendung && <p className="mt-2 text-sm leading-relaxed">{b.begruendung}</p>}
                  {b.resultat && <p className="mt-1.5 text-[11px] leading-snug text-muted">Betrifft den Kaufgrund: {b.resultat}</p>}
                </li>
              ))}
            </ul>
          )}

          {p.ballast.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold">Merkmale ohne Kaufgrund</h3>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                Sie kosten Aufmerksamkeit an einer Stelle, an der ein Kaufgrund stehen könnte.
              </p>
              <ul className="mt-2 space-y-1">
                {p.ballast.map((b, i) => (
                  <li key={i} className="dok-finding text-sm leading-snug">
                    · {b.feature}
                    {b.prominent && <span className="ml-1.5 text-[11px] text-bad">an prominenter Stelle</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Kapitel>
      )}

      {/* ── 6 · Handlungsplan ─────────────────────────────────────────────── */}
      <Kapitel nr={6} titel="Was wir konkret ändern" unter="Jede Maßnahme verweist auf den Kaufgrund, den sie belegt — nichts steht ohne Begründung im Plan.">
        {p.handlungsplan.text.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Texte</h3>
            <ol className="mt-2 space-y-2">
              {p.handlungsplan.text.map((m, i) => (
                <li key={i} className="dok-finding text-sm leading-snug">
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
                <li key={i} className="dok-finding text-sm leading-snug">
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

        <p className="mt-8 border-t border-hair pt-3 text-[10px] leading-relaxed text-muted">
          Alle Zahlen stammen aus den genannten Quellen. Wo eine Angabe fehlt, steht „nicht bewertbar“ — geschätzte Werte
          enthält dieses Dokument nicht.
        </p>
      </Kapitel>
    </article>
  );
}
